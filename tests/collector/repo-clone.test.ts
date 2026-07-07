import { access, mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __setGitExecForTests } from '~/collector/pr-size-sync'
import {
  __setCloneExecForTests,
  clearCloneTmpDir,
  cloneOrUpdateRepository,
  RepoCloneError,
} from '~/collector/repo-clone'

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath)
    return true
  } catch {
    return false
  }
}

/**
 * Simulates `git clone <target>` by creating a directory there with a `.git`
 * marker — real tests never touch the network. The `.git` marker matters:
 * `isRenameRaceLoss` fingerprints `target/.git` to tell a real race loss from a
 * genuine permission fault, so a realistic fake clone must produce one.
 */
function fakeCloneExec(calls: string[][]) {
  return async (args: readonly string[]) => {
    calls.push([...args])
    await mkdir(path.join(args[args.length - 1]!, '.git'), { recursive: true })
  }
}

describe('cloneOrUpdateRepository', () => {
  let root: string

  beforeEach(async () => {
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true })
    root = await mkdtemp(path.join(process.cwd(), '.tmp', 'repo-clone-'))
  })

  afterEach(async () => {
    __setCloneExecForTests(null)
    __setGitExecForTests(null)
    await rm(root, { recursive: true, force: true })
  })

  it('clones_when_repo_is_missing', async () => {
    const calls: string[][] = []
    __setCloneExecForTests(fakeCloneExec(calls))

    const action = await cloneOrUpdateRepository(root, 'acme', 'svc')

    expect(action).toBe('cloned')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.slice(0, 4)).toEqual([
      'clone',
      '--quiet',
      '--filter=blob:none',
      'https://github.com/acme/svc.git',
    ])
    // Cloned into a temp dir under repoRoot, not directly at the final path.
    expect(calls[0]?.[4]).toMatch(/[\\/]\.clone-tmp[\\/]svc-/)
    // ...then renamed into place, so the final path is what callers see.
    expect(await pathExists(path.join(root, 'svc'))).toBe(true)
    expect(await pathExists(calls[0]![4]!)).toBe(false)
  })

  it('fetches_when_repo_is_already_cloned_and_healthy', async () => {
    await mkdir(path.join(root, 'svc', '.git'), { recursive: true })
    __setCloneExecForTests(async (args) => {
      if (args[2] === 'rev-parse') return
      throw new Error(`unexpected clone-exec call: ${args.join(' ')}`)
    })
    __setGitExecForTests(async (_repoPath, gitArgs) => {
      if (gitArgs[0] === 'fetch') return ''
      throw new Error(`unexpected git call: ${gitArgs.join(' ')}`)
    })

    const action = await cloneOrUpdateRepository(root, 'acme', 'svc')

    expect(action).toBe('updated')
  })

  it('repairs_when_existing_clone_has_no_resolvable_head', async () => {
    const target = path.join(root, 'svc')
    await mkdir(path.join(target, '.git'), { recursive: true })
    const cloneCalls: string[][] = []
    const fakeClone = fakeCloneExec(cloneCalls)
    __setCloneExecForTests(async (args) => {
      if (args[2] === 'rev-parse') throw new Error('fatal: bad revision HEAD')
      await fakeClone(args)
    })

    const action = await cloneOrUpdateRepository(root, 'acme', 'svc')

    expect(action).toBe('repaired')
    expect(cloneCalls).toHaveLength(1)
    expect(cloneCalls[0]?.[0]).toBe('clone')
    // The broken clone was moved aside and the fresh one swapped into place —
    // no window where `target` is a directly-populated, half-cloned directory.
    expect(await pathExists(target)).toBe(true)
    expect(await pathExists(cloneCalls[0]![4]!)).toBe(false)
  })

  it('leaves_the_broken_clone_untouched_when_the_repair_clone_itself_fails', async () => {
    // If cloneIntoTemp fails partway through a repair (e.g. a network error
    // re-cloning a broken repo), nothing has touched `target` yet — the
    // move-aside step runs after the clone, not before — so the original
    // broken clone is left exactly as it was, self-healing on the next run
    // instead of leaving `target` missing or a stray temp/stale directory behind.
    const target = path.join(root, 'svc')
    await mkdir(path.join(target, '.git'), { recursive: true })
    __setCloneExecForTests(async (args) => {
      if (args[2] === 'rev-parse') throw new Error('fatal: bad revision HEAD')
      throw new Error('fatal: unable to access remote: network error')
    })

    await expect(cloneOrUpdateRepository(root, 'acme', 'svc')).rejects.toThrow(RepoCloneError)

    // The original broken clone is untouched — no move-aside happened.
    expect(await pathExists(path.join(target, '.git'))).toBe(true)
    // No orphaned temp clone left behind from the failed attempt.
    const tmpEntries = await readdir(path.join(root, '.clone-tmp')).catch(() => [])
    expect(tmpEntries).toEqual([])
  })

  it('two_concurrent_fresh_clones_of_the_same_target_never_produce_mixed_content', async () => {
    // Simulates a zombie-reclaim racing a still-alive writer: two callers
    // both decide `svc` needs a fresh clone and both call
    // cloneOrUpdateRepository for it at once. The DB single-flight guard is
    // supposed to prevent two pipeline runs from reaching this point
    // concurrently in the first place (see tests/collector/single-flight.test.ts)
    // — this test proves the filesystem layer itself is also safe if that
    // guard is ever bypassed. Fresh clone (not repair) is the scenario that
    // actually exercises swapIntoPlace's loser branch: a repair always
    // clears `target` via its own move-aside step first, so two concurrent
    // repairs never truly contend for the same occupied path the way two
    // concurrent fresh clones do.
    let callIndex = 0
    const cloneCalls: string[][] = []
    __setCloneExecForTests(async (args) => {
      const index = callIndex++
      cloneCalls.push([...args])
      const tmpDir = args[args.length - 1]!
      await mkdir(path.join(tmpDir, '.git'), { recursive: true })
      // Each writer marks its own temp clone with a unique sentinel, so the
      // final content can be attributed to exactly one writer, not just
      // "a directory exists." The clone invoked first (index 0) finishes
      // immediately; the second (index 1) is delayed, so the swap race
      // deterministically has a winner and a loser every run instead of
      // depending on real timing.
      await writeFile(path.join(tmpDir, 'writer-marker'), String(index), 'utf8')
      if (index === 1) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    })

    const [a, b] = await Promise.all([
      cloneOrUpdateRepository(root, 'acme', 'svc'),
      cloneOrUpdateRepository(root, 'acme', 'svc'),
    ])

    expect(a).toBe('cloned')
    expect(b).toBe('cloned')
    expect(cloneCalls).toHaveLength(2)

    // The surviving `target` holds exactly one writer's marker in full —
    // never a mix of both, and never neither — proving the loser's clone
    // was discarded wholesale rather than merged or partially applied.
    const target = path.join(root, 'svc')
    const survivingMarker = await readFile(path.join(target, 'writer-marker'), 'utf8')
    expect(['0', '1']).toContain(survivingMarker)

    // No leftover temp directories from the loser.
    for (const call of cloneCalls) {
      expect(await pathExists(call[4]!)).toBe(false)
    }
  })

  it('throws_repo_clone_error_when_fetch_fails_on_healthy_clone', async () => {
    await mkdir(path.join(root, 'svc', '.git'), { recursive: true })
    __setCloneExecForTests(async (args) => {
      if (args[2] === 'rev-parse') return
      throw new Error(`unexpected clone-exec call: ${args.join(' ')}`)
    })
    __setGitExecForTests(async (_repoPath, gitArgs) => {
      if (gitArgs[0] === 'fetch') throw new Error('git fetch failed: network error')
      throw new Error(`unexpected git call: ${gitArgs.join(' ')}`)
    })

    await expect(cloneOrUpdateRepository(root, 'acme', 'svc')).rejects.toThrow(RepoCloneError)
  })

  it('throws_repo_clone_error_when_clone_command_fails', async () => {
    __setCloneExecForTests(async () => {
      throw new Error('fatal: repository not found')
    })

    await expect(cloneOrUpdateRepository(root, 'acme', 'missing')).rejects.toThrow(RepoCloneError)
  })

  it('reports_a_timeout_distinctly_from_a_genuine_clone_failure', async () => {
    // Node kills a timed-out execFile with SIGTERM and sets `killed: true`;
    // stderr is typically empty at that point since the process died before
    // writing anything — the generic "failed: <message>" text would look
    // identical to a real git error with no diagnostic info at all.
    __setCloneExecForTests(async () => {
      const err = new Error('Command failed: git clone --quiet https://github.com/acme/slow.git') as Error & {
        killed: boolean
        signal: string
      }
      err.killed = true
      err.signal = 'SIGTERM'
      throw err
    })

    await expect(cloneOrUpdateRepository(root, 'acme', 'slow')).rejects.toMatchObject({
      name: 'RepoCloneError',
      message: expect.stringContaining('timed out'),
    })
  })
})

describe('clearCloneTmpDir', () => {
  let root: string

  beforeEach(async () => {
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true })
    root = await mkdtemp(path.join(process.cwd(), '.tmp', 'clear-clone-tmp-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const MAX_AGE_MS = 120_000

  it('removes_staging_directories_orphaned_by_a_prior_crashed_run', async () => {
    const orphaned = path.join(root, '.clone-tmp', 'svc-orphaned')
    await mkdir(orphaned, { recursive: true })
    await writeFile(path.join(orphaned, 'marker'), 'x', 'utf8')
    // Backdate past the max age so it counts as an orphan from a crashed run.
    const old = new Date(Date.now() - 10 * MAX_AGE_MS)
    await utimes(orphaned, old, old)

    await clearCloneTmpDir(root, MAX_AGE_MS)

    expect(await pathExists(orphaned)).toBe(false)
  })

  it('preserves_fresh_staging_from_a_concurrent_live_run', async () => {
    // A concurrent run's in-flight staging is younger than the max age and must
    // survive — wiping it would corrupt that run's clone if the single-flight
    // guard is ever bypassed, the exact case temp+rename must tolerate.
    const inFlight = path.join(root, '.clone-tmp', 'svc-live')
    await mkdir(inFlight, { recursive: true })
    await writeFile(path.join(inFlight, 'marker'), 'x', 'utf8')

    await clearCloneTmpDir(root, MAX_AGE_MS)

    expect(await pathExists(inFlight)).toBe(true)
  })

  it('is_a_no_op_when_clone_tmp_does_not_exist', async () => {
    await expect(clearCloneTmpDir(root, MAX_AGE_MS)).resolves.toBeUndefined()
  })
})

import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __setGitExecForTests } from '~/collector/pr-size-sync'
import { __setCloneExecForTests, cloneOrUpdateRepository, RepoCloneError } from '~/collector/repo-clone'

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
    __setCloneExecForTests(async (args) => {
      calls.push([...args])
    })

    const action = await cloneOrUpdateRepository(root, 'acme', 'svc')

    expect(action).toBe('cloned')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual([
      'clone',
      '--quiet',
      '--filter=blob:none',
      'https://github.com/acme/svc.git',
      path.join(root, 'svc'),
    ])
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
    __setCloneExecForTests(async (args) => {
      if (args[2] === 'rev-parse') throw new Error('fatal: bad revision HEAD')
      cloneCalls.push([...args])
    })

    const action = await cloneOrUpdateRepository(root, 'acme', 'svc')

    expect(action).toBe('repaired')
    expect(cloneCalls).toHaveLength(1)
    expect(cloneCalls[0]?.[0]).toBe('clone')
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
})

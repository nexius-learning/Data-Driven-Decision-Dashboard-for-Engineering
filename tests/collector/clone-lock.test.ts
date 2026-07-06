import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { withCloneLock } from '~/collector/clone-lock'

describe('withCloneLock', () => {
  let root: string

  beforeEach(async () => {
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true })
    root = await mkdtemp(path.join(process.cwd(), '.tmp', 'clone-lock-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('runs_and_releases_the_lock_when_free', async () => {
    const result = await withCloneLock(root, async () => 'done')
    expect(result).toEqual({ ran: true, result: 'done' })
    // Lock directory should be gone after a successful run.
    const again = await withCloneLock(root, async () => 'second')
    expect(again).toEqual({ ran: true, result: 'second' })
  })

  it('releases_the_lock_even_when_fn_throws', async () => {
    await expect(withCloneLock(root, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    const after = await withCloneLock(root, async () => 'recovered')
    expect(after).toEqual({ ran: true, result: 'recovered' })
  })

  it('skips_when_a_fresh_lock_is_already_held', async () => {
    const lockDir = path.join(root, '.clone-in-progress')
    await mkdir(lockDir)
    await writeFile(path.join(lockDir, 'started-at'), new Date().toISOString(), 'utf8')

    let called = false
    const result = await withCloneLock(root, async () => {
      called = true
      return 'x'
    })

    expect(result).toEqual({ ran: false })
    expect(called).toBe(false)
  })

  it('reclaims_a_stale_lock', async () => {
    const lockDir = path.join(root, '.clone-in-progress')
    await mkdir(lockDir)
    const staleTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3h ago
    await writeFile(path.join(lockDir, 'started-at'), staleTimestamp, 'utf8')

    const result = await withCloneLock(root, async () => 'reclaimed')

    expect(result).toEqual({ ran: true, result: 'reclaimed' })
  })

  it('reclaims_a_lock_with_an_unreadable_marker', async () => {
    const lockDir = path.join(root, '.clone-in-progress')
    await mkdir(lockDir)
    // No started-at file at all — treated the same as unreadable/corrupt.

    const result = await withCloneLock(root, async () => 'reclaimed')

    expect(result).toEqual({ ran: true, result: 'reclaimed' })
  })
})

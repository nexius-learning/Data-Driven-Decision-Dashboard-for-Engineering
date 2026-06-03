import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'

import type { GitHubClient } from '~/collector/github-client'
import { GitHubSyncError } from '~/collector/github-client'
import { updatePrSize } from '~/collector/pr-size-store'
import type { AppDb } from '~/db/client'
import { pullRequests, syncErrors } from '~/db/schema'

const execFile = promisify(execFileCb)

const PARTIAL_FAILURE_RATIO = 0.1

export type PrSizeSyncCounts = {
  ok: number
  skipped: number
  failed: number
}

export function isPrSizeSyncPartial(counts: PrSizeSyncCounts): boolean {
  const total = counts.ok + counts.skipped + counts.failed
  if (total === 0) {
    return false
  }
  return counts.failed / total >= PARTIAL_FAILURE_RATIO
}

export class GitOpError extends Error {
  override readonly name = 'GitOpError'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}

export type GitExecFn = (
  repoPath: string,
  gitArgs: readonly string[],
  timeoutMs: number,
) => Promise<string>

let gitExecOverride: GitExecFn | null = null
let fetchRepoOverride: typeof fetchRepo | null = null
let detectMergeStrategyOverride: typeof detectMergeStrategy | null = null
let findCommitForPrOverride: typeof findCommitForPr | null = null

/** @internal Test hook — do not use in production code. */
export function __setGitExecForTests(fn: GitExecFn | null): void {
  gitExecOverride = fn
}

/** @internal Test hook — do not use in production code. */
export function __setFetchRepoForTests(fn: typeof fetchRepo | null): void {
  fetchRepoOverride = fn
}

/** @internal Test hook — do not use in production code. */
export function __setDetectMergeStrategyForTests(fn: typeof detectMergeStrategy | null): void {
  detectMergeStrategyOverride = fn
}

/** @internal Test hook — do not use in production code. */
export function __setFindCommitForPrForTests(fn: typeof findCommitForPr | null): void {
  findCommitForPrOverride = fn
}

async function runGit(repoPath: string, gitArgs: readonly string[], timeoutMs: number): Promise<string> {
  if (gitExecOverride) {
    return gitExecOverride(repoPath, gitArgs, timeoutMs)
  }

  try {
    const { stdout } = await execFile('git', ['-C', repoPath, ...gitArgs], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
      timeout: timeoutMs,
    })
    return stdout
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new GitOpError(`git ${gitArgs[0] ?? 'command'} failed: ${message}`, { cause: error })
  }
}

export async function detectMergeStrategy(
  sha: string,
  repoPath: string,
  prNumber: number,
): Promise<'merge' | 'squash' | 'rebase'> {
  const revListOut = await runGit(repoPath, ['rev-list', '--parents', '-1', sha], 10_000)
  const tokens = revListOut.trim().split(/\s+/).filter((token) => token.length > 0)
  const parentCount = Math.max(0, tokens.length - 1)

  if (parentCount >= 2) {
    return 'merge'
  }

  if (parentCount === 0) {
    throw new GitOpError(`commit ${sha} has no parents (root or orphan)`)
  }

  const subjectOut = await runGit(repoPath, ['log', '-1', '--format=%s', sha], 10_000)
  const firstLine = subjectOut.trim().split('\n')[0] ?? ''
  const squashSuffix = `(#${prNumber})`

  if (firstLine.endsWith(squashSuffix)) {
    return 'squash'
  }

  return 'rebase'
}

function parseGitDiffShortstat(output: string): {
  additions: number
  deletions: number
  changedFiles: number
} {
  const trimmed = output.trim()
  if (trimmed === '') {
    return { additions: 0, deletions: 0, changedFiles: 0 }
  }

  const filesMatch = trimmed.match(/(\d+) files? changed/)
  const insertionsMatch = trimmed.match(/(\d+) insertions?\(\+\)/)
  const deletionsMatch = trimmed.match(/(\d+) deletions?\(-\)/)

  return {
    changedFiles: filesMatch ? Number(filesMatch[1]) : 0,
    additions: insertionsMatch ? Number(insertionsMatch[1]) : 0,
    deletions: deletionsMatch ? Number(deletionsMatch[1]) : 0,
  }
}

export async function runGitDiffShortstat(
  sha: string,
  repoPath: string,
): Promise<{ additions: number; deletions: number; changedFiles: number }> {
  try {
    const output = await runGit(repoPath, ['diff', `${sha}^1`, sha, '--shortstat'], 30_000)
    return parseGitDiffShortstat(output)
  } catch (error) {
    if (error instanceof GitOpError) {
      const message = error.message
      if (
        message.includes('Invalid revision') ||
        message.includes('unknown revision') ||
        message.includes('bad revision')
      ) {
        throw new GitOpError(`git diff failed: root commit or missing parent for ${sha}`, {
          cause: error,
        })
      }
    }
    throw error
  }
}

function isMissingLocalGitObjectError(error: unknown): boolean {
  if (!(error instanceof GitOpError)) {
    return false
  }
  const message = error.message
  return (
    message.includes('bad object') ||
    message.includes('could not get object info') ||
    message.includes('unknown revision') ||
    message.includes('bad revision')
  )
}

export async function fetchRepo(
  repoPath: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await runGit(repoPath, ['fetch', '--quiet'], 120_000)
    return { ok: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, reason }
  }
}

const DEFAULT_BRANCH_REFS = ['origin/HEAD', 'origin/main', 'origin/master'] as const

type MergeBaseAncestorResult = 'ancestor' | 'not-ancestor' | 'unavailable'

function gitExitCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'number') {
      return code
    }
  }
  return undefined
}

async function tryMergeBaseIsAncestor(
  sha: string,
  repoPath: string,
  ref: string,
): Promise<MergeBaseAncestorResult> {
  const gitArgs = ['merge-base', '--is-ancestor', sha, ref] as const
  const timeoutMs = 10_000

  try {
    if (gitExecOverride) {
      await gitExecOverride(repoPath, gitArgs, timeoutMs)
    } else {
      await execFile('git', ['-C', repoPath, ...gitArgs], {
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C' },
        timeout: timeoutMs,
      })
    }
    return 'ancestor'
  } catch (error) {
    if (gitExitCode(error) === 1) {
      return 'not-ancestor'
    }
    return 'unavailable'
  }
}

export async function isAncestorOfDefaultBranch(
  sha: string,
  repoPath: string,
): Promise<{ ancestor: boolean; warning?: string }> {
  for (const ref of DEFAULT_BRANCH_REFS) {
    const result = await tryMergeBaseIsAncestor(sha, repoPath, ref)
    if (result === 'ancestor') {
      return { ancestor: true }
    }
    if (result === 'not-ancestor') {
      return { ancestor: false }
    }
  }

  return { ancestor: false, warning: 'could not verify ancestry; SHA skipped' }
}

const GIT_LOG_TIMEOUT_MS = 30_000

type GitLogCandidate = {
  sha: string
  subject: string
  commitTimeMs: number
}

function gitLogDateBounds(mergedAt: Date): { since: string; until: string } {
  const since = new Date(mergedAt)
  since.setUTCDate(since.getUTCDate() - 30)
  const until = new Date(mergedAt)
  until.setUTCDate(until.getUTCDate() + 1)
  return {
    since: since.toISOString(),
    until: until.toISOString(),
  }
}

function parseGitLogCandidates(output: string): GitLogCandidate[] {
  const candidates: GitLogCandidate[] = []
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') {
      continue
    }
    const parts = trimmed.split('\0')
    if (parts.length < 2) {
      continue
    }
    const sha = parts[0] ?? ''
    if (sha === '') {
      continue
    }
    if (parts.length >= 3) {
      const commitTimeSec = Number(parts[1])
      const subject = parts.slice(2).join('\0')
      if (!Number.isFinite(commitTimeSec)) {
        continue
      }
      candidates.push({ sha, subject, commitTimeMs: commitTimeSec * 1000 })
      continue
    }
    candidates.push({ sha, subject: parts[1] ?? '', commitTimeMs: 0 })
  }
  return candidates
}

function firstSubjectLine(subject: string): string {
  return subject.split('\n')[0] ?? ''
}

function pickClosestToMergedAt(candidates: GitLogCandidate[], mergedAt: Date): string {
  const mergedAtMs = mergedAt.getTime()
  let best = candidates[0]!
  let bestDistance = Math.abs(best.commitTimeMs - mergedAtMs)
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index]!
    const distance = Math.abs(candidate.commitTimeMs - mergedAtMs)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best.sha
}

async function runGitLogPass(
  repoPath: string,
  mergedAt: Date,
  extraArgs: readonly string[],
): Promise<GitLogCandidate[]> {
  const { since, until } = gitLogDateBounds(mergedAt)
  const output = await runGit(
    repoPath,
    [
      'log',
      '--all',
      '--format=%H%x00%ct%x00%s',
      `--since=${since}`,
      `--until=${until}`,
      ...extraArgs,
    ],
    GIT_LOG_TIMEOUT_MS,
  )
  return parseGitLogCandidates(output)
}

async function filterAncestorsAndPickClosest(
  candidates: GitLogCandidate[],
  repoPath: string,
  mergedAt: Date,
): Promise<string | null> {
  const ancestors: GitLogCandidate[] = []
  for (const candidate of candidates) {
    const { ancestor } = await isAncestorOfDefaultBranch(candidate.sha, repoPath)
    if (ancestor) {
      ancestors.push(candidate)
    }
  }
  if (ancestors.length === 0) {
    return null
  }
  if (ancestors.length === 1) {
    return ancestors[0]!.sha
  }
  return pickClosestToMergedAt(ancestors, mergedAt)
}

export async function findCommitForPr(
  prNumber: number,
  mergedAt: Date,
  repoPath: string,
): Promise<string | null> {
  const mergeSubjectPattern = new RegExp(`^Merge pull request #${prNumber} from `)
  const squashSuffix = `(#${prNumber})`

  const pass1Raw = await runGitLogPass(repoPath, mergedAt, [
    `--grep=pull request #${prNumber}`,
  ])
  const pass1Filtered = pass1Raw.filter((entry) =>
    mergeSubjectPattern.test(firstSubjectLine(entry.subject)),
  )
  const pass1Result = await filterAncestorsAndPickClosest(pass1Filtered, repoPath, mergedAt)
  if (pass1Result !== null) {
    return pass1Result
  }

  const pass2Raw = await runGitLogPass(repoPath, mergedAt, [
    '--fixed-strings',
    `--grep=(#${prNumber})`,
  ])
  const pass2Filtered = pass2Raw.filter((entry) =>
    firstSubjectLine(entry.subject).endsWith(squashSuffix),
  )
  return filterAncestorsAndPickClosest(pass2Filtered, repoPath, mergedAt)
}

function pendingSizePrWhere(repositoryId: string) {
  return and(
    eq(pullRequests.repositoryId, repositoryId),
    isNotNull(pullRequests.mergedAt),
    isNull(pullRequests.additions),
  )
}

async function logSizeSyncError(
  db: AppDb,
  input: { syncRunId: string; repositoryId: string; source: string; message: string },
): Promise<void> {
  await db.insert(syncErrors).values({
    syncRunId: input.syncRunId,
    repositoryId: input.repositoryId,
    source: input.source,
    message: input.message,
  })
}

async function computeSizeForPr(
  sha: string,
  prNumber: number,
  repoPath: string,
  owner: string,
  repo: string,
  githubClient: GitHubClient,
): Promise<{ additions: number; deletions: number; changedFiles: number }> {
  const detect = detectMergeStrategyOverride ?? detectMergeStrategy
  let strategy: 'merge' | 'squash' | 'rebase'
  try {
    strategy = await detect(sha, repoPath, prNumber)
  } catch (error) {
    if (isMissingLocalGitObjectError(error)) {
      return githubClient.getPullRequestDetail({ owner, repo, pullNumber: prNumber })
    }
    throw error
  }
  if (strategy === 'rebase') {
    return githubClient.getPullRequestDetail({ owner, repo, pullNumber: prNumber })
  }
  return runGitDiffShortstat(sha, repoPath)
}

export async function syncRepositoryPrSizes(input: {
  db: AppDb
  repoPath: string
  repositoryId: string
  owner: string
  repo: string
  syncRunId: string
  githubClient: GitHubClient
}): Promise<PrSizeSyncCounts> {
  const counts: PrSizeSyncCounts = { ok: 0, skipped: 0, failed: 0 }

  const pendingWhere = pendingSizePrWhere(input.repositoryId)

  const fetch = fetchRepoOverride ?? fetchRepo
  const fetchResult = await fetch(input.repoPath)
  if (!fetchResult.ok) {
    const pendingRows = await input.db
      .select({ id: pullRequests.id })
      .from(pullRequests)
      .where(pendingWhere)
    await logSizeSyncError(input.db, {
      syncRunId: input.syncRunId,
      repositoryId: input.repositoryId,
      source: 'git-fetch-failed',
      message: fetchResult.reason,
    })
    return { ok: 0, skipped: pendingRows.length, failed: 0 }
  }

  const rows = await input.db
    .select({
      id: pullRequests.id,
      number: pullRequests.number,
      mergedAt: pullRequests.mergedAt,
      mergeCommitSha: pullRequests.mergeCommitSha,
    })
    .from(pullRequests)
    .where(pendingWhere)
    .orderBy(asc(pullRequests.number))

  for (const pr of rows) {
    if (pr.mergedAt === null) {
      continue
    }

    let sha = pr.mergeCommitSha
    let backfilledSha: string | undefined

    if (sha === null) {
      const findCommit = findCommitForPrOverride ?? findCommitForPr
      const found = await findCommit(pr.number, pr.mergedAt, input.repoPath)
      if (found === null) {
        counts.skipped += 1
        continue
      }
      sha = found
      backfilledSha = found
    }

    try {
      const size = await computeSizeForPr(
        sha,
        pr.number,
        input.repoPath,
        input.owner,
        input.repo,
        input.githubClient,
      )
      await updatePrSize(input.db, pr.id, {
        additions: size.additions,
        deletions: size.deletions,
        changedFiles: size.changedFiles,
        ...(backfilledSha !== undefined ? { mergeCommitSha: backfilledSha } : {}),
      })
      counts.ok += 1
    } catch (error) {
      const message =
        error instanceof GitHubSyncError || error instanceof GitOpError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error)
      await logSizeSyncError(input.db, {
        syncRunId: input.syncRunId,
        repositoryId: input.repositoryId,
        source: 'git-diff-failed',
        message,
      })
      counts.failed += 1
    }
  }

  return counts
}

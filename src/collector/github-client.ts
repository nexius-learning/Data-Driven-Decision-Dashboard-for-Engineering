export type GitHubPullRequest = {
  githubNodeId: string
  number: number
  title: string
  state: 'open' | 'closed'
  isDraft: boolean
  openedAt: Date
  updatedAt: Date
  mergedAt: Date | null
  mergeCommitSha: string | null
  url: string
}

export type GitHubClientListPullRequestsInput = {
  owner: string
  repo: string
  state: 'all'
  initialSyncFrom?: Date
  stopAfterUpdatedAt?: Date
}

export type GitHubReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'

export type GitHubReview = {
  id: number
  state: GitHubReviewState
  submittedAt: Date | null
  user: { login: string; type: 'User' | 'Bot' | null } | null
}

export type GitHubReviewComment = {
  id: number
  createdAt: Date
}

export type GitHubClientListPullRequestReviewsInput = {
  owner: string
  repo: string
  pullNumber: number
}

export type GitHubOrgRepo = {
  name: string
  archived: boolean
}

export type GitHubSyncErrorCode = 'rate_limited' | 'unauthorized' | 'forbidden' | 'unknown'

export class GitHubSyncError extends Error {
  override name = 'GitHubSyncError'

  readonly code: GitHubSyncErrorCode

  readonly retryAfterSeconds?: number

  constructor(options: { code: GitHubSyncErrorCode; message: string; retryAfterSeconds?: number }) {
    super(options.message)
    this.code = options.code
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

type GitHubClientOptions = {
  token?: string
  baseUrl: string
  fetchImpl?: typeof fetch
}

const PER_PAGE = 100
const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_REQUEST_TIMEOUT_MS = 30_000

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function isSameApiOrigin(apiBaseUrl: string, nextUrl: string): boolean {
  try {
    const base = new URL(trimTrailingSlash(apiBaseUrl))
    const next = new URL(nextUrl, base.href)
    return base.origin === next.origin
  } catch {
    return false
  }
}

function parseRetryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers.get('retry-after')
  if (raw === null || raw.trim() === '') return undefined
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

function parseLinkNext(linkHeader: string | null): string | null {
  if (linkHeader === null || linkHeader.trim() === '') return null
  const m = /<([^>]+)>\s*;\s*rel="next"/i.exec(linkHeader)
  return m?.[1] ?? null
}

function normalizePullRequest(raw: Record<string, unknown>): GitHubPullRequest {
  const nodeId = raw.node_id
  const number = raw.number
  const title = raw.title
  const state = raw.state
  const draft = raw.draft
  const createdAt = raw.created_at
  const updatedAt = raw.updated_at
  const mergedAt = raw.merged_at
  const mergeCommitSha = raw.merge_commit_sha
  const htmlUrl = raw.html_url

  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request missing node_id' })
  }
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request missing number' })
  }
  if (typeof title !== 'string') {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request missing title' })
  }
  if (state !== 'open' && state !== 'closed') {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request has invalid state' })
  }
  if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request missing timestamps' })
  }
  if (typeof htmlUrl !== 'string' || htmlUrl.length === 0) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request missing html_url' })
  }

  const openedAt = new Date(createdAt)
  const updated = new Date(updatedAt)
  if (Number.isNaN(openedAt.getTime()) || Number.isNaN(updated.getTime())) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request has invalid timestamps' })
  }

  let merged: Date | null = null
  if (mergedAt !== null && mergedAt !== undefined) {
    if (typeof mergedAt !== 'string') {
      throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request has invalid merged_at' })
    }
    const m = new Date(mergedAt)
    if (Number.isNaN(m.getTime())) {
      throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request has invalid merged_at' })
    }
    merged = m
  }

  let mergeSha: string | null = null
  if (mergeCommitSha !== null && mergeCommitSha !== undefined) {
    if (typeof mergeCommitSha !== 'string') {
      throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request has invalid merge_commit_sha' })
    }
    if (mergeCommitSha.length > 0) {
      mergeSha = mergeCommitSha
    }
  }

  return {
    githubNodeId: nodeId,
    number,
    title,
    state,
    isDraft: draft === true,
    openedAt,
    updatedAt: updated,
    mergedAt: merged,
    mergeCommitSha: mergeSha,
    url: htmlUrl,
  }
}

function normalizePullRequestDetail(raw: Record<string, unknown>): {
  additions: number
  deletions: number
  changedFiles: number
} {
  const additions = raw.additions
  const deletions = raw.deletions
  const changedFiles = raw.changed_files

  if (typeof additions !== 'number' || !Number.isFinite(additions)) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request detail missing additions' })
  }
  if (typeof deletions !== 'number' || !Number.isFinite(deletions)) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request detail missing deletions' })
  }
  if (typeof changedFiles !== 'number' || !Number.isFinite(changedFiles)) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request detail missing changed_files' })
  }

  return { additions, deletions, changedFiles }
}

const REVIEW_STATES: ReadonlySet<GitHubReviewState> = new Set([
  'APPROVED',
  'CHANGES_REQUESTED',
  'COMMENTED',
  'PENDING',
  'DISMISSED',
])

function normalizeReview(raw: Record<string, unknown>): GitHubReview {
  const id = raw.id
  const state = raw.state
  const submittedAt = raw.submitted_at
  const userRaw = raw.user

  if (typeof id !== 'number' || !Number.isFinite(id)) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review missing id' })
  }
  if (typeof state !== 'string' || !REVIEW_STATES.has(state as GitHubReviewState)) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review has invalid state' })
  }

  let submitted: Date | null = null
  if (submittedAt !== null && submittedAt !== undefined) {
    if (typeof submittedAt !== 'string') {
      throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review has invalid submitted_at' })
    }
    const d = new Date(submittedAt)
    if (Number.isNaN(d.getTime())) {
      throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review has invalid submitted_at' })
    }
    submitted = d
  }

  let user: GitHubReview['user'] = null
  if (userRaw !== null && userRaw !== undefined) {
    if (typeof userRaw !== 'object') {
      throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review has invalid user' })
    }
    const obj = userRaw as Record<string, unknown>
    const login = obj.login
    const type = obj.type
    if (typeof login !== 'string' || login.length === 0) {
      throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review user missing login' })
    }
    const userType = type === 'User' || type === 'Bot' ? type : null
    user = { login, type: userType }
  }

  return { id, state: state as GitHubReviewState, submittedAt: submitted, user }
}

function normalizeOrgRepo(raw: Record<string, unknown>): GitHubOrgRepo {
  const name = raw.name
  if (typeof name !== 'string' || name.length === 0) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub org repo missing name' })
  }
  return { name, archived: raw.archived === true }
}

function normalizeReviewComment(raw: Record<string, unknown>): GitHubReviewComment {
  const id = raw.id
  const createdAt = raw.created_at
  if (typeof id !== 'number' || !Number.isFinite(id)) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review comment missing id' })
  }
  if (typeof createdAt !== 'string') {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review comment missing created_at' })
  }
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub review comment has invalid created_at' })
  }
  return { id, createdAt: d }
}

async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (text.trim() === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new GitHubSyncError({ code: 'unknown', message: 'GitHub response is not valid JSON' })
  }
}

function isRateLimitedResponse(res: Response, body: unknown): boolean {
  if (res.status === 429) return true
  if (res.status !== 403) return false
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (remaining === '0') return true
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const msg = (body as { message?: unknown }).message
    if (typeof msg === 'string' && /rate limit/i.test(msg)) return true
  }
  return false
}

function buildListPullsUrl(baseUrl: string, owner: string, repo: string, page: number): string {
  const root = trimTrailingSlash(baseUrl)
  const u = new URL(`${root}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`)
  u.searchParams.set('state', 'all')
  u.searchParams.set('sort', 'updated')
  u.searchParams.set('direction', 'desc')
  u.searchParams.set('per_page', String(PER_PAGE))
  u.searchParams.set('page', String(page))
  return u.toString()
}

function buildGitHubHeaders(token: string | undefined): Headers {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dddd-pr-cycle-time-collector',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  })
  if (token !== undefined && token !== '') {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

async function fetchGitHub(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS)
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new GitHubSyncError({
        code: 'unknown',
        message: `GitHub request timed out after ${GITHUB_REQUEST_TIMEOUT_MS}ms`,
      })
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export class GitHubClient {
  private readonly token?: string

  private readonly baseUrl: string

  private readonly fetchImpl: typeof fetch

  constructor(options: GitHubClientOptions) {
    this.token = options.token
    this.baseUrl = trimTrailingSlash(options.baseUrl)
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  /** Lists all repositories (including private/archived) visible to the token for `owner`. */
  async listOrgRepositories(owner: string): Promise<GitHubOrgRepo[]> {
    return this.paginatedGet<GitHubOrgRepo>(
      `/orgs/${encodeURIComponent(owner)}/repos?type=all`,
      normalizeOrgRepo,
    )
  }

  async listPullRequestReviews(
    input: GitHubClientListPullRequestReviewsInput,
  ): Promise<GitHubReview[]> {
    const items = await this.paginatedGet<GitHubReview>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls/${input.pullNumber}/reviews`,
      normalizeReview,
    )
    return items
  }

  async listPullRequestReviewComments(
    input: GitHubClientListPullRequestReviewsInput,
  ): Promise<GitHubReviewComment[]> {
    const items = await this.paginatedGet<GitHubReviewComment>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls/${input.pullNumber}/comments`,
      normalizeReviewComment,
    )
    return items
  }

  async getPullRequestDetail(input: {
    owner: string
    repo: string
    pullNumber: number
  }): Promise<{ additions: number; deletions: number; changedFiles: number }> {
    const root = trimTrailingSlash(this.baseUrl)
    const url = `${root}/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls/${input.pullNumber}`
    const headers = buildGitHubHeaders(this.token)
    const res = await fetchGitHub(this.fetchImpl, url, { headers })

    if (!res.ok) {
      const body = await readJsonBody(res)
      const retryAfterSeconds = parseRetryAfterSeconds(res)
      if (res.status === 401) {
        throw new GitHubSyncError({
          code: 'unauthorized',
          message: 'GitHub rejected the request (401 Unauthorized)',
          retryAfterSeconds,
        })
      }
      if (isRateLimitedResponse(res, body)) {
        throw new GitHubSyncError({
          code: 'rate_limited',
          message: 'GitHub rate limit exceeded',
          retryAfterSeconds,
        })
      }
      if (res.status === 403) {
        throw new GitHubSyncError({
          code: 'forbidden',
          message: 'GitHub rejected the request (403 Forbidden)',
          retryAfterSeconds,
        })
      }
      const msg =
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof (body as { message: unknown }).message === 'string'
          ? (body as { message: string }).message
          : `GitHub request failed with status ${res.status}`
      throw new GitHubSyncError({ code: 'unknown', message: msg, retryAfterSeconds })
    }

    const body = await readJsonBody(res)
    if (typeof body !== 'object' || body === null) {
      throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pull request detail response is not an object' })
    }
    return normalizePullRequestDetail(body as Record<string, unknown>)
  }

  private async paginatedGet<T>(
    path: string,
    mapItem: (raw: Record<string, unknown>) => T,
  ): Promise<T[]> {
    const root = trimTrailingSlash(this.baseUrl)
    const first = new URL(`${root}${path}`)
    first.searchParams.set('per_page', String(PER_PAGE))

    const results: T[] = []
    let nextUrl: string | null = first.toString()

    while (nextUrl !== null) {
      const headers = buildGitHubHeaders(this.token)
      const res = await fetchGitHub(this.fetchImpl, nextUrl, { headers })

      if (!res.ok) {
        const body = await readJsonBody(res)
        const retryAfterSeconds = parseRetryAfterSeconds(res)
        if (res.status === 401) {
          throw new GitHubSyncError({
            code: 'unauthorized',
            message: 'GitHub rejected the request (401 Unauthorized)',
            retryAfterSeconds,
          })
        }
        if (isRateLimitedResponse(res, body)) {
          throw new GitHubSyncError({
            code: 'rate_limited',
            message: 'GitHub rate limit exceeded',
            retryAfterSeconds,
          })
        }
        if (res.status === 403) {
          throw new GitHubSyncError({
            code: 'forbidden',
            message: 'GitHub rejected the request (403 Forbidden)',
            retryAfterSeconds,
          })
        }
        const msg =
          typeof body === 'object' &&
          body !== null &&
          'message' in body &&
          typeof (body as { message: unknown }).message === 'string'
            ? (body as { message: string }).message
            : `GitHub request failed with status ${res.status}`
        throw new GitHubSyncError({ code: 'unknown', message: msg, retryAfterSeconds })
      }

      const body = await readJsonBody(res)
      if (!Array.isArray(body)) {
        throw new GitHubSyncError({ code: 'unknown', message: 'GitHub response is not an array' })
      }
      for (const item of body) {
        if (typeof item !== 'object' || item === null) continue
        results.push(mapItem(item as Record<string, unknown>))
      }

      const parsedNext = parseLinkNext(res.headers.get('Link'))
      if (parsedNext !== null && !isSameApiOrigin(this.baseUrl, parsedNext)) {
        throw new GitHubSyncError({
          code: 'unknown',
          message: 'GitHub Link header next URL does not match the configured API host',
        })
      }
      nextUrl = parsedNext
    }

    return results
  }

  async listPullRequests(input: GitHubClientListPullRequestsInput): Promise<GitHubPullRequest[]> {
    const { owner, repo } = input

    const bound =
      input.stopAfterUpdatedAt !== undefined ? input.stopAfterUpdatedAt : input.initialSyncFrom
    const boundMs = bound?.getTime()

    const results: GitHubPullRequest[] = []
    let page = 1
    let nextUrl: string | null = null

    for (;;) {
      const url = nextUrl ?? buildListPullsUrl(this.baseUrl, owner, repo, page)
      const headers = buildGitHubHeaders(this.token)

      const res = await fetchGitHub(this.fetchImpl, url, { headers })

      if (!res.ok) {
        const body = await readJsonBody(res)
        const retryAfterSeconds = parseRetryAfterSeconds(res)

        if (res.status === 401) {
          throw new GitHubSyncError({
            code: 'unauthorized',
            message: 'GitHub rejected the request (401 Unauthorized)',
            retryAfterSeconds,
          })
        }

        if (isRateLimitedResponse(res, body)) {
          throw new GitHubSyncError({
            code: 'rate_limited',
            message: 'GitHub rate limit exceeded',
            retryAfterSeconds,
          })
        }

        if (res.status === 403) {
          throw new GitHubSyncError({
            code: 'forbidden',
            message: 'GitHub rejected the request (403 Forbidden)',
            retryAfterSeconds,
          })
        }

        if (res.status === 404) {
          throw new GitHubSyncError({
            code: 'unknown',
            message: `GitHub repository not found or token lacks access: ${owner}/${repo}`,
            retryAfterSeconds,
          })
        }

        const msg =
          typeof body === 'object' && body !== null && 'message' in body && typeof (body as { message: unknown }).message === 'string'
            ? (body as { message: string }).message
            : `GitHub request failed with status ${res.status}`
        throw new GitHubSyncError({ code: 'unknown', message: msg, retryAfterSeconds })
      }

      const body = await readJsonBody(res)
      if (!Array.isArray(body)) {
        throw new GitHubSyncError({ code: 'unknown', message: 'GitHub pulls response is not an array' })
      }

      const normalizedPage: GitHubPullRequest[] = []
      for (const item of body) {
        if (typeof item !== 'object' || item === null) continue
        normalizedPage.push(normalizePullRequest(item as Record<string, unknown>))
      }

      for (const pr of normalizedPage) {
        if (boundMs === undefined || pr.updatedAt.getTime() >= boundMs) {
          results.push(pr)
        }
      }

      const parsedNext = parseLinkNext(res.headers.get('Link'))
      if (parsedNext !== null && !isSameApiOrigin(this.baseUrl, parsedNext)) {
        throw new GitHubSyncError({
          code: 'unknown',
          message: 'GitHub Link header next URL does not match the configured API host',
        })
      }
      if (parsedNext !== null) {
        nextUrl = parsedNext
        page += 1
      } else if (normalizedPage.length < PER_PAGE) {
        break
      } else {
        nextUrl = null
        page += 1
      }

      if (boundMs !== undefined && normalizedPage.length > 0) {
        const allOlder = normalizedPage.every((p) => p.updatedAt.getTime() < boundMs)
        if (allOlder) {
          break
        }
      }

      if (normalizedPage.length === 0) {
        break
      }
    }

    return results
  }
}

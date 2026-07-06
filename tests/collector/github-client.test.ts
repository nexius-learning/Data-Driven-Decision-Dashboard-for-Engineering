import { describe, expect, it, vi } from 'vitest'

import { GitHubClient } from '~/collector/github-client'

function jsonResponse(body: unknown, init: ResponseInit & { headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return new Response(JSON.stringify(body), { ...init, headers })
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

describe('github-client', () => {
  it('github_client_lists_prs', async () => {
    const body = [
      {
        node_id: 'MDExOlB1bGxSZXF1ZXN0MQ==',
        number: 42,
        title: 'Fix thing',
        state: 'closed',
        draft: false,
        created_at: '2024-01-10T12:00:00Z',
        updated_at: '2024-01-12T15:30:00Z',
        merged_at: '2024-01-12T15:00:00Z',
        html_url: 'https://github.com/o/r/pull/42',
      },
    ]
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return jsonResponse(body)
    })

    const client = new GitHubClient({
      baseUrl: 'https://api.github.com',
      fetchImpl,
    })

    const prs = await client.listPullRequests({
      owner: 'o',
      repo: 'r',
      state: 'all',
    })

    expect(prs).toHaveLength(1)
    expect(prs[0]).toEqual({
      githubNodeId: 'MDExOlB1bGxSZXF1ZXN0MQ==',
      number: 42,
      title: 'Fix thing',
      state: 'closed',
      isDraft: false,
      openedAt: new Date('2024-01-10T12:00:00Z'),
      updatedAt: new Date('2024-01-12T15:30:00Z'),
      mergedAt: new Date('2024-01-12T15:00:00Z'),
      mergeCommitSha: null,
      url: 'https://github.com/o/r/pull/42',
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = requestUrl(fetchImpl.mock.calls[0]![0] as Parameters<typeof fetch>[0])
    expect(url).toContain('/repos/o/r/pulls')
    expect(url).toContain('state=all')
    expect(url).toContain('sort=updated')
    expect(url).toContain('direction=desc')
    expect(url).toContain('per_page=100')
  })

  it('github_client_handles_pagination', async () => {
    const page1 = [
      {
        node_id: 'A',
        number: 2,
        title: 'p2',
        state: 'open',
        draft: false,
        created_at: '2024-02-01T00:00:00Z',
        updated_at: '2024-02-02T00:00:00Z',
        merged_at: null,
        html_url: 'https://github.com/o/r/pull/2',
      },
    ]
    const page2 = [
      {
        node_id: 'B',
        number: 1,
        title: 'p1',
        state: 'open',
        draft: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        merged_at: null,
        html_url: 'https://github.com/o/r/pull/1',
      },
    ]

    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const u = requestUrl(input)
      const page = new URL(u).searchParams.get('page')
      if (page === '1') {
        return jsonResponse(page1, {
          headers: {
            Link: '<https://api.github.com/repos/o/r/pulls?page=2&per_page=100&state=all&sort=updated&direction=desc>; rel="next"',
          },
        })
      }
      return jsonResponse(page2)
    })

    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })
    const prs = await client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })

    expect(prs.map((p) => p.number)).toEqual([2, 1])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('github_client_uses_supported_list_pr_parameters', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return jsonResponse([])
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    await client.listPullRequests({
      owner: 'o',
      repo: 'r',
      state: 'all',
      initialSyncFrom: new Date('2024-01-01T00:00:00Z'),
    })

    const url = requestUrl(fetchImpl.mock.calls[0]![0] as Parameters<typeof fetch>[0])
    expect(url).not.toContain('since=')
  })

  it('github_client_stops_after_known_updated_page', async () => {
    const stopAfter = new Date('2024-06-01T12:00:00.000Z')

    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const u = requestUrl(input)
      if (u.includes('page=2')) {
        return jsonResponse([
          {
            node_id: 'old1',
            number: 10,
            title: 'old',
            state: 'closed',
            draft: false,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2024-05-01T00:00:00Z',
            merged_at: '2024-05-01T00:00:00Z',
            html_url: 'https://github.com/o/r/pull/10',
          },
          {
            node_id: 'old2',
            number: 9,
            title: 'older',
            state: 'closed',
            draft: false,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2024-04-01T00:00:00Z',
            merged_at: '2024-04-01T00:00:00Z',
            html_url: 'https://github.com/o/r/pull/9',
          },
        ])
      }
      return jsonResponse(
        [
          {
            node_id: 'new1',
            number: 12,
            title: 'new',
            state: 'open',
            draft: false,
            created_at: '2024-06-10T00:00:00Z',
            updated_at: '2024-06-10T00:00:00Z',
            merged_at: null,
            html_url: 'https://github.com/o/r/pull/12',
          },
          {
            node_id: 'edge',
            number: 11,
            title: 'edge',
            state: 'closed',
            draft: false,
            created_at: '2024-05-15T00:00:00Z',
            updated_at: '2024-06-01T12:00:00.000Z',
            merged_at: '2024-06-01T12:00:00.000Z',
            html_url: 'https://github.com/o/r/pull/11',
          },
        ],
        {
          headers: {
            Link: '<https://api.github.com/repos/o/r/pulls?page=2&per_page=100&state=all&sort=updated&direction=desc>; rel="next"',
          },
        },
      )
    })

    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })
    const prs = await client.listPullRequests({
      owner: 'o',
      repo: 'r',
      state: 'all',
      stopAfterUpdatedAt: stopAfter,
    })

    expect(prs.map((p) => p.number)).toEqual([12, 11])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('github_client_stops_at_initial_sync_cutoff', async () => {
    const initialSyncFrom = new Date('2024-06-01T00:00:00.000Z')

    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const u = requestUrl(input)
      if (u.includes('page=2')) {
        return jsonResponse([
          {
            node_id: 'old',
            number: 1,
            title: 'before cutoff page',
            state: 'closed',
            draft: false,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2024-05-15T00:00:00Z',
            merged_at: '2024-05-15T00:00:00Z',
            html_url: 'https://github.com/o/r/pull/1',
          },
        ])
      }
      return jsonResponse(
        [
          {
            node_id: 'keep',
            number: 3,
            title: 'after cutoff',
            state: 'closed',
            draft: false,
            created_at: '2024-06-02T00:00:00Z',
            updated_at: '2024-06-02T00:00:00Z',
            merged_at: '2024-06-02T00:00:00Z',
            html_url: 'https://github.com/o/r/pull/3',
          },
        ],
        {
          headers: {
            Link: '<https://api.github.com/repos/o/r/pulls?page=2&per_page=100&state=all&sort=updated&direction=desc>; rel="next"',
          },
        },
      )
    })

    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })
    const prs = await client.listPullRequests({
      owner: 'o',
      repo: 'r',
      state: 'all',
      initialSyncFrom,
    })

    expect(prs.map((p) => p.number)).toEqual([3])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('github_client_keeps_equal_updated_at_boundary_prs', async () => {
    const t = new Date('2024-03-15T10:00:00.000Z')

    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const u = requestUrl(input)
      if (u.includes('page=2')) {
        return jsonResponse([
          {
            node_id: 'x2',
            number: 20,
            title: 'below',
            state: 'open',
            draft: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-03-10T00:00:00.000Z',
            merged_at: null,
            html_url: 'https://github.com/o/r/pull/20',
          },
        ])
      }
      return jsonResponse(
        [
          {
            node_id: 'x0',
            number: 22,
            title: 'above',
            state: 'open',
            draft: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-03-20T00:00:00.000Z',
            merged_at: null,
            html_url: 'https://github.com/o/r/pull/22',
          },
          {
            node_id: 'x1',
            number: 21,
            title: 'equal',
            state: 'open',
            draft: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-03-15T10:00:00.000Z',
            merged_at: null,
            html_url: 'https://github.com/o/r/pull/21',
          },
          {
            node_id: 'x9',
            number: 19,
            title: 'below same page',
            state: 'open',
            draft: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-03-10T00:00:00.000Z',
            merged_at: null,
            html_url: 'https://github.com/o/r/pull/19',
          },
        ],
        {
          headers: {
            Link: '<https://api.github.com/repos/o/r/pulls?page=2&per_page=100&state=all&sort=updated&direction=desc>; rel="next"',
          },
        },
      )
    })

    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })
    const prs = await client.listPullRequests({
      owner: 'o',
      repo: 'r',
      state: 'all',
      stopAfterUpdatedAt: t,
    })

    expect(prs.map((p) => p.number)).toEqual([22, 21])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('github_client_handles_rate_limit', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '42',
        },
      })
    })

    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    await expect(
      client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' }),
    ).rejects.toMatchObject({
      name: 'GitHubSyncError',
      code: 'rate_limited',
      retryAfterSeconds: 42,
    })
  })

  it('github_client_times_out_hung_requests', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    const pending = expect(client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })).rejects.toMatchObject({
      name: 'GitHubSyncError',
      code: 'unknown',
      message: 'GitHub request timed out after 30000ms',
    })
    await vi.advanceTimersByTimeAsync(30_000)

    await pending
    vi.useRealTimers()
  })

  it('github_client_rejects_cross_origin_pagination_link', async () => {
    const pr = {
      node_id: 'X',
      number: 1,
      title: 't',
      state: 'open' as const,
      draft: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      merged_at: null,
      html_url: 'https://github.com/o/r/pull/1',
    }
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return jsonResponse([pr], {
        headers: {
          Link: '<https://malicious.example/repos/o/r/pulls?page=2>; rel="next"',
        },
      })
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    await expect(client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })).rejects.toMatchObject({
      name: 'GitHubSyncError',
      code: 'unknown',
      message: 'GitHub Link header next URL does not match the configured API host',
    })
  })

  it('github_client_sends_bearer_auth_header_when_token_exists', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      void input
      void init
      return jsonResponse([])
    })
    const client = new GitHubClient({
      token: 'ghp_testtoken',
      baseUrl: 'https://api.github.com',
      fetchImpl,
    })

    await client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })

    const init = fetchImpl.mock.calls[0]![1] as RequestInit | undefined
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer ghp_testtoken')
    expect(headers.get('X-GitHub-Api-Version')).toBe('2022-11-28')
  })

  it('github_client_omits_auth_header_without_token', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      void input
      void init
      return jsonResponse([])
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    await client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })

    const init = fetchImpl.mock.calls[0]![1] as RequestInit | undefined
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBeNull()
    expect(headers.get('X-GitHub-Api-Version')).toBe('2022-11-28')
  })

  it('github_client_explains_not_found_as_repo_or_token_access', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      void input
      void init
      return jsonResponse({ message: 'Not Found' }, { status: 404 })
    })
    const client = new GitHubClient({
      token: 'github_pat_testtoken',
      baseUrl: 'https://api.github.com',
      fetchImpl,
    })

    await expect(client.listPullRequests({ owner: 'gde-mit', repo: 'missing-repo', state: 'all' })).rejects.toMatchObject({
      name: 'GitHubSyncError',
      code: 'unknown',
      message:
        'GitHub repository not found or token lacks access: gde-mit/missing-repo',
    })
  })

  it('github_client_handles_unauthorized', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
    })
    const client = new GitHubClient({ token: 'bad', baseUrl: 'https://api.github.com', fetchImpl })

    await expect(client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })).rejects.toMatchObject({
      name: 'GitHubSyncError',
      code: 'unauthorized',
    })
  })

  it('github_client_handles_forbidden', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return new Response(JSON.stringify({ message: 'Not allowed' }), { status: 403 })
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    await expect(client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })).rejects.toMatchObject({
      name: 'GitHubSyncError',
      code: 'forbidden',
    })
  })

  it('github_client_handles_rate_limit_via_ratelimit_header', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      })
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    await expect(client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })).rejects.toMatchObject({
      name: 'GitHubSyncError',
      code: 'rate_limited',
    })
  })

  it('github_client_normalizes_draft_prs', async () => {
    const body = [
      {
        node_id: 'D',
        number: 7,
        title: 'Draft PR',
        state: 'open',
        draft: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        merged_at: null,
        html_url: 'https://github.com/o/r/pull/7',
      },
    ]
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return jsonResponse(body)
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })
    const [pr] = await client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })
    expect(pr?.isDraft).toBe(true)
  })

  it('github_client_accepts_trailing_slash_on_base_url', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return jsonResponse([])
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com/', fetchImpl })
    await client.listPullRequests({ owner: 'o', repo: 'r', state: 'all' })
    const url = requestUrl(fetchImpl.mock.calls[0]![0] as Parameters<typeof fetch>[0])
    expect(url.startsWith('https://api.github.com/repos/o/r/pulls')).toBe(true)
    expect(url).not.toContain('api.github.com//')
  })

  it('github_client_lists_org_repositories', async () => {
    const body = [
      { name: 'svc-a', archived: false },
      { name: 'svc-b', archived: true },
    ]
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      void input
      return jsonResponse(body)
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    const repos = await client.listOrgRepositories('acme')

    expect(repos).toEqual([
      { name: 'svc-a', archived: false },
      { name: 'svc-b', archived: true },
    ])
    const url = requestUrl(fetchImpl.mock.calls[0]![0] as Parameters<typeof fetch>[0])
    expect(url).toContain('/orgs/acme/repos')
    expect(url).toContain('type=all')
  })

  it('github_client_org_repositories_paginates', async () => {
    const page1 = [{ name: 'r1', archived: false }]
    const page2 = [{ name: 'r2', archived: false }]
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const u = requestUrl(input)
      if (new URL(u).searchParams.get('page') !== '2') {
        return jsonResponse(page1, {
          headers: { Link: '<https://api.github.com/orgs/acme/repos?type=all&per_page=100&page=2>; rel="next"' },
        })
      }
      return jsonResponse(page2)
    })
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })

    const repos = await client.listOrgRepositories('acme')

    expect(repos.map((r) => r.name)).toEqual(['r1', 'r2'])
  })

  it('github_client_org_repositories_rejects_missing_name', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ archived: false }]))
    const client = new GitHubClient({ baseUrl: 'https://api.github.com', fetchImpl })
    await expect(client.listOrgRepositories('acme')).rejects.toThrow(/missing name/)
  })
})

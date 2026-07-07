import { useEffect, useRef, useState } from 'react'
import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { PrCycleTimeDashboard } from '~/components/dashboard/PrCycleTimeDashboard'
import { refreshLocalDataFn } from '~/server/dashboard-functions'
import { getActiveSyncRunFn } from '~/server/source-functions'
import { deriveRefreshButtonState } from '~/server/derive-refresh-button-state'
import type { ActiveSyncRun } from '~/server/derive-refresh-button-state'

const homeRoute = getRouteApi('/')

const POLL_INTERVAL_MS = 2_000
const ZOMBIE_TTL_MS = 120_000

/** Root page component connecting route loader data, refresh, and team-filter navigation to the dashboard UI. */
export function HomePage() {
  const data = homeRoute.useLoaderData()
  const { team: activeTeam, weeks } = homeRoute.useSearch()
  const router = useRouter()
  const refreshFn = useServerFn(refreshLocalDataFn)
  const pollFn = useServerFn(getActiveSyncRunFn)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<ActiveSyncRun | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const attachedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void pollFn()
      .then((run) => {
        if (cancelled || run === null) return
        const state = deriveRefreshButtonState(run, Date.now(), ZOMBIE_TTL_MS)
        if (state.status !== 'running') return
        setActiveRun(run)
        setRefreshing(true)
        attachedRef.current = true
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!refreshing) {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      setActiveRun(null)
      return
    }
    pollRef.current = setInterval(() => {
      pollFn().then(setActiveRun).catch(() => {})
    }, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [refreshing])

  const derivedState = deriveRefreshButtonState(activeRun, Date.now(), ZOMBIE_TTL_MS)

  useEffect(() => {
    if (!refreshing || derivedState.status !== 'idle') return
    if (!attachedRef.current) return
    attachedRef.current = false
    setRefreshing(false)
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [derivedState.status, refreshing])
  const refreshButtonState =
    refreshing && derivedState.status === 'idle'
      ? { status: 'running' as const, phaseLabel: '', done: 0, total: 0, inFlightRepos: [], errorCount: 0 }
      : derivedState

  const onRefresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    let attached = false
    try {
      const res = await refreshFn()
      if (!res.ok) {
        // A collision with an already-running sync (e.g. the container's own
        // clone-only startup job) isn't a dead end — that other run is real
        // and progressing. Attach to it and show its live progress instead
        // of just erroring out and going idle, which looked like nothing
        // was happening even though something was.
        if (res.alreadyRunning) {
          const run = await pollFn().catch(() => null)
          const state = deriveRefreshButtonState(run, Date.now(), ZOMBIE_TTL_MS)
          if (state.status === 'running') {
            setActiveRun(run)
            attachedRef.current = true
            attached = true
            return
          }
        }
        setRefreshError(res.message)
        return
      }
      await router.invalidate()
    } finally {
      if (!attached) {
        setRefreshing(false)
      }
    }
  }

  const onTeamSelect = (newTeam: string | undefined) => {
    void router.navigate({ to: '/', search: { team: newTeam, weeks } })
  }

  return (
    <main>
      <PrCycleTimeDashboard
        data={data}
        onRefresh={onRefresh}
        refreshButtonState={refreshButtonState}
        refreshError={refreshError}
        activeTeam={activeTeam}
        onTeamSelect={onTeamSelect}
      />
    </main>
  )
}

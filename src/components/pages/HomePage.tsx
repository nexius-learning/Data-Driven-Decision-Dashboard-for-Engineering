import { useState } from 'react'
import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { PrCycleTimeDashboard } from '~/components/dashboard/PrCycleTimeDashboard'
import { refreshLocalDataFn } from '~/server/dashboard-functions'

const homeRoute = getRouteApi('/')

export function HomePage() {
  const data = homeRoute.useLoaderData()
  const { team: activeTeam, weeks } = homeRoute.useSearch()
  const router = useRouter()
  const refreshFn = useServerFn(refreshLocalDataFn)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const onRefresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await refreshFn()
      if (!res.ok) {
        setRefreshError(res.message)
        return
      }
      await router.invalidate()
    } finally {
      setRefreshing(false)
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
        refreshing={refreshing}
        refreshError={refreshError}
        activeTeam={activeTeam}
        onTeamSelect={onTeamSelect}
      />
    </main>
  )
}

import { createServerFn } from '@tanstack/react-start'

import { parseDashboardWeeksInput } from '~/server/dashboard-functions'

export const getMergedPrsSourceData = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => parseDashboardWeeksInput(raw ?? {}))
  .handler(async ({ data }) => {
    const { createDb } = await import('~/db/client')
    const { getEnv } = await import('~/config/env')
    const { getMergedPrsSource } = await import('~/metrics/dashboard-sources')
    const db = createDb(getEnv().databaseUrl)
    try {
      return await getMergedPrsSource({ db, weeks: data.weeks })
    } finally {
      await db.$client.end({ timeout: 5 })
    }
  })

export const getReposSourceData = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => parseDashboardWeeksInput(raw ?? {}))
  .handler(async () => {
    const { createDb } = await import('~/db/client')
    const { getEnv } = await import('~/config/env')
    const { getReposSource } = await import('~/metrics/dashboard-sources')
    const db = createDb(getEnv().databaseUrl)
    try {
      return await getReposSource({ db })
    } finally {
      await db.$client.end({ timeout: 5 })
    }
  })

export const getSyncSourceData = createServerFn({ method: 'GET' }).handler(async () => {
  const { createDb } = await import('~/db/client')
  const { getEnv } = await import('~/config/env')
  const { getLatestSyncSource } = await import('~/metrics/dashboard-sources')
  const db = createDb(getEnv().databaseUrl)
  try {
    return await getLatestSyncSource({ db })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
})

/** Server function that returns the currently active sync run, or null if no refresh is running. */
export const getActiveSyncRunFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { createDb } = await import('~/db/client')
  const { getEnv } = await import('~/config/env')
  const { getActiveSyncRun } = await import('~/server/active-sync-run')
  const db = createDb(getEnv().databaseUrl)
  try {
    return await getActiveSyncRun({ db })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
})

export const getSyncErrorsSourceData = createServerFn({ method: 'GET' }).handler(async () => {
  const { createDb } = await import('~/db/client')
  const { getEnv } = await import('~/config/env')
  const { getSyncErrorsSource } = await import('~/metrics/dashboard-sources')
  const db = createDb(getEnv().databaseUrl)
  try {
    return await getSyncErrorsSource({ db })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
})

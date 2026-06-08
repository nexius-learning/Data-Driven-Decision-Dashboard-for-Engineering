import { createFileRoute } from '@tanstack/react-router'

import { HomePage } from '~/components/pages/HomePage'
import { getDashboardData } from '~/server/dashboard-functions'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    team: typeof search.team === 'string' ? search.team : undefined,
    weeks: typeof search.weeks === 'number' ? search.weeks : undefined,
  }),
  loaderDeps: ({ search: { team, weeks } }) => ({ team, weeks }),
  loader: async ({ deps }) => getDashboardData({ data: deps }),
  component: HomePage,
})

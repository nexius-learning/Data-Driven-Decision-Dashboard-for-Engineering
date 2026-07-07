import { getRouteApi } from '@tanstack/react-router'

import { SourcePageLayout } from '~/components/sources/SourcePageLayout'

const route = getRouteApi('/sources/sync-errors')

export function SyncErrorsSourcePage() {
  const { syncRun, rows } = route.useLoaderData()

  return (
    <SourcePageLayout
      title="Sync errors"
      description="Errors recorded during the latest completed collector refresh."
    >
      {syncRun == null ? (
        <p className="source-page__empty">No sync run available.</p>
      ) : (
        <p className="source-page__meta">
          Sync finished {syncRun.finishedAt ?? '—'} · status {syncRun.status}
          {syncRun.mode !== 'full' ? ' · clone-only run (may not match "last synced")' : null}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="source-page__empty">No sync errors in the latest run.</p>
      ) : (
        <div className="source-page__table-wrap">
          <table className="source-page__table" aria-label="Sync errors">
            <thead>
              <tr>
                <th>Source</th>
                <th>Repository</th>
                <th>Message</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.source}-${row.createdAt}-${i}`}>
                  <td>{row.source}</td>
                  <td>{row.repositoryName ?? '—'}</td>
                  <td>{row.message}</td>
                  <td>{row.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SourcePageLayout>
  )
}

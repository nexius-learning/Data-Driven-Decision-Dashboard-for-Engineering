import { decideRefreshExitCode, formatProgressLine, formatRunSummary } from '../src/collector/cli-format'
import { refreshLocalData } from '../src/collector/refresh'
import { clearE2eRefreshStubForLocalCommand, loadLocalEnv, LOCAL_ENV_KEYS } from './local-env'

loadLocalEnv({ preferDotenvKeys: LOCAL_ENV_KEYS })
clearE2eRefreshStubForLocalCommand()

const cloneOnly = process.argv.includes('--clone-only')

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

refreshLocalData(undefined, {
  mode: cloneOnly ? 'clone-only' : 'full',
  onProgress: (event) => {
    console.log(formatProgressLine(event, ts()))
  },
})
  .then((summary) => {
    console.log(formatRunSummary(summary))
    process.exit(decideRefreshExitCode({ ok: true, summary }, cloneOnly))
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(decideRefreshExitCode({ ok: false, error: err }, cloneOnly))
  })

import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)

/** Git argv used to read `origin` (Phase 01: no fetch/pull). */
export function gitOriginReadArgs(repoPath: string): readonly string[] {
  return ['-C', repoPath, 'remote', 'get-url', 'origin']
}

export async function getGitOriginUrl(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFile('git', [...gitOriginReadArgs(repoPath)], {
      encoding: 'utf8',
    })
    const trimmed = stdout.trim()
    return trimmed === '' ? null : trimmed
  } catch (err) {
    // A missing remote is the expected, silent case (not a git repo, or a
    // repo with no `origin`). Anything else — e.g. git refusing the repo
    // as "dubiously owned" on a mounted share — is a real failure that
    // silently emptied every repo's owner/repo metadata before this log
    // line existed, so it must not disappear the same way again.
    const stderr = typeof err === 'object' && err !== null && 'stderr' in err ? String(err.stderr).trim() : ''
    if (stderr && !/does not have a remote/i.test(stderr) && !/not a git repository/i.test(stderr)) {
      console.warn(`[git-remote-url] failed to read origin for ${repoPath}: ${stderr}`)
    }
    return null
  }
}

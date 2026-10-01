import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

export interface CommandRequest {
  cwd: string
  inherit: boolean
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  request: CommandRequest,
) => CommandResult

export interface SelfUpdateOptions {
  root?: string
  runner?: CommandRunner
  log?: (message: string) => void
  warn?: (message: string) => void
}

export interface SelfUpdateResult {
  root: string
  branch: string
  upstream: string
  beforeSha: string
  afterSha: string
  marketplaceRefreshed: boolean
}

export function videoooRepositoryRoot(): string {
  return fileURLToPath(new URL('../../../', import.meta.url))
}

export function runSelfUpdate(
  options: SelfUpdateOptions = {},
): SelfUpdateResult {
  const root = realpathSync(options.root ?? videoooRepositoryRoot())
  const runner = options.runner ?? defaultRunner
  const log = options.log ?? console.log
  const warn = options.warn ?? console.warn
  const git = process.platform === 'win32' ? 'git.exe' : 'git'
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const videooo = process.platform === 'win32' ? 'videooo.cmd' : 'videooo'
  const codex = process.platform === 'win32' ? 'codex.exe' : 'codex'

  requireCommand(runner, git, ['--version'], root, 'git')
  requireCommand(runner, pnpm, ['--version'], root, 'pnpm')

  const topLevel = capture(
    runner,
    git,
    ['-C', root, 'rev-parse', '--show-toplevel'],
    root,
    'Resolve Videooo Git root',
  )
  if (realpathSync(topLevel) !== root) {
    throw new Error(
      `Videooo CLI is linked from "${root}", but Git reports repository root "${topLevel}". Reinstall the CLI from the intended Videooo checkout.`,
    )
  }

  const branch = capture(
    runner,
    git,
    ['-C', root, 'branch', '--show-current'],
    root,
    'Resolve current Git branch',
  )
  if (branch.length === 0) {
    throw new Error(
      'Videooo update requires a named Git branch; the checkout is currently detached.',
    )
  }

  const upstreamResult = runner(
    git,
    ['-C', root, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    { cwd: root, inherit: false },
  )
  if (upstreamResult.status !== 0) {
    throw new Error(
      `Videooo branch "${branch}" has no upstream. Configure an upstream before running videooo update.`,
    )
  }
  const upstream = upstreamResult.stdout.trim()

  const trackedStatus = capture(
    runner,
    git,
    ['-C', root, 'status', '--porcelain', '--untracked-files=no'],
    root,
    'Inspect Videooo Git status',
  )
  if (trackedStatus.length > 0) {
    throw new Error(
      `Videooo checkout has tracked local changes. Commit or stash them before updating:\n${trackedStatus}`,
    )
  }

  const beforeSha = capture(
    runner,
    git,
    ['-C', root, 'rev-parse', 'HEAD'],
    root,
    'Read current Videooo commit',
  )

  log(`==> Update Videooo (${branch} <- ${upstream})`)
  run(
    runner,
    git,
    ['-C', root, 'pull', '--ff-only'],
    root,
    'Pull latest Videooo source',
  )

  const afterSha = capture(
    runner,
    git,
    ['-C', root, 'rev-parse', 'HEAD'],
    root,
    'Read updated Videooo commit',
  )

  run(
    runner,
    pnpm,
    ['install', '--no-frozen-lockfile'],
    root,
    'Install workspace dependencies',
  )
  run(runner, pnpm, ['build'], root, 'Build Videooo')
  run(runner, pnpm, ['skills:check'], root, 'Validate packaged Videooo skills')

  const verification = capture(
    runner,
    videooo,
    ['--version'],
    root,
    'Verify globally linked Videooo CLI',
  )

  let marketplaceRefreshed = false
  const codexCheck = runner(codex, ['--version'], {
    cwd: root,
    inherit: false,
  })
  if (codexCheck.status === 0) {
    log('==> Refresh Codex Videooo marketplace')
    const refresh = runner(
      codex,
      ['plugin', 'marketplace', 'upgrade', 'videooo-marketplace'],
      { cwd: root, inherit: true },
    )
    if (refresh.status === 0) {
      marketplaceRefreshed = true
    } else {
      warn(
        'Warning: Videooo CLI updated successfully, but Codex marketplace refresh failed or is not configured. Run "codex plugin marketplace upgrade videooo-marketplace" after configuring the marketplace.',
      )
    }
  } else {
    warn(
      'Warning: Codex CLI was not found; skipped plugin marketplace refresh.',
    )
  }

  if (beforeSha === afterSha) {
    log(`Videooo is already current at ${shortSha(afterSha)}; rebuilt CLI ${verification}.`)
  } else {
    log(
      `Updated Videooo ${shortSha(beforeSha)} -> ${shortSha(afterSha)}; rebuilt CLI ${verification}.`,
    )
  }
  log('Start a new Codex session (or restart the desktop app) to reload updated skills.')

  return {
    root,
    branch,
    upstream,
    beforeSha,
    afterSha,
    marketplaceRefreshed,
  }
}

export function defaultRunner(
  command: string,
  args: readonly string[],
  request: CommandRequest,
): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd: request.cwd,
    encoding: 'utf8',
    stdio: request.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })

  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    ...(result.error === undefined ? {} : { error: result.error }),
  }
}

function requireCommand(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
  cwd: string,
  label: string,
): void {
  const result = runner(command, args, { cwd, inherit: false })
  if (result.status !== 0 || result.error !== undefined) {
    throw new Error(
      `${label} is required for videooo update but is not available on PATH.`,
    )
  }
}

function capture(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
  cwd: string,
  label: string,
): string {
  const result = runner(command, args, { cwd, inherit: false })
  if (result.status !== 0 || result.error !== undefined) {
    throw new Error(
      `${label} failed${formatDetails(result)}`,
    )
  }
  return result.stdout.trim()
}

function run(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
  cwd: string,
  label: string,
): void {
  console.log(`==> ${label}`)
  const result = runner(command, args, { cwd, inherit: true })
  if (result.status !== 0 || result.error !== undefined) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? 'unknown'}${formatDetails(result)}`,
    )
  }
}

function formatDetails(result: CommandResult): string {
  const details = [result.stderr, result.stdout]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join('\n')
  return details.length === 0 ? '' : `:\n${details}`
}

function shortSha(value: string): string {
  return value.slice(0, 8)
}

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  CommandRequest,
  CommandResult,
  CommandRunner,
} from './update.js'
import { runSelfUpdate } from './update.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  )
})

describe('videooo update', () => {
  it('refuses to update when tracked files are modified', async () => {
    const root = await makeRoot()
    const calls: string[] = []
    const runner = scriptedRunner(root, calls, {
      status: ' M apps/cli/src/index.ts',
    })

    expect(() =>
      runSelfUpdate({
        root,
        runner,
        log: () => {},
        warn: () => {},
      }),
    ).toThrow('tracked local changes')

    expect(calls.some((call) => call.includes('pull --ff-only'))).toBe(false)
  })

  it('pulls, installs, builds, validates, verifies, and refreshes Codex', async () => {
    const root = await makeRoot()
    const calls: string[] = []
    const logs: string[] = []
    const runner = scriptedRunner(root, calls)

    const result = runSelfUpdate({
      root,
      runner,
      log: (message) => logs.push(message),
      warn: () => {},
    })

    expect(result).toMatchObject({
      branch: 'master',
      upstream: 'origin/master',
      beforeSha: '1111111111111111111111111111111111111111',
      afterSha: '2222222222222222222222222222222222222222',
      marketplaceRefreshed: true,
    })

    expect(calls).toContain(
      'git -C <root> pull --ff-only [inherit]',
    )
    expect(calls).toContain(
      'pnpm install --no-frozen-lockfile [inherit]',
    )
    expect(calls).toContain('pnpm build [inherit]')
    expect(calls).toContain('pnpm skills:check [inherit]')
    expect(calls).toContain('videooo --version [capture]')
    expect(calls).toContain(
      'codex plugin marketplace upgrade videooo-marketplace [inherit]',
    )
    expect(logs.some((line) => line.includes('11111111 -> 22222222'))).toBe(
      true,
    )
    expect(
      logs.some((line) => line.includes('Start a new Codex session')),
    ).toBe(true)
  })

  it('keeps the CLI update successful when Codex marketplace refresh fails', async () => {
    const root = await makeRoot()
    const calls: string[] = []
    const warnings: string[] = []
    const runner = scriptedRunner(root, calls, {
      marketplaceUpgradeStatus: 1,
    })

    const result = runSelfUpdate({
      root,
      runner,
      log: () => {},
      warn: (message) => warnings.push(message),
    })

    expect(result.marketplaceRefreshed).toBe(false)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('marketplace refresh failed')
  })
})

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'videooo-update-'))
  roots.push(root)
  return root
}

function scriptedRunner(
  root: string,
  calls: string[],
  options: {
    status?: string
    marketplaceUpgradeStatus?: number
  } = {},
): CommandRunner {
  let headReads = 0

  return (
    command: string,
    args: readonly string[],
    request: CommandRequest,
  ): CommandResult => {
    calls.push(
      [
        command,
        ...args.map((arg) => (arg === root ? '<root>' : arg)),
        request.inherit ? '[inherit]' : '[capture]',
      ].join(' '),
    )

    if (command === 'git' && args[0] === '--version') {
      return ok('git version 2.50.0')
    }
    if (command === 'pnpm' && args[0] === '--version') {
      return ok('11.7.0')
    }
    if (
      command === 'git' &&
      args.includes('rev-parse') &&
      args.includes('--show-toplevel')
    ) {
      return ok(root)
    }
    if (
      command === 'git' &&
      args.includes('branch') &&
      args.includes('--show-current')
    ) {
      return ok('master')
    }
    if (
      command === 'git' &&
      args.includes('--symbolic-full-name') &&
      args.includes('@{u}')
    ) {
      return ok('origin/master')
    }
    if (
      command === 'git' &&
      args.includes('status') &&
      args.includes('--porcelain')
    ) {
      return ok(options.status ?? '')
    }
    if (
      command === 'git' &&
      args.includes('rev-parse') &&
      args.at(-1) === 'HEAD'
    ) {
      headReads += 1
      return ok(
        headReads === 1
          ? '1111111111111111111111111111111111111111'
          : '2222222222222222222222222222222222222222',
      )
    }
    if (command === 'git' && args.includes('pull')) {
      return ok('')
    }
    if (command === 'pnpm') {
      return ok('')
    }
    if (command === 'videooo' && args[0] === '--version') {
      return ok('0.1.0')
    }
    if (command === 'codex' && args[0] === '--version') {
      return ok('codex 1.0.0')
    }
    if (
      command === 'codex' &&
      args[0] === 'plugin' &&
      args[1] === 'marketplace' &&
      args[2] === 'upgrade'
    ) {
      return {
        status: options.marketplaceUpgradeStatus ?? 0,
        stdout: '',
        stderr:
          options.marketplaceUpgradeStatus === 1
            ? 'marketplace not configured'
            : '',
      }
    }

    return {
      status: 1,
      stdout: '',
      stderr: `Unexpected command: ${command} ${args.join(' ')}`,
    }
  }
}

function ok(stdout: string): CommandResult {
  return { status: 0, stdout, stderr: '' }
}

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const videooo = process.platform === 'win32' ? 'videooo.cmd' : 'videooo'

if (!succeeds(pnpm, ['--version'])) {
  fail('pnpm is required. Install pnpm before running pnpm install:cli.')
}

run(pnpm, ['install', '--no-frozen-lockfile'], 'Install workspace dependencies')
run(pnpm, ['build'], 'Build Videooo')
run(
  pnpm,
  ['--filter', '@videooo/cli', 'link', '--global'],
  'Link the Videooo CLI globally',
)

const verification = spawnSync(videooo, ['--version'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

if (verification.status !== 0) {
  console.error(verification.stderr || verification.stdout)
  fail(
    'The global link was created but videooo is not on PATH. Run "pnpm setup", restart your shell, then run "pnpm install:cli" again.',
  )
}

console.log(`Videooo CLI installed: ${verification.stdout.trim()}`)\nconsole.log('Future updates: run "videooo update" from any directory.')

function run(command, args, label) {
  console.log(`==> ${label}`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    fail(`${label} failed with exit code ${result.status ?? 'unknown'}.`)
  }
}

function succeeds(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'ignore',
  })
  return result.status === 0
}

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

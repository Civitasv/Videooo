import { access, readdir, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const skillsRoot = new URL('../skills/', import.meta.url)
const failures = []
const requiredSkills = new Set([
  'videooo',
  'research',
  'script',
  'narration',
  'previs',
  'storyboard',
  'video-qa',
])

const portable = await readJson(new URL('../plugin.json', import.meta.url), 'plugin.json')
const compatibility = await readJson(
  new URL('../.codex-plugin/plugin.json', import.meta.url),
  '.codex-plugin/plugin.json',
)
const marketplace = await readJson(
  new URL('../.agents/plugins/marketplace.json', import.meta.url),
  '.agents/plugins/marketplace.json',
)

if (
  portable.$schema !==
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
) {
  failures.push('plugin.json: unexpected or missing Agent Plugins schema')
}
if (portable.name !== 'videooo') {
  failures.push('plugin.json: name must be videooo')
}

if (compatibility.name !== 'videooo') {
  failures.push('.codex-plugin/plugin.json: name must be videooo')
}
if (compatibility.skills !== './skills/') {
  failures.push('.codex-plugin/plugin.json: skills must be ./skills/')
}

const onboarding =
  compatibility.extensions?.['com.openai']?.onboardingSkill
if (onboarding !== './skills/videooo/SKILL.md') {
  failures.push(
    '.codex-plugin/plugin.json: onboardingSkill must be ./skills/videooo/SKILL.md',
  )
}

if (marketplace.name !== 'videooo-marketplace') {
  failures.push('.agents/plugins/marketplace.json: unexpected marketplace name')
}

const entries = await readdir(skillsRoot, { withFileTypes: true })
const discovered = new Set()

for (const entry of entries) {
  if (!entry.isDirectory()) continue
  const skillPath = new URL(`${entry.name}/SKILL.md`, skillsRoot)
  let content
  try {
    content = await readFile(skillPath, 'utf8')
  } catch {
    continue
  }

  discovered.add(entry.name)
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content)
  if (!match) {
    failures.push(`${entry.name}: missing YAML frontmatter`)
    continue
  }

  const frontmatter = match[1] ?? ''
  if (!frontmatter.includes(`name: ${entry.name}`)) {
    failures.push(`${entry.name}: frontmatter name must match directory`)
  }
  if (!/^description:\s*.+$/m.test(frontmatter)) {
    failures.push(`${entry.name}: missing description`)
  }
}

for (const required of requiredSkills) {
  if (!discovered.has(required)) {
    failures.push(`missing required skill: ${required}`)
  }
}

if (await exists(new URL('../.agents/skills/', import.meta.url))) {
  failures.push(
    '.agents/skills must not exist; root skills/ is the single source of truth',
  )
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(
  `Validated Videooo plugin and ${discovered.size} packaged skills from ${new URL('.', root).pathname}.`,
)

async function readJson(url, label) {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch (error) {
    failures.push(
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return {}
  }
}

async function exists(url) {
  try {
    await access(url)
    return true
  } catch {
    return false
  }
}

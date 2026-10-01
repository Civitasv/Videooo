import { readdir, readFile } from 'node:fs/promises'

const root = new URL('../.agents/skills/', import.meta.url)
const entries = await readdir(root, { withFileTypes: true })
const failures = []

for (const entry of entries) {
  if (!entry.isDirectory()) continue
  const skillPath = new URL(`${entry.name}/SKILL.md`, root)
  let content
  try {
    content = await readFile(skillPath, 'utf8')
  } catch {
    failures.push(`${entry.name}: missing SKILL.md`)
    continue
  }

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

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`Validated ${entries.filter((entry) => entry.isDirectory()).length} Videooo skills.`)

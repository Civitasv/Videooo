#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createProject } from '@videooo/core'

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)

  if (command !== 'init') {
    printUsage()
    process.exitCode = command === undefined ? 0 : 1
    return
  }

  const topic = args.join(' ').trim()
  if (topic.length === 0) {
    console.error('Missing topic.')
    printUsage()
    process.exitCode = 1
    return
  }

  const project = createProject(topic)
  const projectDir = resolve(process.cwd(), '.videooo')
  await mkdir(projectDir, { recursive: true })
  await writeFile(
    resolve(projectDir, 'project.json'),
    JSON.stringify(project, null, 2) + '\n',
    'utf8',
  )

  console.log(`Initialized Videooo project "${project.topic}" in ${projectDir}`)
}

function printUsage(): void {
  console.log('Usage: videooo init <topic>')
}

await main()

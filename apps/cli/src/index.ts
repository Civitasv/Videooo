#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  ProjectStore,
  createProject,
  parseResearchPack,
  transitionProject,
} from '@videooo/core'

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)

  switch (command) {
    case undefined:
      printUsage()
      return
    case 'init':
      await handleInit(args)
      return
    case 'status':
      await handleStatus()
      return
    case 'research':
      await handleResearch(args)
      return
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

async function handleInit(args: string[]): Promise<void> {
  const topic = args.join(' ').trim()
  if (topic.length === 0) {
    throw new Error('Usage: videooo init <topic>')
  }

  const project = createProject(topic)
  const store = new ProjectStore()
  await store.initialize(project)
  console.log(`Initialized Videooo project "${project.topic}" in ${store.directory}`)
}

async function handleStatus(): Promise<void> {
  const store = new ProjectStore()
  const project = await store.loadProject()

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        topic: project.topic,
        stage: project.stage,
        hasResearch: await store.hasResearch(),
        researchPackId: project.researchPackId ?? null,
        approvedScriptVersionId: project.approvedScriptVersionId ?? null,
      },
      null,
      2,
    ),
  )
}

async function handleResearch(args: string[]): Promise<void> {
  const [action, path] = args
  const store = new ProjectStore()
  const project = await store.loadProject()

  switch (action) {
    case 'begin': {
      if (project.stage === 'research') {
        console.log('Research already started.')
        return
      }

      const next = transitionProject(project, 'research')
      await store.saveProject(next)
      console.log('Research phase started.')
      return
    }

    case 'import': {
      if (path === undefined) {
        throw new Error('Usage: videooo research import <research.json>')
      }
      if (project.stage !== 'research') {
        throw new Error(
          `Research import requires stage "research"; current stage is "${project.stage}"`,
        )
      }

      const candidate = JSON.parse(
        await readFile(resolve(process.cwd(), path), 'utf8'),
      ) as unknown
      const pack = parseResearchPack(candidate, project)

      await store.saveResearch(pack)
      await store.saveProject(
        transitionProject(
          { ...project, researchPackId: pack.id },
          'draft-script',
        ),
      )
      console.log(`Imported Research Pack "${pack.id}".`)
      return
    }

    case 'show': {
      if (!(await store.hasResearch())) {
        throw new Error('No Research Pack has been imported.')
      }
      console.log(JSON.stringify(await store.loadResearch(), null, 2))
      return
    }

    default:
      throw new Error(
        'Usage: videooo research <begin|import <research.json>|show>',
      )
  }
}

function printUsage(): void {
  console.log(`Usage:
  videooo init <topic>
  videooo status
  videooo research begin
  videooo research import <research.json>
  videooo research show`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  ProjectStore,
  acceptScriptVersion,
  approveScriptVersion,
  createProject,
  parseResearchPack,
  parseScriptVersion,
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
    case 'script':
      await handleScript(args)
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
  const versions = await store.listScriptVersions()

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        topic: project.topic,
        stage: project.stage,
        hasResearch: await store.hasResearch(),
        researchPackId: project.researchPackId ?? null,
        scriptVersionCount: versions.length,
        latestScriptVersion: versions.at(-1) ?? null,
        approvedScriptVersionId: project.approvedScriptVersionId ?? null,
        approvedScriptAt: project.approvedScriptAt ?? null,
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

      const pack = parseResearchPack(await readJsonFile(path), project)
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

async function handleScript(args: string[]): Promise<void> {
  const [action, argument] = args
  const store = new ProjectStore()
  const project = await store.loadProject()

  switch (action) {
    case 'import': {
      if (argument === undefined) {
        throw new Error('Usage: videooo script import <script.json>')
      }
      if (project.stage !== 'draft-script' && project.stage !== 'script-review') {
        throw new Error(
          `Script import requires stage "draft-script" or "script-review"; current stage is "${project.stage}"`,
        )
      }

      const research = await store.loadResearch()
      const previous = await store.loadLatestScriptVersion()
      const script = parseScriptVersion(
        await readJsonFile(argument),
        project,
        research,
        previous,
      )

      await store.appendScriptVersion(script)
      await store.saveProject(acceptScriptVersion(project))
      console.log(`Imported script v${script.version}: "${script.id}".`)
      return
    }

    case 'list': {
      const versions = await store.listScriptVersions()
      const scripts = await Promise.all(
        versions.map((version) => store.loadScriptVersion(version)),
      )
      console.log(
        JSON.stringify(
          scripts.map((script) => ({
            version: script.version,
            id: script.id,
            parentVersionId: script.parentVersionId ?? null,
            changeSummary: script.changeSummary ?? null,
            approved: project.approvedScriptVersionId === script.id,
          })),
          null,
          2,
        ),
      )
      return
    }

    case 'show': {
      const version =
        argument === undefined
          ? (await store.listScriptVersions()).at(-1)
          : parseVersion(argument)
      if (version === undefined) {
        throw new Error('No script versions exist.')
      }
      console.log(JSON.stringify(await store.loadScriptVersion(version), null, 2))
      return
    }

    case 'approve': {
      if (argument === undefined) {
        throw new Error('Usage: videooo script approve <version>')
      }
      const version = parseVersion(argument)
      const script = await store.loadScriptVersion(version)
      const research = await store.loadResearch()
      const previous =
        version === 1 ? null : await store.loadScriptVersion(version - 1)

      parseScriptVersion(script, project, research, previous)
      const approved = approveScriptVersion(project, script)
      await store.saveProject(approved)
      console.log(`Approved script v${version}: "${script.id}".`)
      return
    }

    default:
      throw new Error(
        'Usage: videooo script <import <script.json>|list|show [version]|approve <version>>',
      )
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(
    await readFile(resolve(process.cwd(), path), 'utf8'),
  ) as unknown
}

function parseVersion(value: string): number {
  const version = Number(value)
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`Invalid script version: ${value}`)
  }
  return version
}

function printUsage(): void {
  console.log(`Usage:
  videooo init <topic>
  videooo status
  videooo research begin
  videooo research import <research.json>
  videooo research show
  videooo script import <script.json>
  videooo script list
  videooo script show [version]
  videooo script approve <version>`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

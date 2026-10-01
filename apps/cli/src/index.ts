#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { WhisperCppTranscriber } from '@videooo/transcriber-whisper-cpp'
import { renderRemotionVideo } from '@videooo/renderer-remotion'
import { ManimWorker } from '@videooo/manim-worker'
import { runSelfUpdate } from './update.js'
import {
  DEFAULT_VIDEO_STYLE,
  ProjectStore,
  applyQaRepairOverlays,
  acceptAlignment,
  acceptNarration,
  acceptScriptVersion,
  acceptTranscript,
  approveScriptVersion,
  assertQaReportPasses,
  buildNarrationAlignment,
  buildQaReport,
  compilePrevisStoryboard,
  compileStoryboard,
  createProject,
  estimateScriptTiming,
  parseQaRepairOverlay,
  parsePrevisStoryboardArtifact,
  parseQaReviewArtifact,
  parseResearchPack,
  parseScriptVersion,
  parseStoryboardArtifact,
  parseTranscriptArtifact,
  prepareQaEvidence,
  promotePrevisStoryboard,
  transitionProject,
} from '@videooo/core'

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)

  switch (command) {
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      printUsage()
      return
    case '--version':
    case '-V':
    case 'version':
      console.log(await readCliVersion())
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
    case 'narration':
      await handleNarration(args)
      return
    case 'transcript':
      await handleTranscript(args)
      return
    case 'align':
      await handleAlign(args)
      return
    case 'alignment':
      await handleAlignment(args)
      return
    case 'storyboard':
      await handleStoryboard(args)
      return
    case 'scenes':
      await handleScenes(args)
      return
    case 'route':
      await handleRoute(args)
      return
    case 'manim':
      await handleManim(args)
      return
    case 'render':
      await handleRender(args)
      return
    case 'qa':
      await handleQa(args)
      return
    case 'previs':
      await handlePrevis(args)
      return
    case 'update':
      if (args.length > 0) {
        throw new Error('Usage: videooo update')
      }
      runSelfUpdate()
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
  const alignment =
    (await store.hasAlignment()) ? await store.loadAlignment() : null

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
        hasNarration: await store.hasNarration(),
        narrationId: project.narrationId ?? null,
        hasTranscript: await store.hasTranscript(),
        transcriptId: project.transcriptId ?? null,
        hasAlignment: alignment !== null,
        alignmentId: project.alignmentId ?? null,
        alignmentCoverage: alignment?.coverage ?? null,
        hasStoryboard: await store.hasStoryboard(),
        storyboardId: project.storyboardId ?? null,
        styleId: project.styleId ?? null,
        sceneCount: project.sceneCount ?? 0,
        hasRender: await store.hasRenderManifest(),
        renderId: project.renderId ?? null,
        qaRunId: project.qaRunId ?? null,
        qaReportId: project.qaReportId ?? null,
        qaRepairIds: project.qaRepairIds ?? [],
        hasPrevisTiming: await store.hasPrevisTiming(),
        previsTimingId: project.previsTimingId ?? null,
        hasPrevisStoryboard: await store.hasPrevisStoryboard(),
        previsStoryboardId: project.previsStoryboardId ?? null,
        hasPrevisRender: await store.hasPrevisRenderManifest(),
        previsRenderId: project.previsRenderId ?? null,
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

async function handleNarration(args: string[]): Promise<void> {
  const [action, argument] = args
  const store = new ProjectStore()
  const project = await store.loadProject()

  switch (action) {
    case 'add': {
      if (argument === undefined) {
        throw new Error('Usage: videooo narration add <audio-file>')
      }
      if (project.approvedScriptVersionId === undefined) {
        throw new Error('Project has no approved script version')
      }

      await store.loadScriptVersionById(project.approvedScriptVersionId)
      const narration = await store.importNarrationSource(argument, {
        projectId: project.id,
        scriptVersionId: project.approvedScriptVersionId,
      })
      await store.saveProject(acceptNarration(project, narration))
      console.log(
        `Imported narration "${narration.sourceFileName}" as "${narration.id}".`,
      )
      return
    }

    case 'show':
      console.log(JSON.stringify(await store.loadNarration(), null, 2))
      return

    default:
      throw new Error('Usage: videooo narration <add <audio-file>|show>')
  }
}

async function handleTranscript(args: string[]): Promise<void> {
  const [action, argument] = args
  const store = new ProjectStore()
  const project = await store.loadProject()

  switch (action) {
    case 'import': {
      if (argument === undefined) {
        throw new Error('Usage: videooo transcript import <transcript.json>')
      }
      if (project.stage !== 'recorded') {
        throw new Error(
          `Transcript import requires stage "recorded"; current stage is "${project.stage}"`,
        )
      }

      const narration = await store.loadNarration()
      const transcript = parseTranscriptArtifact(
        await readJsonFile(argument),
        project,
        narration,
      )
      await store.saveTranscript(transcript)
      await store.saveProject(acceptTranscript(project, transcript))
      console.log(`Imported transcript "${transcript.id}".`)
      return
    }

    case 'show':
      console.log(JSON.stringify(await store.loadTranscript(), null, 2))
      return

    default:
      throw new Error('Usage: videooo transcript <import <transcript.json>|show>')
  }
}

async function handleAlign(args: string[]): Promise<void> {
  const store = new ProjectStore()
  let project = await store.loadProject()

  if (project.stage !== 'recorded') {
    throw new Error(
      `Alignment requires stage "recorded"; current stage is "${project.stage}"`,
    )
  }
  const approvedScriptVersionId = project.approvedScriptVersionId
  if (approvedScriptVersionId === undefined) {
    throw new Error('Project has no approved script version')
  }

  const narration = await store.loadNarration()
  let transcript

  if (args.includes('--from-transcript')) {
    transcript = await store.loadTranscript()
    if (project.transcriptId !== transcript.id) {
      throw new Error(
        'Project transcript metadata does not match transcript.json. Import the transcript through Videooo first.',
      )
    }
  } else {
    const provider = optionValue(args, '--provider')
    if (provider !== 'whisper-cpp') {
      throw new Error(
        'Usage: videooo align --from-transcript OR videooo align --provider whisper-cpp [--model <path>] [--language <code>] [--binary <path>] [--ffmpeg <path>] [--accept-low-coverage]',
      )
    }
    if (await store.hasTranscript()) {
      throw new Error(
        'A transcript already exists. Use --from-transcript to align it.',
      )
    }

    const modelPath = optionValue(args, '--model')
    const binary = optionValue(args, '--binary')
    const ffmpegBinary = optionValue(args, '--ffmpeg')
    const language = optionValue(args, '--language')
    const transcriber = new WhisperCppTranscriber({
      ...(modelPath === undefined ? {} : { modelPath }),
      ...(binary === undefined ? {} : { binary }),
      ...(ffmpegBinary === undefined ? {} : { ffmpegBinary }),
      ...(language === undefined ? {} : { language }),
    })

    const candidate = await transcriber.transcribe({
      audioPath: store.narrationSourcePath(narration),
      projectId: project.id,
      narrationId: narration.id,
      ...(language === undefined ? {} : { language }),
    })
    transcript = parseTranscriptArtifact(candidate, project, narration)
    await store.saveTranscript(transcript)
    project = acceptTranscript(project, transcript)
    await store.saveProject(project)
    console.log(
      `Transcribed narration locally with whisper.cpp as "${transcript.id}".`,
    )
  }

  const script = await store.loadScriptVersionById(
    approvedScriptVersionId,
  )
  const alignment = buildNarrationAlignment(script, transcript, {
    acceptedLowCoverage: args.includes('--accept-low-coverage'),
  })

  await store.saveAlignment(alignment, {
    replace: await store.hasAlignment(),
  })

  try {
    const aligned = acceptAlignment(project, alignment)
    await store.saveProject(aligned)
  } catch (error) {
    console.error(
      `Alignment candidate saved with coverage ${(alignment.coverage * 100).toFixed(1)}%.`,
    )
    throw error
  }

  console.log(
    `Aligned narration at ${(alignment.coverage * 100).toFixed(1)}% coverage with ${alignment.deviations.length} deviation(s).`,
  )
}

async function handleAlignment(args: string[]): Promise<void> {
  const [action] = args
  if (action !== 'show') {
    throw new Error('Usage: videooo alignment show')
  }

  const store = new ProjectStore()
  console.log(JSON.stringify(await store.loadAlignment(), null, 2))
}

async function handleStoryboard(args: string[]): Promise<void> {
  const [action, argument] = args
  const store = new ProjectStore()
  const project = await store.loadProject()

  switch (action) {
    case 'import': {
      if (argument === undefined) {
        throw new Error('Usage: videooo storyboard import <storyboard.json>')
      }
      if (project.stage !== 'aligned') {
        throw new Error(
          `Storyboard import requires stage "aligned"; current stage is "${project.stage}"`,
        )
      }
      const alignment = await store.loadAlignment()
      const storyboard = parseStoryboardArtifact(
        await readJsonFile(argument),
        project,
        alignment,
      )
      await store.saveStoryboard(storyboard)
      console.log(`Imported storyboard "${storyboard.id}" with ${storyboard.scenes.length} scene(s).`)
      return
    }

    case 'show':
      console.log(JSON.stringify(await store.loadStoryboard(), null, 2))
      return

    case 'compile': {
      if (project.stage !== 'aligned') {
        throw new Error(
          `Storyboard compile requires stage "aligned"; current stage is "${project.stage}"`,
        )
      }
      const alignment = await store.loadAlignment()
      const storyboard = parseStoryboardArtifact(
        await store.loadStoryboard(),
        project,
        alignment,
      )
      const scenes = compileStoryboard(storyboard)
      if (!(await store.hasStyle())) {
        await store.saveStyle(DEFAULT_VIDEO_STYLE)
      }
      await store.saveScenes(scenes)
      const next = transitionProject(
        {
          ...project,
          storyboardId: storyboard.id,
          styleId: DEFAULT_VIDEO_STYLE.id,
          sceneCount: scenes.length,
        },
        'storyboarded',
      )
      await store.saveProject(next)
      console.log(`Compiled ${scenes.length} scene(s) from storyboard "${storyboard.id}".`)
      return
    }

    default:
      throw new Error(
        'Usage: videooo storyboard <import <storyboard.json>|show|compile>',
      )
  }
}

async function handleScenes(args: string[]): Promise<void> {
  const [action, argument] = args
  const store = new ProjectStore()

  if (action === 'list') {
    console.log(
      JSON.stringify(
        (await store.listScenes()).map((scene) => ({
          id: scene.id,
          startMs: scene.startMs,
          durationMs: scene.durationMs,
          visualKind: scene.visualKind,
          teachingGoal: scene.teachingGoal,
        })),
        null,
        2,
      ),
    )
    return
  }

  if (action === 'show') {
    if (argument === undefined) {
      throw new Error('Usage: videooo scenes show <scene-id>')
    }
    console.log(JSON.stringify(await store.loadScene(argument), null, 2))
    return
  }

  throw new Error('Usage: videooo scenes <list|show <scene-id>>')
}

async function handleRoute(args: string[]): Promise<void> {
  const [action] = args
  if (action !== 'show') {
    throw new Error('Usage: videooo route show')
  }

  const store = new ProjectStore()
  console.log(
    JSON.stringify(
      (await loadEffectiveScenes(store)).map((scene) => ({
        id: scene.id,
        visualKind: scene.visualKind,
        renderer: scene.renderer,
      })),
      null,
      2,
    ),
  )
}

async function handleManim(args: string[]): Promise<void> {
  const [action, sceneId] = args
  const binary = optionValue(args, '--manim-bin')
  const ffprobeBinary = optionValue(args, '--ffprobe')
  const worker = new ManimWorker({
    ...(binary === undefined ? {} : { binary }),
    ...(ffprobeBinary === undefined ? {} : { ffprobeBinary }),
  })

  if (action === 'check') {
    console.log(JSON.stringify(worker.check(), null, 2))
    return
  }

  const store = new ProjectStore()
  const storyboard = await store.loadStoryboard()
  const style = await store.loadStyle()
  const scenes = await loadEffectiveScenes(store)
  const manimScenes = scenes.filter((scene) => scene.renderer === 'manim')

  if (action === 'render') {
    if (sceneId === undefined || sceneId.startsWith('--')) {
      throw new Error(
        'Usage: videooo manim render <scene-id> [--manim-bin <path>]',
      )
    }
    const scene = manimScenes.find((candidate) => candidate.id === sceneId)
    if (scene === undefined) {
      throw new Error(`Manim scene "${sceneId}" does not exist`)
    }
    const asset = await renderOneManimScene(
      worker,
      store,
      scene,
      storyboard.video,
      style,
    )
    console.log(JSON.stringify(asset, null, 2))
    return
  }

  if (action === 'render-all') {
    let count = 0
    for (const scene of manimScenes) {
      await renderOneManimScene(
        worker,
        store,
        scene,
        storyboard.video,
        style,
      )
      count += 1
    }
    console.log(`Rendered or reused ${count} Manim scene asset(s).`)
    return
  }

  throw new Error(
    'Usage: videooo manim <check|render <scene-id>|render-all> [--manim-bin <path>]',
  )
}

async function renderOneManimScene(
  worker: ManimWorker,
  store: ProjectStore,
  scene: Awaited<ReturnType<ProjectStore['listScenes']>>[number],
  video: Awaited<ReturnType<ProjectStore['loadStoryboard']>>['video'],
  style: Awaited<ReturnType<ProjectStore['loadStyle']>>,
) {
  const asset = await worker.render({
    scene,
    style,
    video,
    generatedDirectory: store.manimGeneratedDirectory,
    mediaDirectory: store.manimMediaDirectory,
    outputDirectory: store.sceneRendersDirectory,
  })
  await store.saveSceneRenderAsset(asset)
  return asset
}

async function handleRender(args: string[]): Promise<void> {
  const store = new ProjectStore()
  let project = await store.loadProject()

  if (project.stage === 'storyboarded') {
    project = transitionProject(project, 'rendering')
    await store.saveProject(project)
  } else if (project.stage !== 'rendering') {
    throw new Error(
      `Render requires stage "storyboarded" or "rendering"; current stage is "${project.stage}"`,
    )
  }

  if (project.storyboardId === undefined || project.alignmentId === undefined) {
    throw new Error('Project is missing storyboard/alignment metadata')
  }

  const storyboard = await store.loadStoryboard()
  const alignment = await store.loadAlignment()
  const narration = await store.loadNarration()
  const style = await store.loadStyle()
  const scenes = await loadEffectiveScenes(store, project)

  if (storyboard.id !== project.storyboardId) {
    throw new Error('Storyboard artifact does not match project metadata')
  }
  if (alignment.id !== project.alignmentId) {
    throw new Error('Alignment artifact does not match project metadata')
  }
  if (scenes.length !== project.sceneCount) {
    throw new Error('Compiled Scene IR count does not match project metadata')
  }

  const manimSceneAssets: Record<string, string> = {}
  const manimScenes = scenes.filter((scene) => scene.renderer === 'manim')
  if (manimScenes.length > 0) {
    const manimBinary = optionValue(args, '--manim-bin')
    const ffprobeBinary = optionValue(args, '--ffprobe')
    const worker = new ManimWorker({
      ...(manimBinary === undefined ? {} : { binary: manimBinary }),
      ...(ffprobeBinary === undefined ? {} : { ffprobeBinary }),
    })

    for (const scene of manimScenes) {
      const asset = await renderOneManimScene(
        worker,
        store,
        scene,
        storyboard.video,
        style,
      )
      manimSceneAssets[scene.id] = resolve(
        store.sceneRendersDirectory,
        asset.fileName,
      )
    }
  }

  const requestedOutput = optionValue(args, '--output')
  const outputLocation =
    requestedOutput === undefined
      ? store.draftRenderPath
      : resolve(process.cwd(), requestedOutput)

  const result = await renderRemotionVideo({
    scenes,
    style,
    video: storyboard.video,
    durationMs: alignment.durationMs,
    narrationSourcePath: store.narrationSourcePath(narration),
    workspaceDirectory: store.renderWorkspaceDirectory,
    outputLocation,
    manimSceneAssets,
  })

  const repairRevision = project.qaRepairIds?.length ?? 0
  const manifest = {
    schemaVersion: 1 as const,
    id: `render-${storyboard.id}-r${String(repairRevision).padStart(3, '0')}`,
    projectId: project.id,
    storyboardId: storyboard.id,
    alignmentId: alignment.id,
    createdAt: new Date().toISOString(),
    renderer: 'remotion' as const,
    outputPath:
      requestedOutput === undefined ? 'renders/draft.mp4' : requestedOutput,
    width: storyboard.video.width,
    height: storyboard.video.height,
    fps: storyboard.video.fps,
    durationMs: alignment.durationMs,
    codec: 'h264' as const,
  }

  await store.saveRenderManifest(manifest)
  const renderedProject = { ...project, renderId: manifest.id }
  delete renderedProject.qaRunId
  delete renderedProject.qaReportId
  project = transitionProject(renderedProject, 'qa')
  await store.saveProject(project)

  console.log(
    `Rendered ${result.frameCount} frame(s) to ${result.outputLocation}. Project is ready for QA.`,
  )
}

async function handlePrevis(args: string[]): Promise<void> {
  const [action, subaction, argument] = args
  const store = new ProjectStore()
  let project = await store.loadProject()

  if (action === 'create') {
    if (project.stage !== 'approved') {
      throw new Error(
        `Previs create requires stage "approved"; current stage is "${project.stage}"`,
      )
    }
    const approvedScriptVersionId = project.approvedScriptVersionId
    if (approvedScriptVersionId === undefined) {
      throw new Error('Project has no approved script version')
    }

    const script = await store.loadScriptVersionById(approvedScriptVersionId)
    const targetSeconds = optionValue(args, '--target-seconds')
    const targetDurationMs =
      targetSeconds === undefined
        ? undefined
        : Math.round(parsePositiveNumber(targetSeconds, '--target-seconds') * 1000)
    const timing = estimateScriptTiming(project, script, {
      ...(targetDurationMs === undefined ? {} : { targetDurationMs }),
    })
    await store.savePrevisTiming(timing)

    project = {
      ...project,
      previsTimingId: timing.id,
    }
    delete project.previsStoryboardId
    delete project.previsRenderId
    await store.saveProject(project)

    console.log(
      `Created estimated previs timing "${timing.id}" for ${(timing.durationMs / 1000).toFixed(1)}s. Project remains approved.`,
    )
    return
  }

  if (action === 'timing') {
    console.log(JSON.stringify(await store.loadPrevisTiming(), null, 2))
    return
  }

  if (action === 'storyboard') {
    if (subaction === 'show') {
      console.log(JSON.stringify(await store.loadPrevisStoryboard(), null, 2))
      return
    }

    if (project.stage !== 'approved') {
      throw new Error(
        `Previs storyboard requires stage "approved"; current stage is "${project.stage}"`,
      )
    }

    const timing = await store.loadPrevisTiming()
    if (subaction === 'import') {
      if (argument === undefined) {
        throw new Error(
          'Usage: videooo previs storyboard import <storyboard.json>',
        )
      }
      const storyboard = parsePrevisStoryboardArtifact(
        await readJsonFile(argument),
        project,
        timing,
      )
      await store.savePrevisStoryboard(storyboard)
      project = {
        ...project,
        previsStoryboardId: storyboard.id,
      }
      delete project.previsRenderId
      await store.saveProject(project)
      console.log(
        `Imported previs storyboard "${storyboard.id}" with ${storyboard.scenes.length} scene(s).`,
      )
      return
    }

    if (subaction === 'compile') {
      const storyboard = parsePrevisStoryboardArtifact(
        await store.loadPrevisStoryboard(),
        project,
        timing,
      )
      const scenes = compilePrevisStoryboard(storyboard)
      await store.savePrevisScenes(scenes)
      project = {
        ...project,
        previsStoryboardId: storyboard.id,
      }
      await store.saveProject(project)
      console.log(
        `Compiled ${scenes.length} previs scene(s). Project remains approved.`,
      )
      return
    }

    throw new Error(
      'Usage: videooo previs storyboard <import <storyboard.json>|show|compile>',
    )
  }

  if (action === 'scenes') {
    if (subaction !== 'list') {
      throw new Error('Usage: videooo previs scenes list')
    }
    console.log(
      JSON.stringify(
        (await store.listPrevisScenes()).map((scene) => ({
          id: scene.id,
          startMs: scene.startMs,
          durationMs: scene.durationMs,
          visualKind: scene.visualKind,
          renderer: scene.renderer,
          teachingGoal: scene.teachingGoal,
        })),
        null,
        2,
      ),
    )
    return
  }

  if (action === 'route') {
    if (subaction !== 'show') {
      throw new Error('Usage: videooo previs route show')
    }
    console.log(
      JSON.stringify(
        (await store.listPrevisScenes()).map((scene) => ({
          id: scene.id,
          visualKind: scene.visualKind,
          renderer: scene.renderer,
        })),
        null,
        2,
      ),
    )
    return
  }

  if (action === 'render') {
    if (project.stage !== 'approved') {
      throw new Error(
        `Previs render requires stage "approved"; current stage is "${project.stage}"`,
      )
    }

    const timing = await store.loadPrevisTiming()
    const storyboard = parsePrevisStoryboardArtifact(
      await store.loadPrevisStoryboard(),
      project,
      timing,
    )
    const scenes = await store.listPrevisScenes()
    if (scenes.length !== storyboard.scenes.length) {
      throw new Error(
        'Previs Scene IR is missing or stale; run videooo previs storyboard compile',
      )
    }

    const style =
      (await store.hasStyle()) ? await store.loadStyle() : DEFAULT_VIDEO_STYLE
    const manimSceneAssets: Record<string, string> = {}
    const manimScenes = scenes.filter((scene) => scene.renderer === 'manim')
    if (manimScenes.length > 0) {
      const manimBinary = optionValue(args, '--manim-bin')
      const ffprobeBinary = optionValue(args, '--ffprobe')
      const worker = new ManimWorker({
        ...(manimBinary === undefined ? {} : { binary: manimBinary }),
        ...(ffprobeBinary === undefined ? {} : { ffprobeBinary }),
      })

      for (const scene of manimScenes) {
        const asset = await renderOnePrevisManimScene(
          worker,
          store,
          scene,
          storyboard.video,
          style,
        )
        manimSceneAssets[scene.id] = resolve(
          store.previsSceneRendersDirectory,
          asset.fileName,
        )
      }
    }

    const requestedOutput = optionValue(args, '--output')
    const outputLocation =
      requestedOutput === undefined
        ? store.previsPreviewPath
        : resolve(process.cwd(), requestedOutput)

    const result = await renderRemotionVideo({
      scenes,
      style,
      video: storyboard.video,
      durationMs: timing.durationMs,
      workspaceDirectory: store.previsRenderWorkspaceDirectory,
      outputLocation,
      manimSceneAssets,
    })

    const manifest = {
      schemaVersion: 1 as const,
      id: `previs-render-${storyboard.id}`,
      projectId: project.id,
      storyboardId: storyboard.id,
      timingId: timing.id,
      createdAt: new Date().toISOString(),
      renderer: 'remotion' as const,
      outputPath:
        requestedOutput === undefined
          ? 'previs/renders/preview.mp4'
          : requestedOutput,
      width: storyboard.video.width,
      height: storyboard.video.height,
      fps: storyboard.video.fps,
      durationMs: timing.durationMs,
      codec: 'h264' as const,
    }
    await store.savePrevisRenderManifest(manifest)
    project = { ...project, previsRenderId: manifest.id }
    await store.saveProject(project)

    console.log(
      `Rendered silent previs ${result.frameCount} frame(s) to ${result.outputLocation}. Project remains approved.`,
    )
    return
  }

  if (action === 'promote') {
    if (project.stage !== 'aligned') {
      throw new Error(
        `Previs promote requires stage "aligned"; current stage is "${project.stage}"`,
      )
    }
    if (await store.hasStoryboard()) {
      throw new Error(
        'Production storyboard already exists; refusing to overwrite it with previs.',
      )
    }

    const timing = await store.loadPrevisTiming()
    const previs = await store.loadPrevisStoryboard()
    const alignment = await store.loadAlignment()
    const promoted = promotePrevisStoryboard(previs, timing, alignment)
    parseStoryboardArtifact(promoted, project, alignment)
    await store.saveStoryboard(promoted)

    console.log(
      `Promoted previs storyboard "${promoted.id}" onto real narration timing. Run videooo storyboard compile next.`,
    )
    return
  }

  throw new Error(
    'Usage: videooo previs <create|timing|storyboard import/show/compile|scenes list|route show|render|promote>',
  )
}

async function renderOnePrevisManimScene(
  worker: ManimWorker,
  store: ProjectStore,
  scene: Awaited<ReturnType<ProjectStore['listPrevisScenes']>>[number],
  video: Awaited<ReturnType<ProjectStore['loadPrevisStoryboard']>>['video'],
  style: typeof DEFAULT_VIDEO_STYLE,
) {
  const asset = await worker.render({
    scene,
    style,
    video,
    generatedDirectory: store.previsManimGeneratedDirectory,
    mediaDirectory: store.previsManimMediaDirectory,
    outputDirectory: store.previsSceneRendersDirectory,
  })
  await store.savePrevisSceneRenderAsset(asset)
  return asset
}

async function handleQa(args: string[]): Promise<void> {
  const [action, argument] = args
  const store = new ProjectStore()
  let project = await store.loadProject()

  if (action === 'prepare') {
    if (project.stage !== 'qa') {
      throw new Error(
        `QA prepare requires stage "qa"; current stage is "${project.stage}"`,
      )
    }
    const approvedScriptVersionId = project.approvedScriptVersionId
    if (
      project.renderId === undefined ||
      project.storyboardId === undefined ||
      project.alignmentId === undefined ||
      approvedScriptVersionId === undefined
    ) {
      throw new Error('Project is missing render/storyboard/alignment/script metadata')
    }

    const render = await store.loadRenderManifest()
    const alignment = await store.loadAlignment()
    const script = await store.loadScriptVersionById(approvedScriptVersionId)
    const scenes = await loadEffectiveScenes(store, project)
    const sceneRenderIndex = await store.loadSceneRenderIndex()
    const manimAssetPaths = Object.fromEntries(
      sceneRenderIndex.assets.map((asset) => [
        asset.sceneId,
        resolve(store.sceneRendersDirectory, asset.fileName),
      ]),
    )
    const runId = await store.nextQaRunId()
    const ffmpegBinary = optionValue(args, '--ffmpeg')
    const ffprobeBinary = optionValue(args, '--ffprobe')
    const evidence = await prepareQaEvidence({
      project,
      render,
      alignment,
      script,
      scenes,
      sceneRenderAssets: sceneRenderIndex.assets,
      manimAssetPaths,
      videoPath: resolveRenderOutputPath(store, render.outputPath),
      videoPathLabel: render.outputPath,
      framesDirectory: store.qaFramesDirectory(runId),
      evidenceId: runId,
      ...(ffmpegBinary === undefined ? {} : { ffmpegBinary }),
      ...(ffprobeBinary === undefined ? {} : { ffprobeBinary }),
    })

    await store.saveQaEvidence(evidence)
    project = { ...project, qaRunId: runId }
    delete project.qaReportId
    await store.saveProject(project)

    const frameCount = evidence.scenes.reduce(
      (total, scene) => total + scene.frameSamples.length,
      0,
    )
    console.log(
      `Prepared QA evidence "${runId}" with ${frameCount} frame(s) and ${evidence.structuralFindings.length} structural finding(s).`,
    )
    return
  }

  const runId = project.qaRunId
  if (runId === undefined) {
    throw new Error('No QA run has been prepared.')
  }

  if (action === 'evidence') {
    console.log(JSON.stringify(await store.loadQaEvidence(runId), null, 2))
    return
  }

  if (action === 'import') {
    if (project.stage !== 'qa') {
      throw new Error(
        `QA import requires stage "qa"; current stage is "${project.stage}"`,
      )
    }
    if (argument === undefined) {
      throw new Error('Usage: videooo qa import <review.json>')
    }

    const evidence = await store.loadQaEvidence(runId)
    const review = parseQaReviewArtifact(
      await readJsonFile(argument),
      evidence,
    )
    await store.saveQaReview(runId, review)
    const report = buildQaReport(evidence, review)
    await store.saveQaReport(runId, report)
    project = { ...project, qaReportId: report.id }
    await store.saveProject(project)

    console.log(
      `Imported QA review "${review.id}": ${report.status}, ${report.blockingFindingIds.length} blocking finding(s).`,
    )
    return
  }

  if (action === 'report') {
    console.log(JSON.stringify(await store.loadQaReport(runId), null, 2))
    return
  }

  if (action === 'rerender') {
    if (project.stage !== 'qa') {
      throw new Error(
        `QA rerender requires stage "qa"; current stage is "${project.stage}"`,
      )
    }
    const report = await store.loadQaReport(runId)
    const structuralBlockers = report.findings.filter(
      (finding) =>
        finding.severity === 'error' &&
        finding.category === 'structural',
    )
    if (structuralBlockers.length === 0) {
      throw new Error(
        'QA rerender without a repair overlay requires a blocking structural finding',
      )
    }
    project = transitionProject(project, 'rendering')
    await store.saveProject(project)
    console.log(
      `Project returned to rendering for ${structuralBlockers.length} structural blocker(s).`,
    )
    return
  }

  if (action === 'repair') {
    if (project.stage !== 'qa') {
      throw new Error(
        `QA repair requires stage "qa"; current stage is "${project.stage}"`,
      )
    }
    if (argument !== 'import' || args[2] === undefined) {
      throw new Error('Usage: videooo qa repair import <repair.json>')
    }
    const report = await store.loadQaReport(runId)
    if (project.qaReportId !== report.id) {
      throw new Error('Latest QA report does not match project metadata')
    }
    if (report.status !== 'fail') {
      throw new Error('QA repair requires a failing report')
    }

    const effectiveScenes = await loadEffectiveScenes(store, project)
    const overlay = parseQaRepairOverlay(
      await readJsonFile(args[2]),
      project,
      report,
      effectiveScenes,
    )
    await store.saveQaRepair(overlay)
    const repairIds = [...(project.qaRepairIds ?? []), overlay.id]
    project = transitionProject(
      { ...project, qaRepairIds: repairIds },
      'rendering',
    )
    await store.saveProject(project)
    console.log(
      `Imported QA repair "${overlay.id}" for ${overlay.sceneRepairs.length} scene(s). Project returned to rendering.`,
    )
    return
  }

  if (action === 'accept') {
    if (project.stage !== 'qa') {
      throw new Error(
        `QA accept requires stage "qa"; current stage is "${project.stage}"`,
      )
    }
    const report = await store.loadQaReport(runId)
    if (project.qaReportId !== report.id) {
      throw new Error('Latest QA report does not match project metadata')
    }
    assertQaReportPasses(report)
    const render = await store.loadRenderManifest()
    await store.acceptRenderAsFinal(
      resolveRenderOutputPath(store, render.outputPath),
    )
    project = transitionProject(project, 'done')
    await store.saveProject(project)
    console.log(
      `QA accepted. Final video copied to ${store.finalRenderPath}.`,
    )
    return
  }

  throw new Error(
    'Usage: videooo qa <prepare|evidence|import <review.json>|report|rerender|repair import <repair.json>|accept> [--ffmpeg <path>] [--ffprobe <path>]',
  )
}

async function loadEffectiveScenes(
  store: ProjectStore,
  project?: Awaited<ReturnType<ProjectStore['loadProject']>>,
) {
  const currentProject = project ?? (await store.loadProject())
  const baseScenes = await store.listScenes()
  const overlays = await store.loadQaRepairs(currentProject.qaRepairIds ?? [])
  return applyQaRepairOverlays(baseScenes, overlays)
}

function resolveRenderOutputPath(
  store: ProjectStore,
  outputPath: string,
): string {
  if (outputPath === 'renders/draft.mp4') {
    return store.draftRenderPath
  }
  return resolve(process.cwd(), outputPath)
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(
    await readFile(resolve(process.cwd(), path), 'utf8'),
  ) as unknown
}

async function readCliVersion(): Promise<string> {
  const packageUrl = new URL('../package.json', import.meta.url)
  const value = JSON.parse(await readFile(packageUrl, 'utf8')) as {
    version?: unknown
  }
  if (typeof value.version !== 'string') {
    throw new Error('Unable to read @videooo/cli version')
  }
  return value.version
}

function optionValue(
  args: readonly string[],
  name: string,
): string | undefined {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}`)
  }
  return value
}

function parsePositiveNumber(value: string, name: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return number
}

function parseVersion(value: string): number {
  const version = Number(value)
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`Invalid script version: ${value}`)
  }
  return version
}

function printUsage(): void {
  console.log(`Videooo — AI-native educational video workflow

Usage:
  videooo --version
  videooo --help
  videooo update
  videooo init <topic>
  videooo status
  videooo research begin
  videooo research import <research.json>
  videooo research show
  videooo script import <script.json>
  videooo script list
  videooo script show [version]
  videooo script approve <version>
  videooo previs create [--target-seconds <seconds>]
  videooo previs timing
  videooo previs storyboard import <storyboard.json>
  videooo previs storyboard show
  videooo previs storyboard compile
  videooo previs scenes list
  videooo previs route show
  videooo previs render [--output <file>] [--manim-bin <path>] [--ffprobe <path>]
  videooo previs promote
  videooo narration add <audio-file>
  videooo narration show
  videooo transcript import <transcript.json>
  videooo transcript show
  videooo align --from-transcript [--accept-low-coverage]
  videooo align --provider whisper-cpp [--model <path>] [--language <code>] [--binary <path>] [--ffmpeg <path>] [--accept-low-coverage]
  videooo alignment show
  videooo storyboard import <storyboard.json>
  videooo storyboard show
  videooo storyboard compile
  videooo scenes list
  videooo scenes show <scene-id>
  videooo route show
  videooo manim check [--manim-bin <path>]
  videooo manim render <scene-id> [--manim-bin <path>]
  videooo manim render-all [--manim-bin <path>]
  videooo render [--output <file>] [--manim-bin <path>] [--ffprobe <path>]
  videooo qa prepare [--ffmpeg <path>] [--ffprobe <path>]
  videooo qa evidence
  videooo qa import <review.json>
  videooo qa report
  videooo qa rerender
  videooo qa repair import <repair.json>
  videooo qa accept`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

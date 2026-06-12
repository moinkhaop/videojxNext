import {
  BatchTask,
  ConversionTask,
  EnhancedVideoParserConfig,
  ExtendedBatchTask,
  ParsedVideoInfo,
  TaskStatus,
  VideoParserConfig,
  WebDAVConfig,
} from '../types'
import {
  buildDouyinUserFolderPath,
  buildStableBatchVideoFileName,
  type UploadRuntimeControl,
} from './conversion-upload'

export type BatchPoolStage = 'normal_batch' | 'douyin_upload'

export type BatchPoolEvent =
  | 'init'
  | 'task_started'
  | 'task_settled'
  | 'scale_up'
  | 'scale_down'

export interface BatchPoolState {
  stage: BatchPoolStage
  event: BatchPoolEvent
  currentConcurrency: number
  maxConcurrency: number
  inFlight: number
  processed: number
  total: number
}

export type BatchRuntimeCallbacks = {
  onPoolState?: (state: BatchPoolState) => void
  isCancelled?: () => boolean
  getAbortSignal?: () => AbortSignal | undefined
}

type BatchOrchestratorDeps = {
  batchConcurrency: number
  douyinUploadConcurrency: number
  interTaskDelayMs: number
  parseVideo: (videoUrl: string, parserConfig: VideoParserConfig) => Promise<ParsedVideoInfo>
  parseDouyinUser: (
    userUrl: string,
    limit: number,
    parsers?: EnhancedVideoParserConfig[],
    preferredParserId?: string
  ) => Promise<ParsedVideoInfo[]>
  uploadToWebDAV: (
    mediaInfo: ParsedVideoInfo,
    webdavConfig: WebDAVConfig,
    folderPath?: string,
    onProgress?: (progress: number, hint: string) => void,
    sourceUrl?: string,
    runtimeControl?: UploadRuntimeControl
  ) => Promise<string>
  extractRealUrl: (input: string) => string
  isValidVideoInputUrl: (input: string) => boolean
  isCancellationError: (error: unknown) => boolean
  createCancellationError: (message?: string) => Error
  cleanupAfterTaskCompletion: (task: ConversionTask | BatchTask | ExtendedBatchTask) => Promise<void>
  generateTaskId: () => string
}

export async function convertBatchTask(
  batchTask: BatchTask,
  deps: BatchOrchestratorDeps,
  onProgress?: (batchProgress: number, currentTask?: ConversionTask) => void,
  callbacks?: BatchRuntimeCallbacks
): Promise<BatchTask> {
  ensureNotCancelled(callbacks, deps)
  batchTask.status = TaskStatus.PARSING

  const totalTasks = batchTask.tasks.length
  let completedTasks = 0

  if (totalTasks > 0) {
    prewarmBatchParse(batchTask.tasks, batchTask.parserConfig, deps)

    const inFlightProgress = new Map<string, number>()

    const emitOverallProgress = (currentTask?: ConversionTask) => {
      const partial = Array.from(inFlightProgress.values()).reduce((sum, value) => sum + value, 0) / 100
      const overall = ((completedTasks + partial) / totalTasks) * 100
      onProgress?.(Math.min(99.9, overall), currentTask)
    }

    await runAdaptivePool(
      'normal_batch',
      totalTasks,
      deps,
      async (index) => {
        if (isCancellationRequested(callbacks)) {
          return false
        }

        const task = batchTask.tasks[index]
        inFlightProgress.set(task.id, 0)
        emitOverallProgress(task)

        try {
          const updatedTask = await convertSingleTask(
            task,
            batchTask.parserConfig,
            batchTask.webdavConfig,
            deps,
            (progress, status) => {
              task.status = status
              inFlightProgress.set(task.id, Math.max(0, Math.min(99, progress)))
              emitOverallProgress(task)
            },
            callbacks
          )

          batchTask.tasks[index] = updatedTask

          if (updatedTask.status === TaskStatus.SUCCESS) {
            completedTasks++
            return true
          }

          return false
        } catch (error) {
          if (deps.isCancellationError(error) || isCancellationRequested(callbacks)) {
            return false
          }
          console.error('批量任务中的单个任务失败:', error)
          task.status = TaskStatus.FAILED
          task.completedAt = new Date()
          task.error = error instanceof Error ? error.message : '任务失败'
          batchTask.tasks[index] = task
          return false
        } finally {
          inFlightProgress.delete(task.id)
          batchTask.completedTasks = completedTasks
        }
      },
      (index, processed) => {
        onProgress?.((processed / totalTasks) * 100, batchTask.tasks[index])
      },
      callbacks?.onPoolState,
      callbacks?.isCancelled
    )
  }

  ensureNotCancelled(callbacks, deps)
  batchTask.completedAt = new Date()

  if (completedTasks === totalTasks) {
    batchTask.status = TaskStatus.SUCCESS
    await deps.cleanupAfterTaskCompletion(batchTask)
  } else if (completedTasks === 0) {
    batchTask.status = TaskStatus.FAILED
  } else {
    batchTask.status = TaskStatus.SUCCESS
  }

  return batchTask
}

export async function convertSingleTask(
  task: ConversionTask,
  parserConfig: VideoParserConfig,
  webdavConfig: WebDAVConfig,
  deps: BatchOrchestratorDeps,
  onProgress?: (progress: number, status: TaskStatus) => void,
  callbacks?: BatchRuntimeCallbacks
): Promise<ConversionTask> {
  try {
    ensureNotCancelled(callbacks, deps)
    task.status = TaskStatus.PARSING
    onProgress?.(20, TaskStatus.PARSING)

    console.log(`[转存] 开始解析视频: ${task.videoUrl}`)
    console.log(`[转存] 使用解析器: ${parserConfig.name} (${parserConfig.apiUrl})`)

    try {
      if (!deps.isValidVideoInputUrl(task.videoUrl)) {
        throw new Error('视频链接格式无效，请确保以http://或https://开头')
      }

      const parsedInfo = await deps.parseVideo(task.videoUrl, parserConfig)
      ensureNotCancelled(callbacks, deps)
      console.log(`[转存] 解析成功，媒体类型: ${parsedInfo.mediaType}`)

      task.parsedVideoInfo = parsedInfo
      task.videoTitle = parsedInfo.title
      console.log(`[转存] 解析完成: ${parsedInfo.title}`)
    } catch (error) {
      console.error('[转存] 视频解析失败:', error)
      if (deps.isCancellationError(error) || isCancellationRequested(callbacks)) {
        throw deps.createCancellationError()
      }

      task.status = TaskStatus.FAILED
      let errorMsg = error instanceof Error ? error.message : '视频解析失败'
      if (errorMsg.includes('URL为空')) {
        errorMsg = 'URL为空 - 解析API无法提取视频URL，请尝试其他解析API或检查链接'
      }

      task.error = errorMsg
      task.completedAt = new Date()
      return task
    }

    onProgress?.(50, TaskStatus.PARSING)
    task.status = TaskStatus.UPLOADING
    onProgress?.(60, TaskStatus.UPLOADING)
    ensureNotCancelled(callbacks, deps)

    const filePath = await deps.uploadToWebDAV(
      task.parsedVideoInfo!,
      webdavConfig,
      undefined,
      undefined,
      task.videoUrl,
      {
        signal: callbacks?.getAbortSignal?.(),
        isCancelled: callbacks?.isCancelled,
      }
    )

    task.status = TaskStatus.SUCCESS
    task.completedAt = new Date()
    task.uploadResult = {
      success: true,
      filePath,
    }

    onProgress?.(100, TaskStatus.SUCCESS)
    await deps.cleanupAfterTaskCompletion(task)
    return task
  } catch (error) {
    if (deps.isCancellationError(error) || isCancellationRequested(callbacks)) {
      throw deps.createCancellationError()
    }

    task.status = TaskStatus.FAILED
    task.completedAt = new Date()
    task.error = error instanceof Error ? error.message : '转存过程中发生未知错误'
    task.uploadResult = {
      success: false,
      error: task.error,
    }

    await deps.cleanupAfterTaskCompletion(task)
    onProgress?.(0, TaskStatus.FAILED)
    return task
  }
}

export async function convertDouyinUserBatchTask(
  batchTask: ExtendedBatchTask,
  deps: BatchOrchestratorDeps,
  onProgress?: (batchProgress: number, currentTask?: ConversionTask) => void,
  callbacks?: BatchRuntimeCallbacks
): Promise<ExtendedBatchTask> {
  ensureNotCancelled(callbacks, deps)
  batchTask.status = TaskStatus.PARSING

  try {
    onProgress?.(10, undefined)
    ensureNotCancelled(callbacks, deps)

    if (!batchTask.sourceUrl) {
      throw new Error('缺少用户主页URL')
    }

    console.log(`[抖音用户批量转存] 开始解析用户主页: ${batchTask.sourceUrl}`)

    const limit = batchTask.totalTasks || 20
    const userVideos = await deps.parseDouyinUser(
      batchTask.sourceUrl,
      limit,
      undefined,
      batchTask.parserConfig?.id
    )
    ensureNotCancelled(callbacks, deps)

    batchTask.totalSourceVideos = userVideos.length
    batchTask.totalTasks = userVideos.length
    batchTask.tasks = userVideos.map((video) => ({
      id: deps.generateTaskId(),
      videoUrl: video.url || '',
      videoTitle: video.title,
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      parsedVideoInfo: video,
    }))

    onProgress?.(20, undefined)
    console.log(`[抖音用户批量转存] 获取到 ${userVideos.length} 个视频，开始批量转存`)

    const totalTasks = batchTask.tasks.length
    let completedTasks = 0
    const userFolderPath = buildDouyinUserFolderPath(userVideos)

    if (totalTasks > 0) {
      await runAdaptivePool(
        'douyin_upload',
        totalTasks,
        deps,
        async (index) => {
          if (isCancellationRequested(callbacks)) {
            return false
          }

          const task = batchTask.tasks[index]
          try {
            task.status = TaskStatus.UPLOADING
            console.log(`[抖音用户批量转存] 上传视频 ${index + 1}/${totalTasks}: ${task.videoTitle}`)

            const filePath = await deps.uploadToWebDAV(
              task.parsedVideoInfo!,
              batchTask.webdavConfig,
              userFolderPath,
              undefined,
              task.videoUrl,
              {
                signal: callbacks?.getAbortSignal?.(),
                isCancelled: callbacks?.isCancelled,
                fileNameOverride: buildStableBatchVideoFileName(task.parsedVideoInfo!, task.videoUrl),
              }
            )

            task.status = TaskStatus.SUCCESS
            task.completedAt = new Date()
            task.uploadResult = {
              success: true,
              filePath,
            }

            completedTasks++
            console.log(`[抖音用户批量转存] 上传成功: ${task.videoTitle}`)
            return true
          } catch (error) {
            console.error('[抖音用户批量转存] 任务失败:', error)
            if (deps.isCancellationError(error) || isCancellationRequested(callbacks)) {
              return false
            }
            task.status = TaskStatus.FAILED
            task.completedAt = new Date()
            task.error = error instanceof Error ? error.message : '上传失败'
            task.uploadResult = {
              success: false,
              error: task.error,
            }
            return false
          }
        },
        (index, processed) => {
          batchTask.completedTasks = completedTasks
          const progress = 20 + (processed / totalTasks) * 70
          onProgress?.(progress, batchTask.tasks[index])
        },
        callbacks?.onPoolState,
        callbacks?.isCancelled
      )
    }

    ensureNotCancelled(callbacks, deps)
    batchTask.completedAt = new Date()

    if (completedTasks === totalTasks) {
      batchTask.status = TaskStatus.SUCCESS
      await deps.cleanupAfterTaskCompletion(batchTask)
    } else if (completedTasks === 0) {
      batchTask.status = TaskStatus.FAILED
    } else {
      batchTask.status = TaskStatus.SUCCESS
    }

    onProgress?.(100, undefined)
    console.log(`[抖音用户批量转存] 批量转存完成，成功: ${completedTasks}/${totalTasks}`)
    return batchTask
  } catch (error) {
    console.error('[抖音用户批量转存] 批量转存失败:', error)
    if (deps.isCancellationError(error) || isCancellationRequested(callbacks)) {
      throw deps.createCancellationError()
    }
    batchTask.status = TaskStatus.FAILED
    batchTask.completedAt = new Date()
    throw error
  }
}

function prewarmBatchParse(
  tasks: ConversionTask[],
  parserConfig: VideoParserConfig,
  deps: BatchOrchestratorDeps
) {
  const seen = new Set<string>()
  const warmCount = Math.min(tasks.length, Math.max(2, deps.batchConcurrency * 2))

  for (let i = 0; i < warmCount; i++) {
    const task = tasks[i]
    if (!task?.videoUrl) continue
    try {
      const extracted = deps.extractRealUrl(task.videoUrl)
      const parserId = parserConfig.id ?? parserConfig.name ?? parserConfig.apiUrl
      const key = `${parserId}::${extracted}`
      if (seen.has(key)) continue
      seen.add(key)
      void deps.parseVideo(task.videoUrl, parserConfig).catch(() => undefined)
    } catch {
      // 预热阶段忽略非法链接，避免影响主流程。
    }
  }
}

async function runAdaptivePool(
  stage: BatchPoolStage,
  totalTasks: number,
  deps: BatchOrchestratorDeps,
  runTask: (index: number) => Promise<boolean>,
  onTaskSettled?: (index: number, processed: number) => void,
  onPoolState?: (state: BatchPoolState) => void,
  isCancelled?: () => boolean
) {
  if (totalTasks <= 0) {
    return
  }

  let nextIndex = 0
  let inFlight = 0
  let processed = 0

  const stageConcurrencyCap = stage === 'douyin_upload'
    ? Math.min(deps.batchConcurrency, deps.douyinUploadConcurrency)
    : deps.batchConcurrency
  const initialConcurrency = Math.min(stageConcurrencyCap, totalTasks)
  let currentConcurrency = initialConcurrency

  const emitPoolState = (event: BatchPoolEvent) => {
    onPoolState?.({
      stage,
      event,
      currentConcurrency,
      maxConcurrency: initialConcurrency,
      inFlight,
      processed,
      total: totalTasks,
    })
  }

  emitPoolState('init')

  let failureStreak = 0
  let successStreak = 0
  const cancelled = () => Boolean(isCancelled?.())
  let launchChain = Promise.resolve()

  const withLaunchDelay = async () => {
    if (deps.interTaskDelayMs <= 0) {
      return
    }
    launchChain = launchChain.then(() => maybeDelayBetweenTasks(deps.interTaskDelayMs))
    await launchChain
  }

  await new Promise<void>(resolve => {
    const pump = () => {
      if (cancelled() && inFlight === 0) {
        resolve()
        return
      }

      while (!cancelled() && inFlight < currentConcurrency && nextIndex < totalTasks) {
        const index = nextIndex++
        inFlight++
        emitPoolState('task_started')

        void (async () => {
          await withLaunchDelay()

          let success = false
          try {
            if (!cancelled()) {
              success = await runTask(index)
            }
          } catch {
            success = false
          }

          if (success) {
            successStreak++
            failureStreak = 0
            if (currentConcurrency < initialConcurrency && successStreak >= 3) {
              currentConcurrency++
              successStreak = 0
              console.log(`[批量转存] 连续成功，恢复并发到 ${currentConcurrency}`)
              emitPoolState('scale_up')
            }
          } else {
            failureStreak++
            successStreak = 0
            if (currentConcurrency > 1 && failureStreak >= 2) {
              currentConcurrency--
              failureStreak = 0
              console.warn(`[批量转存] 连续失败，降并发到 ${currentConcurrency}`)
              emitPoolState('scale_down')
            }
          }

          inFlight--
          processed++
          emitPoolState('task_settled')
          onTaskSettled?.(index, processed)

          if (processed >= totalTasks || (cancelled() && inFlight === 0)) {
            resolve()
            return
          }

          pump()
        })()
      }

      if (cancelled() && inFlight === 0) {
        resolve()
      }
    }

    pump()
  })
}

function isCancellationRequested(callbacks?: BatchRuntimeCallbacks): boolean {
  return Boolean(callbacks?.isCancelled?.())
}

function ensureNotCancelled(callbacks: BatchRuntimeCallbacks | undefined, deps: BatchOrchestratorDeps) {
  if (isCancellationRequested(callbacks)) {
    throw deps.createCancellationError()
  }
}

async function maybeDelayBetweenTasks(ms: number) {
  if (ms <= 0) {
    return
  }
  await new Promise(resolve => setTimeout(resolve, ms))
}

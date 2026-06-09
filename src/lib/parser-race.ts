export type ParserRaceAttempt = {
  index: number
  label: string
  success: boolean
  usable: boolean
  latencyMs: number
  errorMessage?: string
}

export async function findFirstUsableParserResult<T extends { raw?: unknown }>(
  parsers: Array<(signal: AbortSignal) => Promise<T>>,
  isUsable: (result: T) => boolean,
  label: string,
  concurrency: number
): Promise<{ result: T | null; attempts: ParserRaceAttempt[]; lastRaw: unknown }> {
  const workerCount = Math.min(Math.max(1, Math.trunc(concurrency) || 1), parsers.length)
  const controllers = parsers.map(() => new AbortController())
  const attempts: ParserRaceAttempt[] = []
  let nextIndex = 0
  let lastRaw: unknown = null
  let settled = false
  let workersRemaining = workerCount

  return await new Promise(resolve => {
    const finish = (value: { result: T | null; attempts: ParserRaceAttempt[]; lastRaw: unknown }) => {
      if (settled) return
      settled = true
      for (const controller of controllers) {
        if (!controller.signal.aborted) {
          controller.abort('parser settled')
        }
      }
      resolve(value)
    }

    if (workerCount === 0) {
      finish({ result: null, attempts, lastRaw })
      return
    }

    const runWorker = async () => {
      try {
        while (!settled) {
          const currentIndex = nextIndex++
          if (currentIndex >= parsers.length) {
            return
          }

          const startedAt = Date.now()
          try {
            const parsed = await parsers[currentIndex](controllers[currentIndex].signal)
            if (settled) return

            lastRaw = parsed.raw ?? lastRaw
            const usable = isUsable(parsed)
            attempts.push({
              index: currentIndex,
              label: `${label} parser #${currentIndex + 1}`,
              success: usable,
              usable,
              latencyMs: Date.now() - startedAt,
              ...(usable ? {} : { errorMessage: 'returned no usable media' }),
            })

            if (usable) {
              finish({ result: parsed, attempts: [...attempts], lastRaw: parsed.raw ?? lastRaw })
              return
            }
          } catch (error) {
            if (settled && controllers[currentIndex].signal.aborted) {
              return
            }

            attempts.push({
              index: currentIndex,
              label: `${label} parser #${currentIndex + 1}`,
              success: false,
              usable: false,
              latencyMs: Date.now() - startedAt,
              errorMessage: error instanceof Error ? error.message : String(error),
            })
          }
        }
      } finally {
        workersRemaining -= 1
        if (workersRemaining === 0) {
          finish({ result: null, attempts: [...attempts], lastRaw })
        }
      }
    }

    for (let i = 0; i < workerCount; i++) {
      void runWorker()
    }
  })
}

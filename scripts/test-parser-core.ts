import assert from 'node:assert/strict'
import {
  extractFirstUrlFromText,
  extractSupportedVideoUrl,
  sanitizeUrlCandidate,
} from '../src/lib/url/extract'
import { findFirstUsableParserResult } from '../src/lib/parser-race'
import { parseDouyinVideo } from '../src/lib/api/douyin-parser'
import { MediaType } from '../src/types'
import {
  resolveAndValidateHttpUrl,
  sanitizeCustomHeaders,
} from '../src/lib/api/parser-security'
import { prepareCustomParserRequest } from '../src/lib/api/custom-parser-request'
import {
  extractAuthorProfile,
  extractMediaPayload,
  safeParseJsonBody,
} from '../src/lib/api/custom-parser-response'
import {
  buildDouyinUserFolderPath,
  buildStableBatchVideoFileName,
  extractErrorMessageFromResponse,
  inferVideoFormat,
} from '../src/lib/conversion-upload'
import {
  extractRealVideoUrl,
  isValidVideoInputUrl,
  parseVideoResponseText,
} from '../src/lib/conversion-parse'
import {
  createExportedAppData,
  getDefaultCleanupConfig,
  parseImportedAppData,
  serializeExportedAppData,
} from '../src/lib/storage/maintenance-core'
import {
  normalizeHistoryRecord,
  rewriteHistoryTagIds,
} from '../src/lib/storage/history-tag-core'

async function main() {
  testUrlSanitizer()
  await testParserRace()
  testSecurityGuards()
  await testCustomParserRequest()
  testCustomParserResponseHelpers()
  testConversionUploadHelpers()
  testConversionParseHelpers()
  testStorageMaintenanceHelpers()
  testHistoryTagHelpers()
  await testDouyinCore()
  console.log('parser-core tests passed')
}

function testUrlSanitizer() {
  assert.equal(
    sanitizeUrlCandidate('<https://v.douyin.com/ZIwVEhIBgqQ/|Douyin Link>'),
    'https://v.douyin.com/ZIwVEhIBgqQ/'
  )
  assert.equal(
    extractSupportedVideoUrl(
      '6.64 复制打开抖音 <https://v.douyin.com/ZIwVEhIBgqQ/> <mailto:test@example.com|mail> OKW:/ :4pm'
    ),
    'https://v.douyin.com/ZIwVEhIBgqQ/'
  )
  assert.equal(
    extractFirstUrlFromText('先看这个 https://example.com/test 再看这个 <https://v.douyin.com/OaOreD2AGyo/|share>'),
    'https://v.douyin.com/OaOreD2AGyo/'
  )
}

async function testParserRace() {
  let slowAborted = false

  const result = await findFirstUsableParserResult<{ ok: boolean; raw: unknown }>(
    [
      async () => {
        await sleep(30)
        throw new Error('timeout')
      },
      async () => {
        await sleep(5)
        return { ok: false, raw: { message: 'no media' } }
      },
      async () => {
        await sleep(10)
        return { ok: true, raw: { message: 'usable media' } }
      },
      async signal => {
        await new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              slowAborted = true
              reject(new Error('aborted'))
            },
            { once: true }
          )
        })
        return { ok: false, raw: null }
      },
    ],
    value => value.ok === true,
    'test',
    4
  )

  assert.equal((result.result as { ok: boolean } | null)?.ok, true)
  assert.equal(slowAborted, true)
  assert.ok(result.attempts.some(item => item.usable))
}

function testSecurityGuards() {
  assert.equal(resolveAndValidateHttpUrl('http://127.0.0.1/test').ok, false)
  assert.equal(resolveAndValidateHttpUrl('http://localhost/test').ok, false)
  assert.equal(resolveAndValidateHttpUrl('file:///tmp/demo').ok, false)
  assert.equal(
    resolveAndValidateHttpUrl('/api/proxy/parser?test=true', 'https://example.com', { allowRelativeApi: true }).ok,
    true
  )

  const headers = sanitizeCustomHeaders(
    {
      Host: 'malicious',
      Cookie: 'a=b',
      'X-Forwarded-For': '10.0.0.1',
      Authorization: 'Bearer keep-me',
      'X-Custom': 'ok',
    },
    { 'User-Agent': 'agent' }
  )

  assert.equal(headers.Host, undefined)
  assert.equal(headers.Cookie, undefined)
  assert.equal(headers['X-Forwarded-For'], undefined)
  assert.equal(headers.Authorization, 'Bearer keep-me')
  assert.equal(headers['X-Custom'], 'ok')
}

async function testCustomParserRequest() {
  const prepared = await prepareCustomParserRequest({
    requestUrl: 'https://videojx.example.com/api/preview/parse',
    videoUrl: '1234567890123456789',
    parserConfig: {
      id: 'test-get',
      name: 'GET parser',
      apiUrl: 'https://parser.example.com/parse?foo=1&url=old',
      requestMethod: 'GET',
      urlParamName: 'url',
      customHeaders: {
        Cookie: 'blocked=true',
        Authorization: 'Bearer keep',
      },
      customQueryParams: {
        token: 'abc',
      },
      apiKey: 'secret',
    },
  })

  assert.equal(prepared.ok, true)
  if (!prepared.ok) return

  assert.equal(prepared.value.method, 'GET')
  assert.equal(
    prepared.value.normalizedVideoUrl,
    'https://www.iesdouyin.com/share/video/1234567890123456789'
  )

  const finalUrl = new URL(prepared.value.finalApiUrl)
  assert.equal(finalUrl.searchParams.get('url'), 'https://www.iesdouyin.com/share/video/1234567890123456789')
  assert.equal(finalUrl.searchParams.get('token'), 'abc')

  const headers = prepared.value.requestOptions.headers as Record<string, string>
  assert.equal(headers.Cookie, undefined)
  assert.equal(headers.Authorization, 'Bearer keep')
  assert.equal(headers['X-API-Key'], 'secret')
}

function testCustomParserResponseHelpers() {
  const parsed = safeParseJsonBody('prefix {"ok":true,"value":1} suffix')
  assert.deepEqual(parsed, { ok: true, value: 1 })

  const mediaFromNestedVideo = extractMediaPayload({
    result: {
      media: {
        playUrl: 'https://cdn.example.com/video.mp4',
      },
    },
  })
  assert.equal(mediaFromNestedVideo.mediaType, MediaType.VIDEO)
  assert.equal(mediaFromNestedVideo.videoUrl, 'https://cdn.example.com/video.mp4')

  const mediaFromAlbum = extractMediaPayload({
    payload: {
      images: [
        { src: 'https://cdn.example.com/1.jpg' },
        'https://cdn.example.com/2.jpg',
      ],
    },
  })
  assert.equal(mediaFromAlbum.mediaType, MediaType.IMAGE_ALBUM)
  assert.equal(mediaFromAlbum.images?.length, 2)

  const author = extractAuthorProfile({
    user: {
      nickname: 'tester',
      avatar_url: 'https://cdn.example.com/avatar.jpg',
      sign: 'hello',
    },
  })
  assert.equal(author?.name, 'tester')
  assert.equal(author?.avatar, 'https://cdn.example.com/avatar.jpg')
  assert.equal(author?.signature, 'hello')
}

function testConversionUploadHelpers() {
  assert.equal(
    buildDouyinUserFolderPath([
      {
        title: 'x',
        mediaType: MediaType.VIDEO,
        author: '测试作者',
        uid: '123456',
      },
    ]),
    '测试作者_123456'
  )

  const filename = buildStableBatchVideoFileName(
    {
      title: '复杂标题 / with slash',
      mediaType: MediaType.VIDEO,
      author: 'tester',
      url: 'https://www.douyin.com/video/7654321098765432101',
    },
    'https://www.douyin.com/video/7654321098765432101'
  )
  assert.equal(filename, 'tester_7654321098765432101.mp4')

  assert.equal(
    inferVideoFormat(undefined, 'https://cdn.example.com/path/video.webm?token=1'),
    'webm'
  )

  assert.equal(
    extractErrorMessageFromResponse('{"detail":"upstream exploded"}'),
    'upstream exploded'
  )
  assert.equal(
    extractErrorMessageFromResponse('  plain text   error body  '),
    'plain text error body'
  )
}

function testConversionParseHelpers() {
  assert.equal(
    extractRealVideoUrl('文案 https://www.douyin.com/video/1234567890123456789 更多文字'),
    'https://www.douyin.com/video/1234567890123456789'
  )
  assert.equal(isValidVideoInputUrl('https://www.douyin.com/video/1234567890123456789'), true)
  assert.equal(isValidVideoInputUrl('not-a-url'), false)

  const parsedVideo = parseVideoResponseText(JSON.stringify({
    success: true,
    data: {
      title: 'ok',
      mediaType: MediaType.VIDEO,
      url: 'https://cdn.example.com/test.mp4',
    },
  }))
  assert.equal(parsedVideo.title, 'ok')
  assert.equal(parsedVideo.url, 'https://cdn.example.com/test.mp4')

  assert.throws(
    () => parseVideoResponseText(JSON.stringify({
      success: true,
      data: {
        title: 'bad',
        mediaType: MediaType.IMAGE_ALBUM,
        images: [],
      },
    })),
    /图集解析成功但没有找到任何图片/
  )
}

function testStorageMaintenanceHelpers() {
  const payload = createExportedAppData({
    config: {
      parsers: [],
      webdavServers: [],
      theme: 'system',
    },
    parsers: [],
    webdavServers: [],
    history: [],
    tags: [
      {
        id: 'tag-1',
        name: '重要',
        color: 'red',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ],
    cleanupConfig: {
      ...getDefaultCleanupConfig(),
      retainDays: 14,
    },
  })

  assert.equal(payload.version, '1.1.0')
  assert.equal(payload.tags?.length, 1)
  assert.equal(payload.cleanupConfig?.retainDays, 14)

  const parsed = parseImportedAppData(serializeExportedAppData(payload))
  assert.equal(parsed.tags?.[0]?.name, '重要')
  assert.equal(parsed.cleanupConfig?.retainDays, 14)

  const legacy = parseImportedAppData(JSON.stringify({
    version: '1.0.0',
    exportTime: '2026-06-09T00:00:00.000Z',
    config: {
      parsers: [],
      webdavServers: [],
      theme: 'light',
    },
    parsers: [],
    webdavServers: [],
    history: [],
  }))
  assert.equal(legacy.version, '1.0.0')
  assert.equal(legacy.tags, undefined)

  assert.throws(
    () => parseImportedAppData(JSON.stringify({ version: '1.0.0' })),
    /无效的数据格式/
  )
}

function testHistoryTagHelpers() {
  const normalized = normalizeHistoryRecord({
    id: 'legacy-id',
    type: 'single',
    createdAt: '2026-06-01T00:00:00.000Z',
    lastViewedAt: '2026-06-02T00:00:00.000Z',
    task: {
      status: 'success',
      createdAt: 'invalid-date',
      completedAt: '2026-06-03T00:00:00.000Z',
    },
  })

  assert.match(normalized.id, /^[0-9a-f-]{36}$/i)
  assert.equal(normalized.createdAt instanceof Date, true)
  assert.equal(normalized.lastViewedAt instanceof Date, true)
  assert.equal(normalized.task.createdAt instanceof Date, true)
  assert.equal(normalized.task.completedAt instanceof Date, true)

  const rewritten = rewriteHistoryTagIds(
    [
      {
        id: 'record-1',
        type: 'single',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        tags: ['legacy-tag', 'keep-tag'],
        task: {
          id: 'task-1',
          videoUrl: 'https://example.com/video.mp4',
          status: 'success' as any,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      },
    ],
    new Map([['legacy-tag', 'uuid-tag']])
  )

  assert.equal(rewritten.changed, true)
  assert.deepEqual(rewritten.records[0].tags, ['uuid-tag', 'keep-tag'])
}

async function testDouyinCore() {
  const calls: string[] = []
  const fetchImpl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)

    if (url.includes('apis.jxcxin.cn')) {
      return jsonResponse({ code: 500, msg: 'bad upstream' })
    }

    if (url.includes('api.douyin.wtf')) {
      await sleep(10)
      return jsonResponse({
        code: 0,
        data: {
          desc: 'test video',
          video_url: 'https://cdn.example.com/video.mp4',
          cover: 'https://cdn.example.com/cover.jpg',
        },
      })
    }

    if (url.includes('api.mmp.cc')) {
      await sleep(100)
      if (init?.signal?.aborted) {
        throw new Error('aborted')
      }
      return jsonResponse({ code: 404, msg: 'too slow' })
    }

    return jsonResponse({ code: 404, msg: 'unknown upstream' }, 404)
  }) as typeof fetch

  const result = await parseDouyinVideo('https://www.douyin.com/video/1234567890123456789', {
    fetchImpl,
    timeoutMs: 200,
    concurrency: 3,
    upstreamEntries: [
      'jxcxin|GET https://apis.jxcxin.cn/api/douyin?url={url}',
      'douyin_wtf|GET https://api.douyin.wtf/api/hybrid/video_data?url={url}',
      'mmp_dyhome|GET https://api.mmp.cc/api/dyhome?url={url}',
    ],
  })

  assert.equal(result.status, 200)
  assert.equal(result.body.success, true)
  if (result.body.success) {
    assert.equal(result.body.data.mediaType, MediaType.VIDEO)
    assert.equal(result.body.data.url, 'https://cdn.example.com/video.mp4')
    assert.equal(result.body.rawData?.source, 'douyin_wtf')
    assert.ok(Array.isArray(result.body.rawData?.attempts))
  }

  assert.ok(calls.some(url => url.includes('apis.jxcxin.cn')))
  assert.ok(calls.some(url => url.includes('api.douyin.wtf')))
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

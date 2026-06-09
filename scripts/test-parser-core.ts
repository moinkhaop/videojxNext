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

async function main() {
  testUrlSanitizer()
  await testParserRace()
  testSecurityGuards()
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

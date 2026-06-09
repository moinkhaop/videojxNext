import { MediaType, ParsedVideoInfo } from '@/types'

function normalizeFormat(format?: string): string {
  return String(format || '')
    .trim()
    .toLowerCase()
    .replace(/^image\//, '')
    .replace(/^video\//, '')
}

function normalizePathname(url?: string): string {
  if (!url) {
    return ''
  }

  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return url.split('?')[0]?.toLowerCase() || ''
  }
}

export function isAnimatedImageMedia(
  mediaInfo: Pick<ParsedVideoInfo, 'mediaType' | 'format' | 'url'>
): boolean {
  if (mediaInfo.mediaType !== MediaType.VIDEO) {
    return false
  }

  const format = normalizeFormat(mediaInfo.format)
  if (format === 'gif') {
    return true
  }

  const pathname = normalizePathname(mediaInfo.url)
  return pathname.endsWith('.gif')
}

export function getMediaPreviewLabel(
  mediaInfo: Pick<ParsedVideoInfo, 'mediaType' | 'format' | 'url'>
): string {
  if (isAnimatedImageMedia(mediaInfo)) {
    return '动图'
  }

  return mediaInfo.mediaType === MediaType.IMAGE_ALBUM ? '图集' : '视频'
}

export function getMediaStageHeightClass(
  mediaInfo: Pick<ParsedVideoInfo, 'mediaType' | 'format' | 'url'>
): string {
  if (mediaInfo.mediaType === MediaType.IMAGE_ALBUM) {
    return 'h-[340px] sm:h-[380px] lg:h-[430px] xl:h-[470px]'
  }

  if (isAnimatedImageMedia(mediaInfo)) {
    return 'h-[320px] sm:h-[360px] lg:h-[400px] xl:h-[440px]'
  }

  return 'h-[300px] sm:h-[340px] lg:h-[390px] xl:h-[430px]'
}

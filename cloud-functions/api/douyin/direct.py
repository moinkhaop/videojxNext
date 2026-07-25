"""EdgeOne Python Cloud Function：抖音单视频直链解析。

路由由 EdgeOne Pages 文件系统自动生成：
``cloud-functions/api/douyin/direct.py`` 对应 ``/api/douyin/direct``。

本函数只做轻量解析：展开抖音分享短链、读取公开作品页的 ``_ROUTER_DATA``，
再返回前端既有 ``VideoParseResponse`` 兼容的 JSON。媒体文件始终由浏览器或
现有 WebDAV Node Function 处理，避免在免费 Cloud Function 中传输视频内容。

实现刻意只使用 Python 标准库：不需要 requirements.txt，也不会在运行时安装
任何依赖。抖音页面结构和访问策略可能调整，因此任何非成功响应都会让前端的
解析器链路继续尝试已有的 Next/Edge Function 和公网备用源。
"""

from __future__ import annotations

import json
import re
import time
from http.server import BaseHTTPRequestHandler
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
)
TOTAL_TIMEOUT_SECONDS = 12
MAX_INPUT_BYTES = 64 * 1024
MAX_HTML_BYTES = 2 * 1024 * 1024
ALLOWED_HOST_SUFFIXES = ("douyin.com", "iesdouyin.com")
TRAILING_LINK_PUNCTUATION = ").,;!?\"'`，。！？；、）】》〉」』”’"
# 只接受 URL 的 RFC 安全字符集，避免把紧随短链的中文分享文案误判为链接路径。
# 抖音分享链接中的非 ASCII 字符会以百分号编码出现，仍在该集合内。
URL_TOKEN_PATTERN = re.compile(
    r"https?://[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]]+", re.IGNORECASE
)
VIDEO_ID_PATTERN = re.compile(r"/(?:video|note|share/video)/([0-9]{10,25})(?:[/?#]|$)", re.IGNORECASE)
LONG_ID_PATTERN = re.compile(r"/([0-9]{15,25})(?:[/?#]|$)")
ROUTER_DATA_PATTERN = re.compile(
    r"window\._ROUTER_DATA\s*=\s*(.*?)</script>", re.IGNORECASE | re.DOTALL
)


class ParserError(Exception):
    """可预期的输入、平台页面或解析失败，并携带适合返回给前端的 HTTP 状态。"""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class AllowedDouyinRedirectHandler(HTTPRedirectHandler):
    """只允许在抖音官方域名内跳转，防止该函数成为任意 URL 请求代理。"""

    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> Request | None:
        if not is_allowed_douyin_url(newurl):
            raise ParserError(400, "分享链接跳转到了非抖音官方地址")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


DOUYIN_OPENER = build_opener(AllowedDouyinRedirectHandler())


def is_allowed_douyin_host(hostname: str) -> bool:
    """校验主机名边界，避免 ``douyin.com.example`` 等伪造域名通过。"""

    host = str(hostname or "").lower().rstrip(".")
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in ALLOWED_HOST_SUFFIXES)


def is_allowed_douyin_url(url: str) -> bool:
    parsed = urlparse(str(url or ""))
    return parsed.scheme.lower() == "https" and is_allowed_douyin_host(parsed.hostname or "")


def extract_douyin_url(text: str) -> str:
    """从分享文案中找出第一个抖音官方 HTTPS 链接，并移除尾部中文标点。"""

    for match in URL_TOKEN_PATTERN.finditer(str(text or "")):
        candidate = match.group(0).rstrip(TRAILING_LINK_PUNCTUATION)
        parsed = urlparse(candidate)
        if not is_allowed_douyin_host(parsed.hostname or ""):
            continue

        # 统一升级为 HTTPS，既避免明文请求，也保证重定向白名单校验一致。
        return urlunparse(parsed._replace(scheme="https"))
    return ""


def is_short_share_url(url: str) -> bool:
    parsed = urlparse(url)
    return (parsed.hostname or "").lower() == "v.douyin.com"


def is_slide_share_url(url: str) -> bool:
    """识别短链跳转后的图集分享页，避免把其背景音频误当作视频直链。"""

    parsed = urlparse(str(url or ""))
    path = parsed.path.lower()
    query = parse_qs(parsed.query)
    is_slides = query.get("is_slides", [""])[0].strip().lower()
    return "/share/slides/" in path or is_slides in {"1", "true"}


def extract_video_id(url: str) -> str:
    """同时兼容跳转后的 modal_id 和作品页路径中的作品 ID。"""

    parsed = urlparse(str(url or ""))
    query = parse_qs(parsed.query)
    for key in ("modal_id", "note_id", "item_id", "video_id"):
        value = query.get(key, [""])[0]
        if isinstance(value, str) and value.isdigit() and 10 <= len(value) <= 25:
            return value

    for pattern in (VIDEO_ID_PATTERN, LONG_ID_PATTERN):
        matched = pattern.search(parsed.path)
        if matched:
            return matched.group(1)
    return ""


def _remaining_timeout(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ParserError(504, "抖音直链解析超时")
    return max(1.0, remaining)


def _open_douyin_url(url: str, deadline: float, accept: str):
    """发起受白名单和全流程总超时保护的公开页面请求。"""

    if not is_allowed_douyin_url(url):
        raise ParserError(400, "仅支持抖音官方 HTTPS 分享链接")

    request = Request(
        url,
        headers={
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": accept,
            "Referer": "https://www.douyin.com/",
        },
        method="GET",
    )
    try:
        response = DOUYIN_OPENER.open(request, timeout=_remaining_timeout(deadline))
    except ParserError:
        raise
    except HTTPError as error:
        raise ParserError(502, f"抖音页面请求失败（HTTP {error.code}）") from error
    except URLError as error:
        reason = getattr(error, "reason", "网络错误")
        raise ParserError(502, f"抖音页面网络请求失败：{reason}") from error
    except TimeoutError as error:
        raise ParserError(504, "抖音页面请求超时") from error

    final_url = response.geturl()
    if not is_allowed_douyin_url(final_url):
        response.close()
        raise ParserError(400, "抖音分享链接跳转到了非抖音官方地址")
    return response


def resolve_share_url(url: str, deadline: float) -> str:
    """短链必须跟随跳转才能拿到作品 ID；长链则不额外发请求。"""

    if not is_short_share_url(url):
        return url

    response = _open_douyin_url(url, deadline, "text/html,application/xhtml+xml")
    try:
        return response.geturl()
    finally:
        response.close()


def fetch_text(url: str, deadline: float) -> str:
    """读取受大小上限保护的页面文本，避免异常页面撑爆函数内存。"""

    response = _open_douyin_url(url, deadline, "text/html,application/xhtml+xml")
    try:
        raw = response.read(MAX_HTML_BYTES + 1)
        if len(raw) > MAX_HTML_BYTES:
            raise ParserError(502, "抖音作品页响应过大")
        charset = response.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")
    finally:
        response.close()


def extract_router_data(page_html: str) -> dict[str, Any]:
    """提取作品页嵌入状态；末尾分号需要剥离后才能作为合法 JSON 解析。"""

    matched = ROUTER_DATA_PATTERN.search(str(page_html or ""))
    if not matched:
        raise ParserError(502, "抖音作品页未包含可解析的作品数据")

    source = matched.group(1).strip()
    if source.endswith(";"):
        source = source[:-1].rstrip()
    try:
        value = json.loads(source)
    except json.JSONDecodeError as error:
        raise ParserError(502, "抖音作品页数据格式已变化") from error

    if not isinstance(value, dict):
        raise ParserError(502, "抖音作品页数据格式无效")
    return value


def find_primary_item(router_data: dict[str, Any]) -> dict[str, Any]:
    """从当前和兼容结构中定位首个作品对象，不把页面其他推荐内容误当成作品。"""

    loader_data = router_data.get("loaderData")
    if not isinstance(loader_data, dict):
        raise ParserError(502, "抖音作品页未包含 loaderData")

    # 当前页面通常把作品列表放进 loaderData 中某个 *InfoRes 对象。
    for entry in loader_data.values():
        if not isinstance(entry, dict):
            continue
        for key in ("videoInfoRes", "noteInfoRes", "awemeInfoRes"):
            info = entry.get(key)
            if not isinstance(info, dict):
                continue
            item_list = info.get("item_list") or info.get("aweme_list")
            if isinstance(item_list, list) and isinstance(item_list[0] if item_list else None, dict):
                return item_list[0]

    raise ParserError(502, "抖音作品页未找到作品详情")


def _get_path(source: Any, *path: str) -> Any:
    current = source
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _first_non_empty(values: Iterable[Any], fallback: str = "") -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return fallback


def _first_http_url(values: Iterable[Any]) -> str:
    for value in values:
        if isinstance(value, str) and value.startswith(("https://", "http://")):
            return value
    return ""


def _add_http_urls(target: list[str], values: Any) -> None:
    if not isinstance(values, list):
        return
    for value in values:
        if isinstance(value, str) and value.startswith(("https://", "http://")) and value not in target:
            target.append(value)


def collect_video_candidates(item: dict[str, Any]) -> list[str]:
    """优先官方播放 URI，其余 CDN 地址作为客户端/后续链路的备用候选。"""

    video = item.get("video")
    if not isinstance(video, dict):
        return []

    candidates: list[str] = []
    play_addr = video.get("play_addr")
    if isinstance(play_addr, dict):
        uri = play_addr.get("uri")
        if isinstance(uri, str) and uri.strip():
            candidates.append(
                "https://www.douyin.com/aweme/v1/play/?" + urlencode({"video_id": uri.strip()})
            )
        _add_http_urls(candidates, play_addr.get("url_list"))

    for address in (
        video.get("play_addr_h264"),
        video.get("download_addr"),
        _get_path(video, "bit_rate"),
    ):
        if isinstance(address, dict):
            _add_http_urls(candidates, address.get("url_list"))
        elif isinstance(address, list):
            for entry in address:
                if isinstance(entry, dict):
                    _add_http_urls(candidates, _get_path(entry, "play_addr", "url_list"))

    return candidates


def _has_album_images(item: dict[str, Any]) -> bool:
    possible_lists = (
        item.get("images"),
        item.get("image_post_info", {}).get("images") if isinstance(item.get("image_post_info"), dict) else None,
    )
    return any(isinstance(values, list) and len(values) > 0 for values in possible_lists)


def _duration_seconds(value: Any) -> int | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    seconds = float(value)
    # 抖音结构通常以毫秒表示时长；小于 1000 的值则按秒保留。
    if seconds >= 1000:
        seconds /= 1000
    return max(0, int(round(seconds)))


def build_success_payload(item: dict[str, Any], extracted_url: str, resolved_url: str, video_id: str) -> dict[str, Any]:
    """构造与前端 ``VideoParseResponse`` 兼容的单视频响应。"""

    candidates = collect_video_candidates(item)
    if not candidates:
        if _has_album_images(item):
            raise ParserError(422, "该作品为图集或实况图，请交由图集兼容解析器处理")
        raise ParserError(502, "抖音作品详情中未找到可用视频直链")

    video = item.get("video") if isinstance(item.get("video"), dict) else {}
    author = item.get("author") if isinstance(item.get("author"), dict) else {}
    cover_list = _get_path(video, "cover", "url_list")
    cover = _first_http_url(cover_list if isinstance(cover_list, list) else [])
    title = _first_non_empty((item.get("desc"), item.get("title")), "未命名作品")

    return {
        "success": True,
        "data": {
            "title": title,
            "author": _first_non_empty((author.get("nickname"), author.get("name")), "抖音用户"),
            "description": _first_non_empty((item.get("desc"), item.get("title")), title),
            "mediaType": "video",
            "url": candidates[0],
            "duration": _duration_seconds(video.get("duration")),
            "format": "mp4",
            "thumbnail": cover,
            "avatar": _first_http_url(_get_path(author, "avatar_thumb", "url_list") or []),
            "signature": _first_non_empty((author.get("signature"),)),
            "time": item.get("create_time"),
            "cover": cover,
        },
        "rawData": {
            "source": "edgeone_python_router_data",
            "extractedUrl": extracted_url,
            "resolvedUrl": resolved_url,
            "videoId": video_id,
            "candidates": candidates,
        },
    }


def parse_direct_video(input_text: str) -> dict[str, Any]:
    """完整的轻量解析编排，供 HTTP Handler 和离线单元测试共用。"""

    extracted_url = extract_douyin_url(input_text)
    if not extracted_url:
        raise ParserError(400, "未识别到有效的抖音官方链接")

    deadline = time.monotonic() + TOTAL_TIMEOUT_SECONDS
    resolved_url = resolve_share_url(extracted_url, deadline)
    if is_slide_share_url(resolved_url):
        raise ParserError(422, "该作品为图集或实况图，请交由图集兼容解析器处理")

    video_id = extract_video_id(resolved_url)
    if not video_id:
        raise ParserError(422, "无法从抖音分享链接提取作品 ID")

    page_html = fetch_text(f"https://www.iesdouyin.com/share/video/{video_id}/", deadline)
    item = find_primary_item(extract_router_data(page_html))
    return build_success_payload(item, extracted_url, resolved_url, video_id)


def _pick_first_text(values: Iterable[Any]) -> str:
    return _first_non_empty(values)


class handler(BaseHTTPRequestHandler):
    """EdgeOne Python Handler 入口类；类名必须为小写 ``handler``。"""

    server_version = "EdgeOneDouyinDirectParser/1.0"

    def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler 固定命名
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler 固定命名
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        self._handle(
            _pick_first_text(
                (query.get("url", [""])[0], query.get("videoUrl", [""])[0], query.get("text", [""])[0])
            )
        )

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler 固定命名
        content_length = self.headers.get("Content-Length", "0")
        try:
            length = int(content_length)
        except ValueError:
            self._write_json(400, {"success": False, "error": "请求体长度无效"})
            return

        if length <= 0:
            self._write_json(400, {"success": False, "error": "缺少 url 或 videoUrl 参数"})
            return
        if length > MAX_INPUT_BYTES:
            self._write_json(413, {"success": False, "error": "请求体过大"})
            return

        raw_body = self.rfile.read(length).decode("utf-8", errors="replace")
        input_text = raw_body.strip()
        try:
            body = json.loads(raw_body)
            if isinstance(body, dict):
                input_text = _pick_first_text(
                    (body.get("url"), body.get("videoUrl"), body.get("text"), body.get("content"))
                )
        except json.JSONDecodeError:
            # 允许纯文本分享文案，方便 curl 和自定义解析器配置直接调用。
            pass
        self._handle(input_text)

    def do_PUT(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler 固定命名
        self._write_json(405, {"success": False, "error": "仅支持 GET/POST 请求"})

    def do_DELETE(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler 固定命名
        self._write_json(405, {"success": False, "error": "仅支持 GET/POST 请求"})

    def _handle(self, input_text: str) -> None:
        if not input_text:
            self._write_json(400, {"success": False, "error": "缺少 url 或 videoUrl 参数"})
            return

        try:
            self._write_json(200, parse_direct_video(input_text))
        except ParserError as error:
            self._write_json(error.status, {"success": False, "error": error.message})
        except Exception:
            # 不把运行时栈和上游页面内容返回给调用方，详细错误交由 EdgeOne 函数日志记录。
            self._write_json(502, {"success": False, "error": "抖音直链解析服务异常"})

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _write_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

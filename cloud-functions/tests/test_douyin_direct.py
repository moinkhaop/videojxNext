"""不访问抖音网络的核心解析测试；EdgeOne 构建会自动忽略 tests 目录。"""

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "douyin" / "direct.py"
SPEC = importlib.util.spec_from_file_location("edgeone_douyin_direct", MODULE_PATH)
assert SPEC and SPEC.loader
DIRECT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DIRECT)


def make_router_data(item):
    return {"loaderData": {"video": {"videoInfoRes": {"item_list": [item]}}}}


class DouyinDirectParserTests(unittest.TestCase):
    def test_extracts_only_official_douyin_links(self):
        self.assertEqual(
            DIRECT.extract_douyin_url("分享文案 https://v.douyin.com/AbCd1234/，请打开"),
            "https://v.douyin.com/AbCd1234/",
        )
        self.assertEqual(DIRECT.extract_douyin_url("https://douyin.com.example/video/1"), "")

    def test_extracts_ids_from_redirect_query_and_work_path(self):
        self.assertEqual(
            DIRECT.extract_video_id("https://www.douyin.com/?modal_id=1234567890123456789"),
            "1234567890123456789",
        )
        self.assertEqual(
            DIRECT.extract_video_id("https://www.douyin.com/video/1234567890123456789"),
            "1234567890123456789",
        )

    def test_parses_slide_share_as_image_album(self):
        page = "<script>window._ROUTER_DATA = " + __import__("json").dumps(
            make_router_data(
                {
                    "desc": "测试图集",
                    "author": {"nickname": "测试作者"},
                    "images": [
                        {"url_list": ["https://cdn.example.com/album-1.webp"]},
                        {"url_list": ["https://cdn.example.com/album-2.jpeg"]},
                    ],
                    "video": {
                        "play_addr": {"uri": "https://cdn.example.com/background.mp3"},
                    },
                }
            ),
            ensure_ascii=False,
        ) + ";</script>"
        with patch.object(
            DIRECT,
            "resolve_share_url",
            return_value="https://www.iesdouyin.com/share/slides/1234567890123456789/?is_slides=1",
        ), patch.object(DIRECT, "fetch_text", return_value=page):
            payload = DIRECT.parse_direct_video("https://v.douyin.com/AbCd1234/")

        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["mediaType"], "image_album")
        self.assertEqual(payload["data"]["imageCount"], 2)
        self.assertEqual(payload["data"]["images"][1]["filename"], "image_002.jpg")

    def test_parses_router_data_and_builds_frontend_contract(self):
        page = "<script>window._ROUTER_DATA = " + __import__("json").dumps(
            make_router_data(
                {
                    "desc": "测试作品",
                    "create_time": 1720000000,
                    "author": {
                        "nickname": "测试作者",
                        "signature": "签名",
                        "avatar_thumb": {"url_list": ["https://cdn.example.com/avatar.jpg"]},
                    },
                    "video": {
                        "duration": 12345,
                        "play_addr": {
                            "uri": "v0d00fg10000example",
                            "url_list": ["https://cdn.example.com/fallback.mp4"],
                        },
                        "cover": {"url_list": ["https://cdn.example.com/cover.jpg"]},
                    },
                }
            ),
            ensure_ascii=False,
        ) + ";</script>"

        item = DIRECT.find_primary_item(DIRECT.extract_router_data(page))
        payload = DIRECT.build_success_payload(
            item,
            "https://v.douyin.com/AbCd1234/",
            "https://www.douyin.com/video/1234567890123456789",
            "1234567890123456789",
        )

        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["mediaType"], "video")
        self.assertEqual(payload["data"]["duration"], 12)
        self.assertIn("aweme/v1/play", payload["data"]["url"])
        self.assertEqual(payload["data"]["thumbnail"], "https://cdn.example.com/cover.jpg")
        self.assertEqual(payload["rawData"]["source"], "edgeone_python_router_data")

    def test_parses_album_when_only_images_are_present(self):
        payload = DIRECT.build_success_payload(
            {"images": [{"url_list": ["https://cdn.example.com/one.jpg"]}]},
            "https://v.douyin.com/AbCd1234/",
            "https://www.douyin.com/note/1234567890123456789",
            "1234567890123456789",
        )
        self.assertEqual(payload["data"]["mediaType"], "image_album")
        self.assertEqual(payload["data"]["images"][0]["url"], "https://cdn.example.com/one.jpg")


if __name__ == "__main__":
    unittest.main()

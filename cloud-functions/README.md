# EdgeOne Cloud Functions

本目录由 EdgeOne Pages 自动识别为 Python Cloud Functions 根目录；不需要修改
`edgeone.json` 才能发现其中的 Python 文件。

## 抖音直链解析

`api/douyin/direct.py` 部署后对应：

```text
https://<你的 EdgeOne 域名>/api/douyin/direct
```

它解析公开抖音视频和图集，并返回现有前端使用的 `VideoParseResponse` JSON：短链展开、
作品页 `_ROUTER_DATA` 提取、`play_addr.uri` 无水印播放地址、视频候选地址或按页图片列表。
实际下载由 WebDAV 代理完成；代理沿用该下载策略，在抖音媒体地址返回 403 时自动去掉
`Referer`/`Origin` 重试，并在需要时刷新一次抖音直链。EdgeOne Python 函数本身不下载、
不代理、不缓存媒体内容。

现有 `edge-functions/api/douyin/parse.js` 已使用 `/api/douyin/parse`，因此 Python
函数必须保持 `/api/douyin/direct` 路径，避免两个运行时声明同一路由。

### 接入前端

在 EdgeOne Pages 的构建环境变量中配置以下公开地址，并重新构建前端：

```text
NEXT_PUBLIC_EDGEONE_PARSER_API_URL=https://<你的 EdgeOne 域名>/api/douyin/direct
```

该变量只包含公开 API 地址，不应放置 Cookie、Token 或其他密钥。前端会将该端点
作为默认抖音解析器；函数返回非 2xx 时，现有解析器链会继续尝试 Next 内置解析器
和其他可用备用渠道。

### 本地验证

```bash
python3 -m unittest cloud-functions/tests/test_douyin_direct.py
python3 -m py_compile cloud-functions/api/douyin/direct.py
```

部署后的最小验证应包含：一个获授权的公开视频短链、图集链接、无效链接和超时/403
场景。图集成功时返回 `mediaType: "image_album"` 和完整的 `images` 列表；公开页面
未提供实况图对应视频时，函数只返回可验证的原始图片，不会把背景音频伪装成视频。

手动调试时，GET 参数必须进行 URL 编码；也可以使用 JSON POST，避免网关对未编码
`https://` 查询值的兼容性差异：

```bash
curl -G --data-urlencode 'url=https://v.douyin.com/example/' \
  'https://<你的 EdgeOne 域名>/api/douyin/direct'

curl -H 'Content-Type: application/json' \
  --data '{"url":"https://v.douyin.com/example/"}' \
  'https://<你的 EdgeOne 域名>/api/douyin/direct'
```

### 运行边界

EdgeOne 免费 Cloud Functions 的请求/响应 Body 有上限，故本函数只返回小型 JSON。
视频预览、视频代理和 WebDAV 上传不得迁移到这里；这些长时间媒体 I/O 仍由浏览器
或现有 Node Function 承担。

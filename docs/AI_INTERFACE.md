# 联网 AI 识谱接口

本文件用于配置服务商；不保存任何实际密钥。

网页版入口为 https://youkelili.xiao-dev.top ，只接受公开域名的 HTTPS 接口。图片裁剪和规范化在浏览器完成，选区与密钥经网站临时转发到服务商；页面或数据库不持久保存凭据。下文 localhost HTTP 仅适用于 Python 本机版，不适用于云端 Worker。

## 配置

在界面中填写完整 POST 地址，例如：

    https://api.openai.com/v1/chat/completions
    https://你的兼容接口/v1/chat/completions

模型名使用该服务商提供的**支持图片输入**的模型名称。不是所有文字模型都能识谱。软件不固定模型，不自动切换服务商。

远端必须使用 HTTPS；HTTP 只允许 localhost、127.0.0.1、::1。本地兼容接口可用于开发测试。密钥在 Authorization: Bearer 请求头发送。图片先规范化为 PNG，最长边 2400 像素，再作为 Base64 data URL 传入；原图和裁剪在本机完成。

网页版请求结构（一般模型）：

    {
      "model": "服务商提供的视觉模型名",
      "messages": [{
        "role": "user",
        "content": [
          {"type": "text", "text": "严格的简谱转录提示词……"},
          {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
        ]
      }],
      "max_tokens": 6000,
      "response_format": {"type": "json_object"}
    }

### Kimi K3 / K3.1 Pro

Kimi 官方开放平台配置：完整地址 `https://api.moonshot.cn/v1/chat/completions`，模型 `kimi-k3.1-pro`。第三方平台与 Coding Plan 的模型 ID、密钥及地址必须以对应服务为准，不能混用。

网页版自动识别 `kimi-k3.1-pro`、`k3.1-pro` 以及带服务商前缀的 K3 模型名，使用 `max_completion_tokens: 32768` 替代 `max_tokens`，并设置 `reasoning_effort: "low"`。保持模型思考开启，要求最终答案为 JSON。该配置是接口适配，不代表已用真实密钥验收。

官方依据：[Chat Completions API](https://platform.kimi.com/docs/api/chat)。K3 系列始终思考，最终答案位于 `content`；`reasoning_content` 只包含思考过程，不能作为识谱结果。

### JSON 输出与回退

网页版默认请求 `response_format: {"type":"json_object"}`。只有服务商返回 HTTP 400/422 且明确表示不支持 `response_format` 参数时，才删除此参数重试一次；界面会显示回退提示。不重试已成功生成但格式错误的结果、鉴权错误、限流或其他参数错误，避免重复消耗额度。

接口返回 choices[0].message.content，内容为 JSON 字符串：

    {
      "text": "1 2 3 4 | 5 6 7 1'",
      "key": "C",
      "meter": "4/4",
      "uncertain": ["第二小节末尾高音点模糊，请人工校对"]
    }

key 和 meter 不确定时必须为 null，不能凭空猜测。软件保留当前控件值并提示用户确认。text 会经过严格简谱解析；出现不支持的记号时会报错，不能直接进入四线谱。网页版提示词见 website/lib/vision.mjs；本机版见 uke/ocr.py。

网页版兼容最终答案的 text 文本块数组、Markdown 围栏、闭合的 think 标签和 JSON 外的说明文字；只接受单个完整 JSON 对象，不修补残缺 JSON，不将思考字段中的草稿当成音符。`finish_reason: "length"` 即使包含可解析的片段也会拒绝，提示分行裁剪；仅思考无最终答案、拒绝、缺失 text 字段、非 JSON 上游响应分别提示。解析失败不覆盖校对区原文，不回显上游原始内容或密钥。

网页版上游总超时为 180 秒（含参数回退），浏览器请求超时为 200 秒。HTTP 401、额度问题、网络错误及非 JSON 响应会在界面显示，不把接口原始错误体中的潜在敏感信息返回给界面。Python 本机版仍沿用 max_tokens 6000、90 秒上游超时；本次修复针对在线网页版，未重建 Windows 便携包。

API Key 不存磁盘；从一个接口地址改到另一个地址时，界面会清空密钥。工程文件不包含接口地址、模型和 Key。刷新页面后请重新配置。

## 验证边界

自动测试用本机模拟服务器核对 Base64 图片、请求结构、响应解析、错误提示和导出链路。该验证不能证明外部服务商已接受请求，也不能证明真实谱图识别准确率。

实际验收应配置真实接口，用一张清晰谱图逐音比对，尤其检查高低音点、减时线、附点、连音和反复。密钥请直接在本机界面输入，不必提交到聊天或仓库。

请求格式参考 [OpenAI 官方图片输入文档](https://developers.openai.com/api/docs/guides/images-vision?api-mode=chat)。其他兼容服务商的能力、费用和字段支持以其文档为准。

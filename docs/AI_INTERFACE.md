# 联网 AI 识谱接口

本文件用于配置服务商；不保存任何实际密钥。

## 配置

在界面中填写完整 POST 地址，例如：

    https://api.openai.com/v1/chat/completions
    https://你的兼容接口/v1/chat/completions

模型名使用该服务商提供的**支持图片输入**的模型名称。不是所有文字模型都能识谱。软件不固定模型，不自动切换服务商。

远端必须使用 HTTPS；HTTP 只允许 localhost、127.0.0.1、::1。本地兼容接口可用于开发测试。密钥在 Authorization: Bearer 请求头发送。图片先规范化为 PNG，最长边 2400 像素，再作为 Base64 data URL 传入；原图和裁剪在本机完成。

请求结构：

    {
      "model": "服务商提供的视觉模型名",
      "messages": [{
        "role": "user",
        "content": [
          {"type": "text", "text": "严格的简谱转录提示词……"},
          {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
        ]
      }],
      "max_tokens": 6000
    }

接口返回 choices[0].message.content，内容为 JSON 字符串：

    {
      "text": "1 2 3 4 | 5 6 7 1'",
      "key": "C",
      "meter": "4/4",
      "uncertain": ["第二小节末尾高音点模糊，请人工校对"]
    }

key 和 meter 不确定时必须为 null，不能凭空猜测。软件保留当前控件值并提示用户确认。text 会经过严格简谱解析；出现不支持的记号时会报错，不能直接进入四线谱。提示词见 uke/ocr.py。

接口超时为 90 秒，浏览器请求超时为 110 秒。HTTP 401、额度问题、网络错误及非 JSON 响应会在界面显示，不把接口原始错误体中的潜在敏感信息返回给界面。

API Key 不存磁盘；从一个接口地址改到另一个地址时，界面会清空密钥。工程文件不包含接口地址、模型和 Key。刷新页面后请重新配置。

## 验证边界

自动测试用本机模拟服务器核对 Base64 图片、请求结构、响应解析、错误提示和导出链路。该验证不能证明外部服务商已接受请求，也不能证明真实谱图识别准确率。

实际验收应配置真实接口，用一张清晰谱图逐音比对，尤其检查高低音点、减时线、附点、连音和反复。密钥请直接在本机界面输入，不必提交到聊天或仓库。

请求格式参考 [OpenAI 官方图片输入文档](https://developers.openai.com/api/docs/guides/images-vision?api-mode=chat)。其他兼容服务商的能力、费用和字段支持以其文档为准。

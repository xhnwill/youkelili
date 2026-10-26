# 网页版部署

版本 0.2.0 · 2026-10-26

网址：https://youkelili.xiao-dev.top

## 实际部署目标

- Cloudflare 账户：9754503ae62c09f45807d3a76f09880f（用户明确指定）。
- Worker：youkelili。
- 自定义域名：youkelili.xiao-dev.top。
- 发布版本 ID：d45449f0-5cb7-4b30-966e-43d44a24b236。
- GitHub 仓库：xhnwill/youkelili，网页源码在 website/。

没有将本版本发布到 GitHub Pages 或 Sites。早期准备过程中创建的 Sites 私有草稿未发布，最终按照用户指定的 Cloudflare 目标部署。

## 更新步骤

    cd website
    npm ci
    node --test tests/*.test.mjs
    npm run build
    node scripts/cloudflare-deploy.mjs --dry-run
    node scripts/cloudflare-deploy.mjs

先检查 cloudflare.json 中账户、Worker 名和域名，使用 Wrangler 的现有登录或环境变量授权。不要把 Token 写进文件或提交 Git。部署脚本保留构建生成的模块与静态资源配置，仅合并明确的部署目标；不会批量改变其他 Worker 或域名。

Node.js >=22.13.0。保留 Vinext / Vite 构建集成；dist/、node_modules/、.wrangler/ 和 .sites-runtime/ 均为忽略文件，不提交。

## 数据流

上传、裁剪、谱面设置、转谱、试听和文件导出在浏览器内进行。只有点击 AI 识别时，当前选区与用户自己的视觉接口配置才发送到同来源 /api/recognize。服务端只做本次请求转发，不配置共享模型密钥，不使用持久化数据库。

原有 /api/convert 和 /api/export 不需要云端接口，浏览器自行生成对应结果。清除接口或刷新可清除页面内存中的密钥，保存工程不包含接口凭据。

## 验证与边界

- 10 项 Node 测试通过，包括 26 组与 Python 实现一致的音符、指法和 MIDI 参考谱。
- 本地网页实际点击示例，确认生成 42 音符／休止的简谱对照四线谱。
- 生产构建与 Cloudflare dry-run 通过。
- Wrangler 确认自定义域名部署成功；公网首页、核心模块与只读版本接口 HTTP 200。
- 公网 app.js 为 HTTP 200，core.mjs 的 MIME 为 text/javascript；非法图片请求返回预期 HTTP 400，没有调用实际 AI 服务。
- 公网浏览器自动化两次超时，未完成公网视觉复核；不把 HTTP 检查当作手机或公网浏览器完整验收。
- 真实 AI 服务调用需要用户自己的模型地址、密钥和额度；本次没有用户谱图识谱准确率结果。
- 当前单旋律范围、反复／连音等不支持内容及人工校对要求与本机版一致。

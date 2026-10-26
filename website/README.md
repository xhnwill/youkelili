# 简谱小尤 · 网页版

版本 0.3.0 · 构建日期 2026-10-26 · MIT

打开浏览器即可使用，无需安装 Python 或 Windows 程序。沿用简谱图片 → AI 转录 → 校对 → 尤克里里四线谱流程。

## 功能与数据流

- 在线找谱：读取简谱之家公开目录和搜索，保留谱种与原站链接；预览后按需导入其中一张，仍需由用户点击 AI 识别。

- 图片导入、框选、简谱编辑、音高／节奏处理、动态规划指法、试听、工程保存，以及 SVG、MIDI、MusicXML 和打印 PDF，都在浏览器内完成。
- 仅点击“AI 识别”时，图片选区和你填写的 API Key 经网站服务端临时转发给指定的视觉接口。
- 不使用数据库，不保存图片、谱面或密钥。刷新或“清除接口”会清除页面中的凭据。
- 仍需要自己的视觉模型服务与额度；示例为预置音符，不能作为 AI 准确率证据。
- 当前只处理单旋律，不自动编配完整指弹伴奏；High G 与 Low G 必须按实际琴弦选择。

## 开发、测试和构建

Node.js >=22.13.0。

    npm ci
    npm run dev -- --port 8780 --hostname 127.0.0.1
    node --test tests/*.test.mjs
    npm run build
    npm start

构建运行于 Vinext / Cloudflare Workers。保留模板 Vite 集成和 worker/index.ts；不能将需要服务端的目录直接当成 GitHub Pages 静态目录上传。

GitHub 保存开源源码；本次网页按用户要求部署到其 Cloudflare 账户，域名为 https://youkelili.xiao-dev.top 。

cloudflare.json 明确声明账户 ID、Worker 名称和唯一自定义域名。确认目标后运行：

    npm run build
    node scripts/cloudflare-deploy.mjs --dry-run
    node scripts/cloudflare-deploy.mjs

部署脚本以构建生成的配置为基础，合并目标账户／域名，不读取或保存 Cloudflare 凭据；Wrangler 使用已有登录或环境变量。禁止将 OAuth Token 或 API Token 写入仓库。复制给自己的账户时先修改 cloudflare.json。

没有将网页发布到 GitHub Pages 或 Sites；保留的模板构建支持不代表该平台已部署。

## 接口配置

填写完整 HTTPS Chat Completions 地址、支持图片的模型名和自己的 API Key。网页版拒绝 HTTP、IP 字面地址、内网主机名、URL 内凭据和重定向。不支持访问个人电脑上的 localhost 模型；本机版仍可按其原有方式配置。

服务商若只支持不同请求协议，需要增加适配器，不能仅改模型名。API Key 和地址不进入保存的工程。

## 目录

- app/：中文工作台页面与服务端路由。
- public/：浏览器工作台、音乐核心、样式、示例图和图标。
- lib/vision.mjs：无状态视觉接口转发和输入校验；lib/catalog.mjs：来源站列表、搜索、详情与按需图片读取。其余 lib 文件为模板运行支持。
- tests/：浏览器音乐语义、与 Python 版本的一致性、视觉接口协议测试。
- scripts/、worker/、vendor/：维护中的 Sites / Vinext 构建、预览与发布支持。
- .openai/hosting.json：本次站点身份和部署配置；不是密钥。
- cloudflare.json：用户明确指定的 Cloudflare Worker／账户／自定义域名。
- components/、hooks/、db/、drizzle/、examples/：保留的模板支持；当前页面不使用数据库或连接器。

17 项 Node 测试覆盖来源站解析、分页、选图、来源限制，以及 26 组调号／定弦与 Python 参考结果、音域、节奏、导出和模拟视觉协议。真实 AI 准确率仍需要配置实际服务并逐音检查用户谱图。

项目源码：https://github.com/xhnwill/youkelili

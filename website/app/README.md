# 页面与接口

page.tsx 加载工作台，workbench.ts 保存其无凭据的初始 HTML；layout.tsx 定义站点元数据和中文语言，globals.css 为页面样式。

api/recognize/route.ts 转发至 lib/vision.mjs。chatgpt-auth.ts 为保留的模板身份支持，网站访问范围由托管平台管理。

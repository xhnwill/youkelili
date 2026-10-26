# scripts

构建、运行和预览支持。cloudflare-deploy.mjs 将构建配置与 ../cloudflare.json 合并后交给 Wrangler；不要在脚本中保存 Cloudflare Token。

build-tonghua-example.mjs：从 public/examples/tonghua.json 重建同源工程、SVG、MIDI、MusicXML，可选参数输出 PDF 所需的中间 JSON。render-tonghua-pdf.py：用 reportlab 和中文 TrueType 字体生成分页 PDF；Windows 默认微软雅黑，可用 JIANPU_CJK_FONT 指定其他兼容字体。PDF 排版仅用于该示例，网页音乐核心继续由 core.mjs 统一计算。

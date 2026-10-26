# 浏览器资源

core.mjs 为无依赖的简谱解析、指法、SVG、MIDI、MusicXML 核心；app.js 负责交互、裁剪、试听和下载。demo.png 为预置《小星星》示例，非 AI 识别结果。style.css、favicon.svg 为界面样式和图标。

除识谱请求外，转谱与导出不访问服务器。

catalog.js 通过本站 API 读取简谱之家目录、搜索与选定乐谱图片；将用户选中的图片导入现有转谱工作台。

examples/ 保存用户指定《童话》的谱图、逐小节转录、工程和导出；示例素材版权归原权利人，具体见 examples/README.md。core.mjs 支持 Gb 与同音延音 ~，TAB 括号品位表示延续不重拨；试听和 MIDI 合并持续音，MusicXML 保留延音起止。

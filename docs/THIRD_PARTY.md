# 第三方依赖与许可

- 项目自身：MIT，见根目录 LICENSE。
- Pillow 11.3.0：MIT-CMU 及其组件许可，用于图片处理。源码安装由 pip 安装；exe 包中的依赖许可证随打包产物一同分发。
- Python 运行时：PSF License；成品 exe 内含运行时。
- PyInstaller 6.16.0：GPL-2.0-or-later 加引导程序例外，仅构建时使用；项目不因此改变 MIT 许可。
- Web 界面、音乐解析、指法优化、SVG/MIDI/MusicXML 导出为本项目源码实现，无外部前端依赖。
- 示例旋律《小星星》为公有领域旋律；示例图片由 scripts/make_demo.py 生成，未复制第三方谱面。
- AI 接口由用户自行配置；服务能力、费用和数据政策以对应服务商为准，不属于本项目的免费额度。

不包含 RapidOCR、Tesseract、LilyPond、MuseScore 的代码或模型。

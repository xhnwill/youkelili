# 示例资源

tonghua-source.png 是用户上传的《童话》简谱，保留原图署名；曲谱来源 https://www.jianpujia.com/jianpu/445698.html 。作品词曲光良，原图署名缘分简谱。作品及原图版权归原权利人，不适用项目代码的 MIT 许可。

tonghua.json 保存逐小节人工转录、原谱小节号、用户确认的反复路线及校对说明；不是外部 AI 识别准确率样本。按原谱降 G 调、4/4、78 BPM，High G 定弦，最高允许第 15 品。

tonghua.jianpuuke.json、tonghua.svg、tonghua.mid、tonghua.musicxml 为 scripts/build-tonghua-example.mjs 从同一份转录生成的工程和导出。tonghua.pdf 为 scripts/render-tonghua-pdf.py 生成的分页打印版。

反复：原谱第 1-30 小节 → 第 13-27 小节 → 第 31-50 小节，共 65 小节。用户明确选择“你哭着”后回到“对我说”一段；原图缺少反复起点，因此这是明确注明的演奏路线选择。

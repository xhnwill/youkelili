# 网页版测试

core.test.mjs：所有调号与定弦的音高、节奏、非法语法、音域、导出及 Python 参考结果。

vision.test.mjs：模拟视觉请求、Kimi K3 参数、JSON 模式及明确拒绝后的单次回退、回复分块／围栏／说明解析、截断与仅思考／拒绝提示、错误不回显密钥、重定向拒绝、跨来源与图片校验。

catalog.test.mjs：目录／搜索／详情解析、真实表单字段、搜索 ID 分页、正文图片筛选与非任意代理限制。

parity-fixtures.json：从已有 Python 0.1.0 音乐实现生成的 26 组参考谱；用于检查迁移后行为一致性，不是识谱准确率数据。

运行 node --test tests/*.test.mjs。测试使用模拟响应，不消耗 API 额度。

examples.test.mjs：65 小节反复路线、全小节四拍、无越界弦位、最高13品及歧义说明保留；core.test.mjs 新增跨小节延音、MIDI 单次触发与降 G 调覆盖。

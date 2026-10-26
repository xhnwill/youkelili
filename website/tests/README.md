# 网页版测试

core.test.mjs：所有调号与定弦的音高、节奏、非法语法、音域、导出及 Python 参考结果。

vision.test.mjs：模拟视觉请求、临时密钥传递、错误与重定向拒绝、跨来源与图片校验。

parity-fixtures.json：从已有 Python 0.1.0 音乐实现生成的 26 组参考谱；用于检查迁移后行为一致性，不是识谱准确率数据。

运行 node --test tests/*.test.mjs。测试使用模拟响应，不消耗 API 额度。

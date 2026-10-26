# 测试目录

- test_music.py：全部支持调号与定弦的实际音高不变、非法输入、节奏精度、小节、XML 指法和安全转义。
- test_api.py：loopback 服务、会话校验、模拟视觉请求到导出、错误返回与无密钥回显。

执行：python -m unittest discover -s tests -v。

模拟服务器不消耗 API 额度，但不能代替真实谱图的识别准确率评估。

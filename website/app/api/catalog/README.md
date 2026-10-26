# 简谱之家目录与搜索

GET /api/catalog?mode=list&page=0 读取用户指定的简谱目录，页码从 0 开始。

mode=search&q=曲名&page=0 使用来源站公开的搜索表单；返回 searchId 后，后续分页同时携带该 ID。搜索覆盖来源站全站，结果保留谱种标签。

detail/ 与 image/ 分别读取用户选择的乐谱详情和其中一张图片，不抓取全站图片。

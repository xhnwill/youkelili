# 识谱请求

route.ts 接收同来源 JSON POST，并交给 lib/vision.mjs 校验和转发。接口不保存请求体或凭据，不记录原始上游错误。

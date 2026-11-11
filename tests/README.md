# 测试

测试入口：

- `npm test`：核心 Agent 与宿主适配，覆盖每轮身份指令、搜索/正文、工具错误、停止、上下文预算、跨故事隔离、接续摘要、持久化失败、长历史和世界书读取。
- `npm run test:mobile`：真实 Chromium 浏览器加载实际插件入口，使用契约形状的模拟宿主及模拟 API，检查复制、工具循环、停止、接续、设置与会话重载、320/390/768 像素布局、430 像素内容高度下的键盘占位、HTML 文本安全与主故事隔离。默认 Windows Chrome，可用 `CHROME_PATH` 覆盖路径。
- `python tests/installer.py`：本机仅绑定回环地址，使用真实 Git smart HTTP 浅克隆两次，验证包清单与入口。测试服务自动关闭，不发布外网。

浏览器结果与截图在 `artifacts/mobile-report.json`、`mobile-*.png`；真实 DeepSeek 付费调用、Gitoxide 原生安装以及手机实机由用户试用验证。测试不读取用户故事或密钥。

# 测试

测试入口：

- `npm test`：26 项核心 Agent、宿主适配、上下文统计和视口几何测试。新增键盘开合保持基准尺寸、低位窗口避让后恢复，不使用焦点猜测 IME 状态。
- `npm run test:mobile`：浏览器普通界面回归，覆盖独立上下文、统计、复制、停止、320/390/768 像素布局与“键盘关闭但焦点仍保留”状态；其模拟 IME 只作辅助，不再代替实际安卓验收。
- `python tests/installer.py`：本机仅绑定回环地址，使用真实 Git smart HTTP 浅克隆两次，验证包清单与入口。测试服务自动关闭，不发布外网。

- `npm run test:android`：真实 Android WebView + 实际输入法集成回归，先在同环境复现 1.0.1 失败，再验证候选。拒绝真实手机，仅接受隔离的 `storyworkshop_` AVD。需要官方 TauriTavern 2.3、插件、Gboard26/36/9键配置；测试不发送模型请求或主故事消息。

原生脚本通过 `ADB_PATH` 和 `ANDROID_SERIAL` 定位工具/设备，`ANDROID_IME_LAYOUT=qwerty|36key|9key`、`ANDROID_IME_MODE=floating|dragged|expanded`、`ANDROID_IME_SELECTOR=#sw-input|#sw-background|#sw-notes` 指定场景，`ANDROID_IME_OUT` 保存证据。测试配置是 Android34 Google APIs x86_64（含ARM64翻译）、1080×2340、DPI440、Gboard正常高度；需要先在实际输入法中选择对应布局。脚本依赖现代 Node 的内置 WebSocket（本次为 Node24），不调用 Playwright 的浏览器模拟。

原生测试实际等待 Android IME 窗口 HAS_DRAWN、点击软键盘、等待候选提交、检查系统独立报告的键盘物理边界、使用 Android screen capture；不通过 JS 写入文字。每场两轮开合后检查焦点保留时导航恢复、位置/尺寸恢复和文本不丢失。视频与36键截图作为版本附件公开，原始环境/日志不入源码包。

浏览器结果与截图在 `artifacts/mobile-report.json`、`mobile-*.png`；真实 DeepSeek 付费调用、用户具体手机和其他输入法仍留用户试用确认。原生安装/更新已在隔离的官方安卓应用中实际执行。

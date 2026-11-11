# 故事研讨助手

用于 TauriTavern 的手机优先第三方前端扩展。独立讨论故事、检索角色与世界书、研究网上资料，并草拟可复制的后续提示词。

版本：1.0.2。它不改主故事预设，不向主故事发消息，也不自动填写主故事输入框。

## 从 1.0.0 / 1.0.1 更新

在 TauriTavern 的扩展管理中更新“故事研讨助手”，然后彻底退出并重新打开应用；不必卸载或清空数据。原来的会话、身份指令、补充资料和记住密钥的选择继续保留。

1.0.2 在 Android 14 模拟器中运行官方未修改的 TauriTavern 2.3.0 APK 和真实 Gboard，复现并修复了键盘收起后仍保留输入焦点导致的窗口/导航不恢复，以及打开过程中反复重排输入区的问题。现在只按实际键盘几何避让，原本不被挡住的小窗保持尺寸位置；收起键盘后即使焦点还在也会恢复。

标题旁会显示 `1.0.2`，可据此确认加载了新版。保留小悬浮窗、拖动/展开、独立会话与上下文计量功能。

## 安装

TauriTavern 官方“安装扩展”入口接收 HTTP(S) Git 仓库地址，**不能直接导入本项目 ZIP**。按你的条件选以下方式。

### 手机通过 Git 地址安装

在 TauriTavern 的“扩展 → 安装扩展”中粘贴以下 Git 地址：

```text
https://github.com/dingze-cloud/tauritavern-story-workshop.git
```

安装完成后启用扩展，必要时重启应用。无需电脑或额外安装工具。普通浏览器中的 DeepSeek 聊天网页不是本插件的运行环境。

### 下载 1.0.2 用户测试版

- [版本页面与更新说明](https://github.com/dingze-cloud/tauritavern-story-workshop/releases/tag/v1.0.2)
- [插件 ZIP](https://github.com/dingze-cloud/tauritavern-story-workshop/releases/download/v1.0.2/story-workshop-1.0.2.zip)
- [局域网手机安装工具包](https://github.com/dingze-cloud/tauritavern-story-workshop/releases/download/v1.0.2/story-workshop-install-kit-1.0.2.zip)
- [源码 ZIP](https://github.com/dingze-cloud/tauritavern-story-workshop/releases/download/v1.0.2/story-workshop-source-1.0.2.zip)
- [安卓原版应用＋真实九宫格测试录像](https://github.com/dingze-cloud/tauritavern-story-workshop/releases/download/v1.0.2/android23-ime-1.0.2.mp4)
- [真实36键数字行键盘截图](https://github.com/dingze-cloud/tauritavern-story-workshop/releases/download/v1.0.2/android23-36key-1.0.2.png)

手机优先使用上面的 Git 地址直接安装；ZIP 供手工安装或源码维护使用。

### 手机与电脑在同一个 Wi-Fi：无需公开仓库

1. 在电脑解压 `story-workshop-install-kit-1.0.2.zip`。电脑需要 Python 3 与 Git，手机不需要这些工具。
2. Windows 双击 `启动手机安装.cmd`；其他系统在解压目录运行 `python3 serve-install.py --lan`。
3. 保持窗口打开，复制窗口显示的地址，例如 `http://192.168.1.10:8766/story-workshop.git`。
4. 手机与电脑连接同一 Wi-Fi，将该地址粘贴到 TauriTavern 的“扩展 → 安装扩展”。如有多张网卡，使用手机能访问的那个地址；可先在手机浏览器打开地址的根路径检查连通。
5. 安装完成后按 Ctrl+C 关闭电脑窗口。插件运行和调用模型不再依赖电脑。以后使用此安装来源更新插件时，需要再次运行安装工具。

若 Windows 防火墙询问，只允许你信任的专用网络即可。工具只提供这一份插件的只读 Git 服务，不对外提供你的故事、密钥或任意文件。未自动更改防火墙设置。

### 可以访问 TauriTavern 数据目录：手工安装

把 `story-workshop-1.0.2.zip` 解压得到的 `story-workshop` 文件夹，放入当前数据根目录的 `default-user/extensions/`。结果应为 `default-user/extensions/story-workshop/manifest.json`，不要再多套一层同名目录。重启应用并启用。

部分手机系统或应用版本不能直接访问内部数据目录，此时使用 Git 地址安装；不要往 APK、应用安装目录或主故事文件中粘贴代码。源代码 ZIP 供开发维护使用，不是应用数据备份，不要用“恢复备份”功能导入。

## 首次使用

1. 打开要讨论的主故事聊天，再点右下角 **✦ 故事助手**。首次打开会绑定当前故事；面板顶部显示绑定目标。
2. 进入 **设置**，填写模型 API 密钥。默认模型地址为 `https://api.deepseek.com`，模型名为 `deepseek-flash`；可按账号实际可用模型修改。网页聊天订阅与 API 账号余额是不同的服务。
3. 在 **助手身份与背景提示词** 中填写助手职责和创作背景。每次模型请求都会完整包含它，工具续轮与接续摘要也一样。
4. 在 **本故事补充资料** 中填写你想补充的主线或人物经历。这些资料只属于当前助手会话，同一故事“整理并接续”时继承。
5. 点击 **保存设置**。可用 **测试模型连接** 检查模型调用；这会产生一次小额的真实 API 请求。
6. 回到 **讨论**。例如：“先了解当前故事，梳理人物经历和未解决的伏笔。”助手可自行查阅故事资料，再与你讨论。
7. 选定结果后，点击 **复制提示词块** 或 **复制全文**，回主故事输入框自行粘贴并发送。

密钥默认仅在当前应用页面的内存中保留，重启后需重新填写。勾选 **记住密钥** 后才会保存在本机插件数据中；取消并保存会清空持久化密钥。模型密钥与搜索密钥均不会写入主故事。

## 网络检索

默认使用 DeepSeek 官方 Search 和 Fetch API。搜索地址填写 `https://api.deepseek.com`，不需要附加 `/v1`。搜索密钥留空时使用模型密钥；若模型来自其他服务或代理，请单独填写可调用 DeepSeek 搜索 API 的密钥。

模型决定何时检索。搜索返回标题、链接与摘要，必要时再读取网页正文。搜索与正文读取按服务商规则单独计费。“查阅来源”中可打开实际返回的链接。不是每一轮都必须联网；可在设置关闭。

使用自定义模型 API 时，它需要兼容 Chat Completions 和 tools/function calling，并允许当前应用跨域请求；仅支持 HTTPS（本机 localhost 调试除外）。插件不会更改宿主连接配置，也不会自动使用主故事保存的密钥。

## 资料与会话

- 主故事历史通过官方 Chat API 全文检索和分页读取；不依赖前端当前可见的消息。
- 关联资料包括角色设定快照、聊天世界书、角色主世界书、关联辅助世界书、当时选中的全局世界书，以及角色卡内嵌世界书。世界书可查看未激活和禁用条目，禁用状态会标出。
- 角色设定与世界书关联名单在创建会话时捕获；主故事历史和书籍条目按读取时的内容提供。编辑角色或改变关联书目后，可新建并关联会话。无法读取的资料会明确返回错误，不伪装已读。
- 切换主故事不会把旧助手会话悄悄改绑到新故事。**会话 → 空白新会话** 默认绑定当前主故事。
- **整理并接续** 会分段整理当前讨论生成摘要，然后新建会话；原讨论保留，可由助手检索。跨故事时会提示改为新建空白会话，不带入原故事资料。
- 上下文字符预算不是模型 token 数。超出预算后保留最近的完整讨论轮次，界面说明更早轮次被省略；原记录仍保存可检索。可提前使用“整理并接续”。
- 讨论页顶部实时显示“已用字符 / 字符预算 · 占比”。统计包括身份背景、补充资料、摘要、保留历史、工具说明和当前输入；工具结果进入本轮请求时也会更新。接近预算或已有历史省略时会提醒整理接续。
- API 返回 usage 后，另行显示“上次输入 N tokens · 输出 M”。这是上一次模型调用的实际用量，不是把历次费用相加。字符数不会冒充 token；接口未返回用量时明确说明。点用量条可查看统计范围及历史保留情况。
- **停止** 会取消当前网络请求；未完成的工具调用不会在下次对话自动重放。关闭面板则保留正在进行的工作。

## 手机适配与验证范围

界面默认是小悬浮窗，不用全屏遮罩锁住主故事。按住标题可拖动，点击右上角展开按钮可选择大窗口，再点可恢复小窗；“—”收起为悬浮球。

同时消费宿主、浏览器可见视口和安卓旧版浮窗本地 IME 偏移，不因宿主快照滞后而忽略浏览器变化。仅在窗口会被实际键盘遮挡时夹取位置/高度，不以输入焦点猜测键盘、不在开合时调换编辑区顺序。键盘关闭后恢复位置、尺寸与导航，即使 Android 保留文本框焦点。背景与资料编辑使用独立滚动区。输入不以单独按回车发送，电脑可使用 Ctrl/⌘+Enter。

本次键盘修复的主要依据是真实 Android 14 运行时、官方 TauriTavern 2.3.0 ARM64 APK 和实际 Gboard，不是浏览器覆盖层。使用系统触摸点击真实26键拼音、36键数字行与九宫格，完成普通浮窗、低位拖动、展开及身份背景编辑六个场景，各两轮输入/候选提交/收起/再次打开；独立读取 Android 系统 IME 窗口物理边界断言未遮挡。旧版 1.0.1 的恢复失败在同环境中复现，新版通过。另有26项逻辑测试、浏览器普通界面回归和真实 Git 安装协议检查。

未使用真实付费密钥或私人故事。这里的安卓运行环境是独立模拟器，不宣称已在用户具体手机和所有输入法上通过。

插件依赖官方 `api.chat`、`api.extension.store`，优先使用 `api.layout`。布局同时按 v2.3.0 的公开 surface-local IME 契约与较新的内容视口契约核对；缺少必要接口时会提示更新应用。

## 反馈时提供

TauriTavern 版本、手机系统、执行了什么操作、屏幕错误原文，以及是否在测试模型连接时就失败。不要发送 API 密钥。若是资料读取问题，请说明是历史消息、角色设定还是哪类世界书。

## 开发

`npm install` 后，运行 `npm test`、`npm run test:mobile`、`python tests/installer.py`。浏览器测试使用本机 Chrome，其他位置可通过 `CHROME_PATH` 指定。`npm run build` 生成插件包、安装工具包、源码包及 SHA-256 清单。

原生键盘回归为 `npm run test:android`：需要独立的 `storyworkshop_` 前缀 AVD、已安装原版应用和插件、真实 Gboard，以及 `ADB_PATH`、`ANDROID_SERIAL` 配置。脚本通过 ADB 点击实际键盘并原生截屏，通过真实 WebView CDP 只读检查状态，不注入输入文本。具体布局/坐标针对本次1080×2340、DPI440、正常键盘高度测试配置，不是任意手机的通用自动化工具。详细范围见 `tests/README.md`。

宿主：[TauriTavern](https://github.com/Darkatse/TauriTavern)。参考 [插件兼容性](https://github.com/Darkatse/TauriTavern/blob/main/docs/CurrentState/ThirdPartyExtensions.md)、[Chat API](https://github.com/Darkatse/TauriTavern/blob/main/docs/API/Chat.md)、[Extension Store](https://github.com/Darkatse/TauriTavern/blob/main/docs/API/Extension.md)、[Layout API](https://github.com/Darkatse/TauriTavern/blob/main/docs/API/Layout.md) 和 [DeepSeek Search & Fetch](https://api-docs.deepseek.com/guides/search/)。

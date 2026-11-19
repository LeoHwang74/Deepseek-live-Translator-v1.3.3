# DS音轨翻译 v1.3.3

**直接监听 YouTube 标签页音轨，用 DeepSeek 实时翻译成简体中文的 Chrome 扩展（Manifest V3）。**

## 和 YT音轨翻译 的区别

| | v1.3.3（本仓库） | YT音轨翻译 |
| --- | --- | --- |
| 语音识别 | DeepSeek ASR（按音频时长计费） | 本地 faster-whisper（免费） |
| 翻译 | `deepseek-chat` | 本地 Ollama `qwen2.5:3b` |
| API Key | 必须自备 DeepSeek Key | 不需要 |
| 联网 | 需要 | 不需要 |
| 成本 | 2 小时电影约 ¥1.5–3 | 0 元 |

## 功能

- 以音轨为准，不读取也不依赖 YouTube CC 字幕
- DeepSeek ASR 自动识别语言（英/德/俄/韩/日/泰…），固定输出简体中文
- 实时双语悬浮层，叠加在播放器内部，支持全屏
- 划词翻译、`Alt + Shift + A` 快捷键
- 绿色 DS 图标

## 安装与配置

整个流程四步，大约 5 分钟。**不需要装 Python、不需要跑本地服务**，只要一个 DeepSeek API Key。

### 1. 准备 DeepSeek API Key

1. 打开 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 并登录
2. 创建一把新 Key，形如 `sk-xxxxxxxxxxxxxxxx`
3. **立刻复制**——页面关掉后就看不到了（只显示一次）
4. 顺便确认账户里有余额：语音识别按时长计费，余额为 0 会返回 402

> Key 只保存在本机 `chrome.storage.local`，请求由扩展后台直接发往 `api.deepseek.com`，不经过任何第三方。

### 2. 下载并加载扩展

1. 到 [Releases](../../releases/latest) 下载 `deepseek-live-translator-v1.3.3.zip`
2. 解压到任意目录（解压后的文件夹里应该直接能看到 `manifest.json`）
3. 打开 `chrome://extensions`
4. 右上角打开 **开发者模式**
5. 点 **加载已解压的扩展程序**，选中第 2 步解压出来的文件夹
6. 加载成功后，首次安装会自动弹出设置页

需要 **Chrome 116+**（`offscreen` / `tabCapture` 依赖）。

### 3. 填写 Key 并测试

在设置页：

| 字段 | 填什么 |
| --- | --- |
| API Key | 第 1 步复制的 `sk-...` |
| Base URL | 保持默认 `https://api.deepseek.com` |
| 实时模式 | 建议先保持「极速」 |
| 上下文行数 | 默认 3 |

点 **测试连接**，看到「连接成功 + 返回示例文本」就说明 Key 和网络都通了，然后点 **保存设置**。

> 模型固定为 `deepseek-chat`，设置页没有模型选项——这是 v1.3.3 的限制。

### 4. 以后更新版本

新版本发布后：

1. 下载新的 zip 并解压，**覆盖**原文件夹（或者换个目录）
2. `chrome://extensions` 里点该扩展的 **重新加载**
3. 刷新 YouTube 页面

已保存的 Key 和设置不会丢，它们存在扩展的本地存储里。

### 卸载

`chrome://extensions` → 该扩展卡片 → **移除**。
如果要连本地数据一起清掉，移除前先打开设置页点「恢复默认」，或者移除后在 Chrome 设置里清除扩展数据。

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 提示「尚未配置 DeepSeek API Key」 | 设置页没填 Key 或没点保存 | 填好后点 **保存设置** |
| 测试连接报 401 | Key 无效、复制不全或已作废 | 回平台重新生成一把 |
| 测试连接报 402 | 账户余额不足 | 到开放平台充值 |
| 报 `model not found` / 404 | 这个版本固定用 `deepseek-chat`，无法改 | 确认 Base URL 是 `https://api.deepseek.com`，不要填成别的服务商 |
| 点开始后提示无法捕获音轨 | 不是 YouTube 页面，或没有用户点击授权 | 确认当前标签页是 `youtube.com`，刷新页面重试 |
| 有声音但一直不出字幕 | 标签页被静音、系统输出设备异常，或内容是 DRM 保护的 | 取消静音；DRM 内容（Netflix 等）无法捕获 |
| 识别请求过于频繁（429） | 分片发得太密或平台限流 | 设置页把实时模式改成「均衡」或「稳定」 |
| 字幕延迟很大（3 秒以上） | 正常现象 | ASR 不支持流式，0.6–1.6 秒分片，端到端 2–3.5 秒属于预期 |


## 使用

1. 打开 YouTube 视频或直播
2. 点击工具栏里的扩展图标
3. 点「开始音频翻译」，允许捕获当前标签页音轨（Chrome 要求必须由用户点击）
4. 播放器底部出现原文 + 简体中文译文
5. 再次点击停止；`Alt + Shift + A` 可开始 / 停止

## 工作原理

```
YouTube 标签页音轨
   │ chrome.tabCapture
   ▼
Offscreen 文档：AudioContext + 能量 VAD
   │ 0.6–1.6 秒 WAV 分片
   ▼
Service Worker ──► DeepSeek ASR (/v1/tools/asr)
   │ 自动识别语言，跨分片去重
   ▼
Content Script ──► deepseek-chat 流式翻译
   ▼
播放器内 Shadow DOM 悬浮层
```

ASR 不支持流式，端到端延迟约 **2–3.5 秒**。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `tabCapture` | 捕获当前标签页音轨 |
| `offscreen` | 在隐藏文档中运行 AudioContext |
| `storage` | 保存设置与 API Key |
| `activeTab` / `scripting` | 在 YouTube 页面注入悬浮层 |
| `contextMenus` | 划词翻译、开始/停止 |
| `clipboardWrite` | 复制译文 |

`host_permissions` 只有 `https://api.deepseek.com/*`。不申请麦克风、摄像头、历史记录。

## 已知限制

- 音频翻译仅支持 YouTube 页面，只针对当前标签页，不监听麦克风
- 标签页静音时捕获到的音轨也是静音，ASR 无法识别
- DRM 保护的内容可能无法捕获音频
- 模型固定为 `deepseek-chat`，不能改（YT音轨翻译 才支持自定义模型）

## License

[MIT](LICENSE)

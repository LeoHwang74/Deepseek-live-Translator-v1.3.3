# DS音轨翻译 v1.3.3

**直接监听 YouTube 标签页音轨，用 DeepSeek 实时翻译成简体中文的 Chrome 扩展（Manifest V3）。**

> 📦 **这是历史版本快照。** v1.3.3 发布于 2026-11，之后项目重写为
> [YT音轨翻译](https://github.com/LeoHwang74/yt-audio-translator)：语音识别和翻译都改成本地运行（faster-whisper + Ollama），
> 不再需要 API Key。新装用户建议直接用新版。
>
> 这个仓库保留原因：v1.3.3 是最后一个「云端 ASR + 可换翻译服务」的版本，有些场景下识别质量比本地 small/base 模型更好。

## 和 v1.4+ 的区别

| | v1.3.3（本仓库） | YT音轨翻译（新版） |
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

## 安装

1. 下载 [Releases](../../releases/latest) 里的 `deepseek-live-translator-v1.3.3.zip` 并解压
2. 打开 `chrome://extensions`，右上角开启**开发者模式**
3. 点「加载已解压的扩展程序」，选择解压出来的文件夹
4. 首次安装会自动打开设置页

需要 **Chrome 116+**（`offscreen` / `tabCapture`）。

## 准备 API Key

本扩展**不内置任何 Key**，需要你自己去
[DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 创建一把（形如 `sk-...`），
粘贴到设置页的 `API Key` 输入框并保存。

Key 只保存在本机 `chrome.storage.local`，请求由扩展后台直接发往 `api.deepseek.com`。

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
- 模型固定为 `deepseek-chat`，不能改（v1.4.0 起才支持自定义模型）

## License

[MIT](LICENSE)

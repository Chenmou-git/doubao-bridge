# 豆包桥接 (Doubao Bridge)

> 🚀 Hermes Agent Skill v3.4 — 让 AI Agent 操控豆包桌面 App 进行全自动多模态问答

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS-lightgrey)]()
[![Version](https://img.shields.io/badge/version-3.4.0-brightgreen)]()

**doubao-bridge** 是一个 Hermes Agent 技能模块，通过 Chrome DevTools Protocol (CDP) 直连**豆包桌面 App**，实现全自动的多模态 AI 问答桥接。无需手动操作浏览器、不触碰验证码、不弹新窗口。

---

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 🖼️ **图片问答** | 剪贴板 / 任意图片 → 发送到豆包 → 自动读取 AI 回复 |
| 💬 **纯文本对话** | 直接向豆包发送文字问题并获取回答 |
| 🎨 **设计分析** | 网页截图 → 豆包分析视觉设计风格 → 改进迭代 |
| 🔄 **连续问答** | 同一会话里连续追问，无需重新上传图片 |
| 🏎️ **CDP 直连** | Playwright 直连 CDP 端口，`setInputFiles` + `fill` → 无 `isTrusted` 问题 |
| 🛡️ **4 步检测链** | 图片上传→DOM 确认→豆包处理→稳定缓冲→才发送文字 |

---

## 🏗️ 架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Hermes Agent   │────▶│  doubao-bridge   │────▶│   豆包 App       │
│  (AI Agent)     │     │  (CDP + Playwright)    │  (--remote-      │
│                 │◀────│  v3.4              │◀────│   debugging)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 📋 环境要求

- **macOS** (豆包桌面版)
- [豆包 App](https://www.doubao.com) 已安装并登录
- **Node.js** ≥18 + Playwright：`npm i playwright`
- **Swift** (macOS 自带，用于剪贴板提取)
- Hermes Agent (可选，独立也可用)

---

## 🚀 快速开始

### 1. 启动豆包（开启调试端口）

```bash
killall Doubao 2>/dev/null; sleep 2
"/Applications/Doubao.app/Contents/MacOS/Doubao" --remote-debugging-port=9222 &
```

### 2. 图片问答（推荐 doubao_final.js）

```bash
# 截图或复制图片到指定路径
cp your_screenshot.png /tmp/clipboard_img.png

# 发送图片 + 问题，自动等待回复
NODE_PATH=~/.local/node-v22.11.0-darwin-arm64/lib/node_modules \
node scripts/doubao_final.js "分析这张图片"
```

### 3. 纯文本问答

```bash
rm -f /tmp/clipboard_img.png
node scripts/doubao_cdp.js "介绍一下 Transformer 架构"
```

### 4. 单独读取回复

```bash
node scripts/doubao_read.js "关键词"
```

---

## 📜 脚本说明

| 文件 | 作用 | 推荐 |
|------|------|------|
| `doubao_final.js` | **改进版主控**：稳定检测 fallback，自动解决信号缺失 | ⭐ 推荐 |
| `doubao_cdp.js` | CDP 主控：上传图 + 发送文字 + 等回复 | 基础版 |
| `clip_to_img.swift` | 剪贴板图片 → PNG 文件 | 辅助 |
| `doubao_read.js` | 单独读取最新回复 | 辅助 |

### 返回值

| 输出 | 含义 |
|------|------|
| `NO_CHAT_PAGE` | 豆包未打开聊天页面 |
| `NO_FILE_INPUT` | 页面上传组件未就绪（时序问题，v3.4 已优化） |
| `TIMEOUT` | 120 秒内未收到有效回复 |
| `NO_IMAGE` | 剪贴板无图片 |
| 正常文本 | AI 回复内容（最多 5000 字符） |

---

## 🔧 关键机制

### 图片上传 4 步检测链

上传图片后，脚本经过 **4 步检测** 才发送文字：

1. **触发上传** — `setInputFiles()` 注入图片到 `<input type="file">`
2. **DOM 确认** — 轮询等待新 `<img>` 元素出现（最多 30s）
3. **豆包处理确认** — 检测 `data:`/`blob:` 图片和文件预览 UI 组件
4. **稳定缓冲** — 额外等待 2-5s 确保完全稳定
5. **发送文字** — 重新查找 textarea（DOM 重渲染容错，最多重试 5 次）

### 稳健回复检测

- **信号检测**：匹配「已完成思考」「深度思考已完成」
- **稳定兜底**：连续 4 次 body 内容不变（长度 >500）→ 视为回复完成
- **回复定位**：使用 `lastIndexOf` 确保匹配最新一条消息（非历史消息）
- **回复裁剪**：自动剔除 UI 装饰文字（「专家」「分享」「点赞」等）

### bash 转义陷阱

```bash
# ❌ 错误 — $ 被 bash 解释
node -e "..."  

# ✅ 正确
node scripts/doubao_final.js "你的问题"
```

---

## 🎨 设计分析工作流

```bash
# 1. 截图
npx playwright screenshot https://example.com /tmp/clipboard_img.png

# 2. 发送分析请求
node scripts/doubao_final.js \
  "请纯粹从视觉设计角度分析这个网页截图，忽略文字内容。分析：配色、字体、布局、插画风格、UI组件细节、整体设计流派。给出复刻CSS参数。"

# 3. 追问细节（同一会话，无需重新上传图片）
node scripts/doubao_final.js "请继续深入分析设计风格..."

# 4. 迭代改进
# 修改代码 → 重新截图 → 发送对比评价
node scripts/doubao_final.js "这是改进后的版本，请对比原版评价..."
```

---

## ⚙️ 集成到 Hermes Agent

作为 Hermes Skill 安装后，Agent 可以直接调用：

```yaml
# SKILL.md 声明
name: doubao-bridge
description: CDP直连豆包App，全自动多模态——图片分析、生图prompt
version: 3.4.0
```

Agent 会在需要视觉理解、图片分析或生成中文 prompt 时自动选择豆包桥接。

---

## 🔧 故障排查

| 问题 | 解决 |
|------|------|
| `NO_CHAT_PAGE` | 确保豆包 App 已打开且停留在聊天页面 |
| `NO_FILE_INPUT` | CDP 连接后页面加载不完整，v3.4 已加 `sleep(2000)` 等待 |
| 信号不出现导致超时 | v3.4 增加稳定检测 fallback，连续 4 次 body 不变即完成 |
| 图片不显示 | 检查 `/tmp/clipboard_img.png` 是否存在 |
| CDP 连接失败 | `lsof -i :9222` 检查豆包是否以调试模式启动 |
| 连续问答 | 直接用 `doubao_final.js`，无需重启豆包 |

---

## 📄 License

MIT © 2024 Hermes Agent

---

## ⚠️ 注意事项

- 豆包 App 需保持运行，不可关闭
- 调试端口仅限本地访问，切勿暴露到公网
- 对话上下文由豆包管理，脚本不维护对话历史
- 仅支持**一个聊天页面**，多标签可能导致行为异常

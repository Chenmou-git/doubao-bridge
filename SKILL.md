---
name: doubao-bridge
description: CDP直连豆包App，全自动多模态——图片分析、生图prompt。不开新窗口，零验证码。
version: 3.5.0
author: Hermes Agent
license: MIT
platforms: [macos]
metadata:
  hermes:
    tags: [doubao, vision, cdp, playwright]
    related_skills: [macos-computer-use]
---

# 豆包桥接 v3.5 — CDP 直连 + 页面克隆

Chrome DevTools Protocol 直连豆包桌面 App，Playwright 操控。
不开新窗口，不截图，不登录。

## 启动豆包（一次）

```bash
killall Doubao 2>/dev/null; sleep 2
"/Applications/Doubao.app/Contents/MacOS/Doubao" --remote-debugging-port=9222 &
```

## 图片问答流程

```bash
# 1. 提取图片到 /tmp/clipboard_img.png（从剪贴板）
swift skills/.../clip_to_img.swift

# 或者直接拷贝任意图片到指定路径
cp your_screenshot.png /tmp/clipboard_img.png

# 2. 上传+发送+读回复
NODE_PATH=~/.local/node-v22.11.0-darwin-arm64/lib/node_modules \
node skills/.../doubao_cdp.js "你的问题"
```

## 纯文本

```bash
rm -f /tmp/clipboard_img.png
node skills/.../doubao_cdp.js "你的问题"
```

## 单独读回复

```bash
node skills/.../doubao_read.js "关键词"
```

## 脚本

| 文件 | 作用 |
|------|------|
| clip_to_img.swift | 剪贴板→PNG |
| doubao_cdp.js | 上传图+发文字+等回复 |
| doubao_final.js | **推荐** — 改进版，稳定检测fallback，解决信号缺失 |
| doubao_read.js | 单独读回复 |

## 推荐用法（使用 doubao_final.js）

```bash
# 1. 确保截图在 /tmp/clipboard_img.png
cp your_screenshot.png /tmp/clipboard_img.png

# 2. 上传+发送+读回复（自动处理所有边界情况）
NODE_PATH=~/.local/node-v22.11.0-darwin-arm64/lib/node_modules \
node skills/.../doubao_final.js "你的问题"
```

## 关键机制

### 常见问题与解决

#### NO_FILE_INPUT（时序问题）
文件输入框存在但 `class="hidden"`，`page.$()` 仍能找到。真正原因是连接 CDP 后页面未完全加载。
**解决**：`connectOverCDP` 后 `sleep(2000)` 再查找元素。

#### 「已完成思考」信号不出现
有时信号文本不出现在 body 中，导致超时。
**解决**：增加「稳定检测 fallback」——连续 4 次 body 内容不变（长度>500）即视为回复完成。

#### bash 转义陷阱
`node -e '...'` 中用双引号会导致 `$` 被 bash 解释。
**解决**：外层用单引号 `'...'`，或写脚本文件执行。

#### 连续问答
同一会话中发新问题时，file input 仍存在。直接用 `doubao_final.js`，无需重新启动豆包。

**NODE_PATH**：固定为 `~/.local/node-v22.11.0-darwin-arm64/lib/node_modules`

### 图片上传完整检测链（v3.3）
上传图片后，脚本经过 **4 步检测链** 才发送文字：

1. **触发上传**：`setInputFiles()` 将图片注入 `<input type="file">`
2. **DOM 确认**：轮询等待新 `<img>` 元素出现（最多 30s）——图片已挂载到页面
3. **豆包处理确认**：检测 `data:`/`blob:` 图片和文件预览 UI 组件是否出现——豆包已完成图片识别
4. **稳定缓冲**：额外等待 2-5s 确保完全稳定
5. **发送文字**：重新查找 textarea（DOM 重渲染容错，最多重试 5 次）

这确保了「图片完全上传+豆包完成处理」之后才发送文字，彻底杜绝图文不同步的问题。

### 发送文字时的容错
图片上传后 DOM 可能重渲染导致 textarea 元素 detached。脚本会重新查找 textarea（最多重试 5 次，每次间隔 1s）后再 fill + Enter。

### 回复检测
轮询 body.innerText，匹配「已完成思考」或「深度思考已完成」信号。超时 120s 后打印最近 3000 字符兜底内容。

### 回复定位（v3.4）
使用 `lastIndexOf` 而非 `indexOf` 定位问题文本——确保匹配到的是最新一条消息，而非历史对话中的旧消息。

### 回复裁剪
自动裁剪尾部 UI 装饰文字（「专家」「分享」「复制」「点赞」「快捷」「PPT 生成」「AI 表格」等），保留纯净回复内容。

## 设计分析工作流（v3.4 新增）

当需要让豆包分析网页视觉设计风格时：

1. **截图**：用 Playwright 截图 `npx playwright screenshot URL /tmp/clipboard_img.png`
2. **发送**：`node doubao_final.js "请纯粹从视觉设计角度分析..."`
3. **追问细节**：在同一会话连续发送追问，无需重新上传图片
4. **迭代改进**：根据豆包反馈修改代码→重新截图→再次发送对比评价

典型提问模板：
- 「请纯粹从视觉设计角度分析这个网页截图，忽略文字内容。分析：配色、字体、布局、插画风格、UI组件细节、整体设计流派。给出复刻CSS参数。」
- 「请继续深入分析设计风格...」
- 「这是改进后的版本，请对比原版评价...」

## 页面克隆工作流（v3.5 新增）

当需要完整复刻一个登录后的页面（如 SaaS 订阅页）时：

### 第一步：提取原页面数据（通过 Safari AppleScript）

```bash
# 获取渲染后的 DOM（用 innerHTML 而非 outerHTML，避免 Next.js RSC 序列化格式）
osascript -e 'tell app "Safari" to do JavaScript "document.body.innerHTML" in current tab of front window'

# 提取 CSS 变量
osascript -e 'tell app "Safari" to do JavaScript "
  JSON.stringify({
    fg: getComputedStyle(document.documentElement).getPropertyValue(\"--foreground-base\"),
    mg: getComputedStyle(document.documentElement).getPropertyValue(\"--midground-base\"),
    bg: getComputedStyle(document.documentElement).getPropertyValue(\"--background-base\")
  })
" in current tab of front window'

# 下载外部 CSS
curl -sL "CSS_URL" -o css_N.css
```

### 第二步：提取 Canvas/WebGL 插画

**关键问题**：Three.js WebGL canvas 默认 `preserveDrawingBuffer: false`，`readPixels()` 返回全零。

**解决方案**：screencapture 截窗口 → 获取 canvas 屏幕坐标 → PIL 裁剪
```bash
# 激活 Safari + 截窗口
osascript -e 'tell app "Safari" to activate'
screencapture -l$(osascript -e 'tell app "Safari" to id of window 1') /tmp/shot.png

# 获取 canvas 坐标
osascript -e 'tell app "Safari" to do JavaScript "
  JSON.stringify(Array.from(document.querySelectorAll(\"canvas\")).filter(c=>c.width===599).map(c=>{
    let r=c.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}
  }))
" in current tab of front window'

# PIL 裁剪（注意 Retina 缩放因子 = screenshot.w ÷ window.innerWidth）
python3 -c "
from PIL import Image; img = Image.open('/tmp/shot.png')
scale = img.size[0] / window_innerWidth
cropped = img.crop((x*scale, y*scale, (x+w)*scale, (y+h)*scale))
cropped.resize((599,799)).save('card.png')
"
```

### 第三步：构建复刻页面

- **配色**：使用原版 CSS 变量值（`--background-base` / `--midground-base` / `--foreground-base`）
- **字体**：移除 Google Fonts CDN（国内被墙导致页面白屏），改用系统字体 fallback
- **图层**：按豆包分析的层级顺序（底色→噪点→边框→卡片→插画→文字）
- **图片**：PNG→JPEG quality 88 base64 嵌入

### 常见陷阱

| 现象 | 根因 | 解决 |
|------|------|------|
| 插画不可见/重影 | JPEG 已含混合结果，再次 apply blend-mode 导致二次暗化 | 去掉 canvas 上的 `mix-blend-mode` |
| 页面全白 | Google Fonts CDN 被墙阻塞渲染 | 移除外部字体链接 |
| Canvas 导出全零 | WebGL `preserveDrawingBuffer: false` | 用 screencapture，不要用 toDataURL |
| 4 张 Canvas 完全相同 | toDataURL 捕获了空 buffer | 截窗口裁剪 |

### 迭代流程

```
截图原版 → 豆包分析视觉结构 → 构建 → 截图 → 豆包对比指正 → 修复 → 循环
```

每次只发复刻版给豆包，问「对比原版，哪里不同？」，豆包逐项指出配色/字体/间距/图层问题。
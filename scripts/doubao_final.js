// doubao-bridge v3.4: 改进版——稳定检测 fallback + 连续问答支持
const { chromium } = require('playwright');
const fs = require('fs');
const Q = process.argv[2] || '描述这张图';
const IMG = '/tmp/clipboard_img.png';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts()[0].pages();
  let chatPage = pages.find(p => p.url().includes('doubao-chat/chat'));
  if (!chatPage) { console.log('NO_CHAT_PAGE'); process.exit(1); }

  // 等待页面稳定（解决 NO_FILE_INPUT 时序问题）
  await sleep(2000);

  if (!fs.existsSync(IMG)) {
    // 纯文本模式
    const ta = await chatPage.$('textarea[placeholder="发消息..."]');
    if (!ta) { console.log('NO_TEXTAREA'); process.exit(1); }
    await ta.click(); await sleep(300);
    await ta.fill(Q); await sleep(300);
    await ta.press('Enter');
    console.log('text sent');
  } else {
    // 图片模式
    const fi = await chatPage.$('input[type="file"]');
    if (!fi) { console.log('NO_FILE_INPUT'); process.exit(1); }
    await fi.setInputFiles(IMG);
    console.log('[1/3] image uploaded, waiting...');
    await sleep(4000);

    // 找 textarea
    let ta;
    for (let i = 0; i < 5; i++) {
      ta = await chatPage.$('textarea[placeholder="发消息..."]');
      if (ta) break;
      await sleep(1000);
    }
    if (!ta) { console.log('NO_TEXTAREA'); process.exit(1); }

    await ta.click(); await sleep(500);
    await ta.fill(Q); await sleep(500);
    await ta.press('Enter');
    console.log('[2/3] question sent');
  }

  // 等待回复：信号检测 + 稳定检测 fallback
  console.log('[3/3] waiting for reply...');
  var stable = 0, lastBody = '';

  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const body = await chatPage.evaluate(() => document.body.innerText);
    const signals = ['已完成思考', '深度思考已完成', '思考已完成'];

    if (signals.some(s => body.includes(s))) {
      await sleep(2000);
      console.log('reply ready (signal)');
      break;
    }

    if (body.length > 500 && body === lastBody) {
      stable++;
      if (stable >= 4) {
        console.log('reply ready (stable)');
        break;
      }
    } else { stable = 0; }
    lastBody = body;
  }

  // 读取并裁剪回复
  const body = await chatPage.evaluate(() => document.body.innerText);
  const idx = body.lastIndexOf(Q.substring(0, Math.min(15, Q.length)));
  let reply = idx >= 0 ? body.substring(idx) : body.substring(Math.max(0, body.length - 8000));

  const footers = ['\n专家\n', '\n分享\n', '\n复制\n', '\n点赞\n', '\n快捷\n', '\nPPT 生成\n', '\nAI 表格\n', '\n图像生成\n', '\n帮我写作\n', '\n更多\n'];
  for (const foot of footers) {
    const pos = reply.lastIndexOf(foot);
    if (pos > 200) reply = reply.substring(0, pos);
  }

  console.log('=== REPLY ===');
  console.log(reply.substring(0, 10000));
  process.exit(0);
})();

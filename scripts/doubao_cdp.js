// doubao-bridge v3.3: CDP 直连豆包 — 完整上传检测链
const { chromium } = require('playwright');
const Q = process.argv[2] || '描述这张图';
const IMG = '/tmp/clipboard_img.png';
const fs = require('fs');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const pages = browser.contexts()[0].pages();
    let chatPage = pages.find(p => p.url().includes('doubao-chat/chat'));
    if (!chatPage) { console.log('NO_CHAT_PAGE'); process.exit(1); }

    if (!fs.existsSync(IMG)) {
        // 纯文本模式
        const ta = await chatPage.$('textarea[placeholder="发消息..."]');
        if (!ta) { console.log('NO_TEXTAREA'); process.exit(1); }
        await ta.click();
        await sleep(300);
        await ta.fill(Q);
        await sleep(300);
        await ta.press('Enter');
        console.log('📤 text-only sent');
    } else {
        // === 图片模式：完整上传链 ===

        // Step 1: 记录上传前状态
        const beforeImgCount = await chatPage.evaluate(() =>
            document.querySelectorAll('img').length
        );
        const beforeText = await chatPage.evaluate(() => document.body.innerText);

        // Step 2: 触发上传
        const fi = await chatPage.$('input[type="file"]');
        if (!fi) { console.log('NO_FILE_INPUT'); process.exit(1); }
        await fi.setInputFiles(IMG);
        console.log('🖼️ upload triggered, waiting for processing...');

        // Step 3: 等待图片出现在 DOM
        let appeared = false;
        for (let i = 0; i < 30; i++) {
            await sleep(1000);
            const nowCount = await chatPage.evaluate(() =>
                document.querySelectorAll('img').length
            );
            if (nowCount > beforeImgCount) {
                console.log('  ├─ image in DOM after ' + (i + 1) + 's');
                appeared = true;
                break;
            }
        }
        if (!appeared) { console.log('❌ image never in DOM'); process.exit(1); }

        // Step 4: 等待豆包侧图片处理完成（关键！）
        // 检测指标1：缩略图区域出现（图片被识别为附件）
        // 检测指标2：body 文字变化（豆包显示了图片描述或识别结果）
        console.log('  ├─ waiting for Doubao to process image...');
        let processed = false;
        let prevText = beforeText;
        for (let i = 0; i < 20; i++) {
            await sleep(1500);
            // 检查是否有图片预览区域（通常会有缩略图或文件图标）
            const hasPreview = await chatPage.evaluate(() => {
                // 查找图片预览相关的 DOM 标记
                const imgs = document.querySelectorAll('img[src^="data:"], img[src^="blob:"], img[src*="doubao"]');
                // 或查看输入区域是否有已附加的文件标记
                const fileIndicators = document.querySelectorAll('[class*="file"], [class*="upload"], [class*="attach"], [class*="preview"]');
                return { dataImgs: imgs.length, fileIndicators: fileIndicators.length };
            });
            const nowText = await chatPage.evaluate(() => document.body.innerText);

            if (hasPreview.dataImgs > 0 || hasPreview.fileIndicators > 0 || nowText.length > prevText.length + 50) {
                console.log('  ├─ Doubao processing done after ' + ((i + 1) * 1.5) + 's');
                console.log('  │  dataImgs=' + hasPreview.dataImgs + ' fileIndicators=' + hasPreview.fileIndicators);
                processed = true;
                break;
            }
            prevText = nowText;
        }
        if (!processed) {
            console.log('  ├─ no processing signal, waiting fallback 5s...');
            await sleep(5000);
        } else {
            // 额外等2秒确保完全稳定
            await sleep(2000);
        }

        // Step 5: 发送文字
        console.log('  └─ sending text now...');
        let ta;
        for (let i = 0; i < 5; i++) {
            ta = await chatPage.$('textarea[placeholder="发消息..."]');
            if (ta) break;
            await sleep(1000);
        }
        if (!ta) { console.log('NO_TEXTAREA'); process.exit(1); }
        await ta.click();
        await sleep(500);
        await ta.fill(Q);
        await sleep(500);
        await ta.press('Enter');
        console.log('📤 sent: ' + Q.substring(0, 80));
    }

    // === 等待回复 ===
    const SIGNALS = ['已完成思考', '深度思考', '思考已完成'];
    let lastBody = '';
    let stableCount = 0;

    for (let i = 0; i < 60; i++) {
        await sleep(2000);
        const body = await chatPage.evaluate(() => document.body.innerText);

        for (const sig of SIGNALS) {
            if (body.includes(sig)) {
                await sleep(2000);
                const finalBody = await chatPage.evaluate(() => document.body.innerText);
                const idx = finalBody.lastIndexOf(Q.substring(0, Math.min(15, Q.length)));
                let reply = idx >= 0 ? finalBody.substring(idx) : finalBody;
                for (const foot of ['\n专家\n', '\n分享\n', '\n复制\n', '\n点赞\n', '\n快捷\n', '\nPPT 生成\n', '\nAI 表格\n', '\n更多\n']) {
                    const pos = reply.lastIndexOf(foot);
                    if (pos > 200) { reply = reply.substring(0, pos); }
                }
                console.log('📩 REPLY:');
                console.log(reply.substring(0, 8000));
                process.exit(0);
            }
        }

        if (body === lastBody && body.length > 500) {
            stableCount++;
            if (stableCount >= 4) {
                const idx = body.lastIndexOf(Q.substring(0, Math.min(15, Q.length)));
                let reply = idx >= 0 ? body.substring(idx) : body;
                for (const foot of ['\n专家\n', '\n分享\n', '\n复制\n', '\n点赞\n', '\n快捷\n', '\nPPT 生成\n', '\nAI 表格\n', '\n更多\n']) {
                    const pos = reply.lastIndexOf(foot);
                    if (pos > 200) { reply = reply.substring(0, pos); }
                }
                console.log('📩 REPLY (stable):');
                console.log(reply.substring(0, 8000));
                process.exit(0);
            }
        } else { stableCount = 0; }
        lastBody = body;
    }

    console.log('TIMEOUT — last 3000 chars:');
    const body = await chatPage.evaluate(() => document.body.innerText);
    console.log(body.substring(Math.max(0, body.length - 3000)));
})();

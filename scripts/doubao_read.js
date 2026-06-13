const { chromium } = require('playwright');
const Q = process.argv[2] || '';

(async () => {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const pages = browser.contexts()[0].pages();
    const chatPage = pages.find(p => p.url().includes('doubao-chat/chat'));
    
    const body = await chatPage.evaluate(q => {
        const t = document.body.innerText;
        const idx = t.lastIndexOf(q);
        if (idx < 0) return 'NOT_FOUND:' + t.slice(-300);
        let r = t.substring(idx);
        const end = r.indexOf('\n专家\n');
        if (end > 0) r = r.substring(0, end);
        return r;
    }, Q);
    console.log(body.substring(0, 5000));
})();

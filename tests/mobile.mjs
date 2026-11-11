import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
const server = http.createServer(async (req, res) => {
    try {
        if (req.url === '/scripts/world-info.js') {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(`export const selected_world_info=['江河驿路'];export const world_info={};export async function loadWorldInfo(){return {entries:{1:{uid:1,comment:'驿路风物',content:'渡口、家书与旅人的行程。'}}};}`); return;
        }
        const relative = req.url.startsWith('/plugin/') ? `src/${req.url.slice(8)}` : 'tests/harness.html';
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
        res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
const report = { results: [], requests: 0, paidRequests: 0 };
try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    let round = 0;
    const tool = (id, name, args = {}) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    await page.route('https://api.deepseek.com/**', async route => {
        if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }); return; }
        const payload = route.request().postDataJSON();
        requests.push({ url: route.request().url(), payload });
        const reply = async data => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
        if (route.request().url().endsWith('/tools/search')) return reply({ results: [{ title: '驿路史料示例', url: 'https://example.org/archive', summary: '驿传的制度与旅途生活。' }] });
        if (route.request().url().endsWith('/tools/fetch')) return reply({ title: '驿路史料示例', content: '这是一段用于测试的网页正文。' });
        const last = payload.messages.at(-1).content || '';
        const lastUser = payload.messages.filter(m => m.role === 'user').at(-1)?.content || '';
        if (lastUser.includes('请停止测试')) { await new Promise(resolve => setTimeout(resolve, 1800)); try { await reply({ choices: [{ message: { role: 'assistant', content: '不应出现的停止后回答' } }] }); } catch {} return; }
        let message;
        if (last.includes('请更新交接摘要')) message = { role: 'assistant', content: '已确认：保持人物克制。未定：是否安排渡口重逢。待查：旅途耗时。' };
        else if (!payload.tools) message = { role: 'assistant', content: '连接正常。' };
        else if (++round === 1) message = { role: 'assistant', content: '', tool_calls: [tool('a', 'story_overview'), tool('b', 'story_search', { query: '旧约' })] };
        else if (round === 2) message = { role: 'assistant', content: '', tool_calls: [tool('c', 'lore_search', { query: '渡口' }), tool('d', 'web_search', { query: '古代 驿传 行程' })] };
        else if (round === 3) message = { role: 'assistant', content: '', tool_calls: [tool('e', 'web_fetch', { url: 'https://example.org/archive' })] };
        else message = { role: 'assistant', content: '她的犹豫可以通过一个很小的动作表现：拿出旧信，又重新收好。先保留未兑现的约定，让重逢拥有分量。\n\n资料仅作背景参考，旅途耗时仍需结合架空设定判断。来源：https://example.org/archive\n\n```text\n请延续渡口场景，以人物的细微动作表现她对旧约的犹豫；先铺垫，不急于和解。\n```\n\n<img src=x onerror="window.injected=true">' };
        return reply({ choices: [{ message, finish_reason: 'stop' }] });
    });
    await page.goto(url);
    await page.locator('#sw-launch').click();
    await page.locator('#sw-tab-settings').click();
    await page.locator('#sw-key').fill('dummy-mobile-test-key');
    await page.locator('#sw-background').fill('手机验收身份指令：先理解人物，再讨论情节。');
    await page.locator('#sw-notes').fill('只属于故事 A 的补充资料');
    await page.locator('#sw-save').click();
    await page.locator('#sw-settings-result').filter({ hasText: '已保存' }).waitFor();
    await page.locator('#sw-tab-chat').click();
    await page.locator('#sw-input').fill('请查阅历史并检索史料，讨论渡口重逢的提示词。');
    await page.locator('#sw-send').click();
    await page.getByRole('button', { name: '复制提示词块', exact: true }).waitFor();
    assert.equal(await page.locator('#sw-root img').count(), 0, '模型 HTML 不应执行');
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await page.getByRole('button', { name: '复制提示词块', exact: true }).click();
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes('请延续渡口场景'));
    assert.equal(await page.locator('#main-input').inputValue(), '主故事原输入');
    assert.deepEqual(await page.evaluate(() => window.__mainState), { preset: '主故事原预设', history: ['主故事原消息'], world: '原世界书' });
    assert.deepEqual(await page.evaluate(() => window.__hostReads), ['A']);
    for (const request of requests.filter(r => r.url.endsWith('/chat/completions'))) assert.ok(request.payload.messages[0].content.includes('手机验收身份指令'));
    report.results.push('手机端完整工具循环、复制提示词、HTML 文本安全、主故事隔离通过');

    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
        await page.waitForTimeout(100);
        const geometry = await page.locator('.sw-panel').evaluate(e => ({ rect: e.getBoundingClientRect().toJSON(), overflow: e.scrollWidth > e.clientWidth }));
        assert.ok(geometry.rect.x >= -1 && geometry.rect.right <= width + 1, `面板超出 ${width}px 宽度`);
        assert.equal(geometry.overflow, false);
        await page.locator('#sw-tab-settings').click();
        await page.locator('#sw-save').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#sw-form').evaluate(e => e.scrollWidth > e.clientWidth), false);
        await page.locator('#sw-tab-chat').click();
        await page.screenshot({ path: path.join(root, `artifacts/mobile-${width}.png`), fullPage: true });
    }
    report.results.push('320 / 390 / 768 像素布局与长设置表单无横向溢出');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#sw-input').focus();
    await page.setViewportSize({ width: 390, height: 430 });
    await page.waitForTimeout(100);
    const sendRect = await page.locator('#sw-send').boundingBox();
    assert.ok(sendRect.y + sendRect.height <= 430);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sw-input');
    await page.screenshot({ path: path.join(root, 'artifacts/mobile-keyboard.png') });
    report.results.push('键盘占位后 430px 内容高度下，输入焦点保留且发送按钮可见');

    await page.locator('#sw-input').fill('请停止测试'); await page.locator('#sw-send').click();
    await page.locator('#sw-stop').waitFor(); await page.locator('#sw-stop').click();
    await page.locator('#sw-send:not([disabled])').waitFor();
    assert.ok((await page.locator('#sw-status').textContent()).includes('停止'));
    report.results.push('停止请求与再次发送状态恢复通过');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#sw-tab-sessions').click();
    await page.locator('#sw-handoff').click();
    await page.locator('.sw-notice summary').filter({ hasText: '接续摘要' }).waitFor();
    assert.ok((await page.locator('#sw-binding').textContent()).includes('A'));
    await page.locator('#sw-tab-settings').click(); assert.equal(await page.locator('#sw-notes').inputValue(), '只属于故事 A 的补充资料');
    await page.evaluate(() => { window.__currentStory = 'B'; });
    await page.locator('#sw-tab-sessions').click(); await page.locator('#sw-new').click();
    await page.locator('#sw-binding').filter({ hasText: 'B' }).waitFor();
    await page.locator('#sw-tab-settings').click(); assert.equal(await page.locator('#sw-notes').inputValue(), '');
    const stored = await page.evaluate(() => ({ settings: JSON.parse(localStorage.getItem('story-workshop:settings')), credentials: localStorage.getItem('story-workshop:credentials') }));
    assert.equal(stored.settings.apiKey, undefined); assert.equal(stored.credentials, '{}');
    await page.reload(); await page.locator('#sw-launch').click();
    assert.ok((await page.locator('#sw-binding').textContent()).includes('B'));
    await page.locator('#sw-tab-settings').click(); assert.equal(await page.locator('#sw-key').inputValue(), '');
    report.results.push('同故事接续、新故事隔离、会话重载持久化、默认不保存密钥通过');
    assert.deepEqual(errors, []);
    report.requests = requests.length;
    report.results.push('无页面 JavaScript 异常；全部模型与搜索为模拟响应，未使用付费 API');
    await fs.writeFile(path.join(root, 'artifacts/mobile-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}

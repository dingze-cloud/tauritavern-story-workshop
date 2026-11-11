// Real Android integration test. Requires an isolated Android emulator running
// the official TauriTavern app, the installed plugin and a configured soft IME.
// Uses native ADB touches and screenshots; no browser mock or injected typing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const serial = process.env.ANDROID_SERIAL || 'emulator-5560';
const adbPath = process.env.ADB_PATH || 'adb';
const out = path.resolve(process.env.ANDROID_IME_OUT || 'artifacts/android-ime');
const label = process.env.ANDROID_IME_LABEL || 'current';
const layout = process.env.ANDROID_IME_LAYOUT || 'qwerty';
const mode = process.env.ANDROID_IME_MODE || 'floating';
const selector = process.env.ANDROID_IME_SELECTOR || '#sw-input';
if (!['#sw-input', '#sw-background', '#sw-notes'].includes(selector)) throw new Error('Only assistant draft/background/note textareas are accepted');
const actionSelector = selector === '#sw-input' ? '#sw-send' : '#sw-save';
const adb = args => execFileSync(adbPath, ['-s', serial, ...args], { windowsHide: true, timeout: 30000 });
if (!serial.startsWith('emulator-') || !adb(['shell', 'getprop', 'ro.boot.qemu.avd_name']).toString().trim().startsWith('storyworkshop_')) throw new Error('Use an isolated storyworkshop_ test AVD; real phones are not accepted.');
await fs.mkdir(out, { recursive: true });
const pid = adb(['shell', 'pidof', 'com.tauritavern.client']).toString().trim().split(/\s+/)[0];
assert.ok(pid, 'Start the official TauriTavern Android app first');
adb(['forward', 'tcp:9223', `localabstract:webview_devtools_remote_${pid}`]);
const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = targets.find(t => t.type === 'page'); assert.ok(target, 'WebView debugging target is required');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return; pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
});
const command = (method, params) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
    const start = Date.now();
    while (Date.now() - start < 15000) { if (await check()) return; await delay(150); }
    throw new Error(`Timed out: ${description}`);
}
function nativeIme() {
    const input = adb(['shell', 'dumpsys', 'input_method']).toString();
    const windows = adb(['shell', 'dumpsys', 'window']).toString();
    const line = windows.split('\n').find(l => /InsetsSource .*type=ime .*visible=true/.test(l));
    const frame = line?.match(/frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    const windowLines = adb(['shell', 'dumpsys', 'window', 'windows']).toString().split('\n');
    const start = windowLines.findIndex(l => /Window #.* u0 InputMethod}/.test(l));
    const end = start < 0 ? -1 : windowLines.findIndex((l, i) => i > start && /Window #/.test(l));
    const block = start < 0 ? '' : windowLines.slice(start, end < 0 ? undefined : end).join('\n');
    const drawn = /mDrawState=HAS_DRAWN/.test(block) && /shown=true/.test(block) && /isReadyForDisplay\(\)=true/.test(block);
    return { shown: /mInputShown=true/.test(input), drawn, top: frame ? Number(frame[2]) : null, width: frame ? Number(frame[3]) - Number(frame[1]) : null, bottom: frame ? Number(frame[4]) : null, source: line?.trim() ?? null };
}
const snapshot = () => evaluate(`(()=>{const box=e=>e?e.getBoundingClientRect().toJSON():null;const panel=document.querySelector('.sw-panel'),input=document.querySelector(${JSON.stringify(selector)});return {active:document.activeElement?.id,text:input?.value,selection:input?.selectionStart,dpr:devicePixelRatio,inner:[innerWidth,innerHeight],panel:box(panel),input:box(input),send:box(document.querySelector(${JSON.stringify(actionSelector)})),tabsVisible:!!document.querySelector('.sw-tabs')?.getClientRects().length,keyboardState:document.querySelector('#sw-root')?.dataset.keyboard,imeCss:panel?getComputedStyle(panel).getPropertyValue('--tt-ime-bottom'):null};})()`);
async function tap(selector) {
    const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:Math.round((r.x+r.width/2)*devicePixelRatio),y:Math.round((r.y+r.height/2)*devicePixelRatio),width:r.width,height:r.height};})()`);
    assert.ok(p.width > 0 && p.height > 0, `Visible control required: ${selector}`);
    adb(['shell', 'input', 'tap', String(p.x), String(p.y)]);
}
const report = { label, serial, layout, mode, fieldSelector: selector, actionSelector, android: adb(['shell', 'getprop', 'ro.build.version.release']).toString().trim(), actualInput: true, browserMock: false, phases: [] };
async function capture(name) {
    const value = { name, dom: await snapshot(), native: nativeIme() };
    report.phases.push(value);
    await fs.writeFile(path.join(out, `${name}.png`), adb(['exec-out', 'screencap', '-p']));
    return value;
}
try {
    await evaluate(`(()=>{window.__storyImeComposing=false;const e=document.querySelector(${JSON.stringify(selector)});e.addEventListener('compositionstart',()=>{window.__storyImeComposing=true});e.addEventListener('compositionend',()=>{window.__storyImeComposing=false});})()`);
    if (nativeIme().shown) { adb(['shell', 'input', 'keyevent', '4']); await until(() => !nativeIme().shown, 'initial IME dismissal'); }
    await evaluate(`document.activeElement?.blur()`);
    if (!await evaluate(`!!document.querySelector('.sw-panel')&&!document.querySelector('.sw-panel').hidden`)) { await tap('#sw-launch'); await until(() => evaluate(`!!document.querySelector('.sw-panel')&&!document.querySelector('.sw-panel').hidden`), 'plugin opening'); }
    report.pluginVersion = await evaluate(`fetch('/scripts/extensions/third-party/story-workshop/manifest.json').then(r=>r.json()).then(m=>m.version)`);
    if (process.env.ANDROID_IME_EXPECT_VERSION) assert.equal(report.pluginVersion, process.env.ANDROID_IME_EXPECT_VERSION);
    const expanded = await evaluate(`document.querySelector('.sw-panel').getAttribute('aria-modal')==='true'`);
    if ((mode === 'expanded') !== expanded) { await tap('#sw-size'); await delay(200); }
    await tap(selector === '#sw-input' ? '#sw-tab-chat' : '#sw-tab-settings');
    if (selector !== '#sw-input') await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
    if (mode === 'dragged') {
        const p = await evaluate(`(()=>{const r=document.querySelector('#sw-grip').getBoundingClientRect();return {x:Math.round((r.x+30)*devicePixelRatio),y:Math.round((r.y+15)*devicePixelRatio),endY:Math.round((r.y+255)*devicePixelRatio)}})()`);
        adb(['shell', 'input', 'swipe', String(p.x), String(p.y), String(p.x), String(p.endY), '450']); await delay(200);
    }
    await delay(200);
    const baseline = await capture('baseline'); assert.equal(baseline.dom.tabsVisible, true);
    if (mode === 'dragged') assert.ok(baseline.dom.panel.y > 150, 'Native title drag must actually move the window before testing keyboard overlap');
    for (let cycle = 1; cycle <= 2; cycle++) {
        await tap(selector);
        await until(() => { const ime = nativeIme(); return ime.shown && ime.drawn && ime.top !== null; }, 'native IME actually drawn');
        await until(async () => parseFloat((await snapshot()).imeCss) > 80, 'real host IME propagation');
        await delay(250);
        const opened = await capture(`cycle-${cycle}-open`);
        assert.equal(opened.dom.active, selector.slice(1));
        for (const field of ['input', 'send']) assert.ok(opened.dom[field].bottom * opened.dom.dpr < opened.native.top + 3, `${field} is covered by the actual Android IME`);
        if (baseline.dom.panel.bottom * opened.dom.dpr < opened.native.top) {
            assert.ok(Math.abs(opened.dom.panel.y - baseline.dom.panel.y) < 3, 'A floating window already above the keyboard should not jump on focus');
            assert.ok(Math.abs(opened.dom.panel.height - baseline.dom.panel.height) < 3, 'Do not shrink an already-unobscured window');
        }
        const { top, bottom, width } = opened.native, h = bottom - top;
        if (layout === '36key') assert.ok(h > width * 0.83, 'The extra number row must actually increase keyboard height');
        const keys = layout === '9key' ? [[0.5, 0.24], [0.5, 0.41]] : [[0.6, 0.41], [0.25, 0.24], [0.9, 0.41]];
        if (layout === '36key') {
            // The optional number row is added above QWERTY; these native row
            // centers remain the same distance from the bottom on the lab AVD.
            for (const [x, offset] of [[0.6, 0.456], [0.25, 0.589], [0.9, 0.456]]) adb(['shell', 'input', 'tap', String(Math.round(width * x)), String(Math.round(bottom - width * offset))]);
        } else for (const [x, y] of keys) adb(['shell', 'input', 'tap', String(Math.round(width * x)), String(Math.round(top + h * y))]);
        adb(['shell', 'input', 'tap', String(Math.round(width * 0.55)), String(Math.round(layout === '36key' ? bottom - width * 0.199 : top + h * 0.74))]);
        await until(() => evaluate(`!window.__storyImeComposing&&document.querySelector(${JSON.stringify(selector)}).value!==${JSON.stringify(opened.dom.text)}`), 'real IME candidate commit');
        const typed = await capture(`cycle-${cycle}-typed`);
        assert.equal(typed.dom.active, selector.slice(1)); assert.notEqual(typed.dom.text, opened.dom.text, 'Native soft keys must reach the textarea');
        adb(['shell', 'input', 'keyevent', '4']);
        await until(() => !nativeIme().shown, 'native keyboard close');
        await until(async () => parseFloat((await snapshot()).imeCss) < 1, 'native IME inset clearing');
        await delay(200);
        const closed = await capture(`cycle-${cycle}-closed`);
        // Android deliberately retains textarea focus when Back hides the IME.
        assert.equal(closed.dom.tabsVisible, true, 'Keyboard is closed but navigation remains hidden: focus is not IME visibility');
        assert.ok(Math.abs(closed.dom.panel.y - baseline.dom.panel.y) < 3, 'Window must restore after IME closes, even with retained focus');
        assert.ok(Math.abs(closed.dom.panel.height - baseline.dom.panel.height) < 3, 'Window height must restore after IME closes');
        assert.equal(closed.dom.text, typed.dom.text, 'Composition/draft must survive dismissal');
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1;
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); socket.close();
    console.log(JSON.stringify({ status: report.status, label, layout, phases: report.phases.length, error: report.error, evidence: out }, null, 2));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleViewport, floatingGeometry } from '../src/viewport.js';

const full = { left: 0, top: 0, width: 390, height: 844 };
test('安卓 2.3 覆盖式 IME：布局视口不缩小，只消费浮窗本地键盘 inset', () => {
    const viewport = visibleViewport({ width: 390, height: 844, visual: full, snapshot: { viewport: full, safeFrame: full }, css: { imeBottom: 440, baseHeight: 844 } });
    assert.equal(viewport.bottom, 404);
    const panel = floatingGeometry(viewport, { editing: true });
    assert.ok(panel.top + panel.height <= 394);
});
test('宿主快照滞后时仍消费浏览器视口变化', () => {
    const viewport = visibleViewport({ width: 390, height: 430, visual: { ...full, height: 430 }, snapshot: { viewport: full } });
    assert.equal(viewport.height, 430);
    assert.ok(floatingGeometry(viewport, { editing: true }).height <= 410);
});
test('同时收到视口缩小和旧版 IME inset，不重复扣除键盘', () => {
    const viewport = visibleViewport({ width: 390, height: 404, visual: { ...full, height: 404 }, snapshot: { viewport: full, ime: { bottom: 440 } }, css: { imeBottom: 440, baseHeight: 844 } });
    assert.equal(viewport.bottom, 404);
});
test('默认小悬浮窗给主故事留出空间，展开为用户可选', () => {
    const viewport = visibleViewport({ width: 390, height: 844, visual: full });
    const small = floatingGeometry(viewport), expanded = floatingGeometry(viewport, { expanded: true });
    assert.ok(small.height < viewport.height * 0.6); assert.ok(small.width <= 360);
    assert.ok(expanded.height > small.height);
});
test('拖动和旋转后仍在可见范围，安全区只消费一次', () => {
    const viewport = visibleViewport({ width: 844, height: 390, visual: { width: 844, height: 390 }, snapshot: { safeFrame: { left: 24, top: 20, width: 796, height: 350 }, safeInsets: { top: 20, left: 24, right: 24, bottom: 20 } } });
    assert.equal(viewport.top, 20); assert.equal(viewport.left, 24);
    const panel = floatingGeometry(viewport, { position: { left: 5000, top: -1000 } });
    assert.ok(panel.left + panel.width <= viewport.right); assert.ok(panel.top >= viewport.top);
});
test('VirtualKeyboard 几何可直接约束底部，支持不同键盘高度', () => {
    for (const top of [350, 420, 500]) {
        const viewport = visibleViewport({ width: 390, height: 844, visual: full, keyboard: { top, height: 844 - top } });
        assert.equal(viewport.bottom, top);
    }
});
test('实际键盘开合：未被遮挡的小窗保持原尺寸位置，不随焦点缩小或重排', () => {
    const initial = visibleViewport({ width: 393, height: 851 });
    const opened = visibleViewport({ width: 393, height: 851, css: { baseHeight: 851, imeBottom: 303 } });
    const before = floatingGeometry(initial, { referenceHeight: 851 });
    const during = floatingGeometry(opened, { referenceHeight: 851 });
    const after = floatingGeometry(initial, { referenceHeight: 851 });
    assert.deepEqual(during, before); assert.deepEqual(after, before);
});
test('低位拖动小窗在键盘打开时夹取到可见区域，关闭后恢复用户位置', () => {
    const initial = visibleViewport({ width: 393, height: 851 });
    const opened = visibleViewport({ width: 393, height: 851, css: { baseHeight: 851, imeBottom: 303 } });
    const options = { position: { left: 23, top: 296 }, referenceHeight: 851 };
    const during = floatingGeometry(opened, options), after = floatingGeometry(initial, options);
    assert.equal(during.height, 430); assert.ok(during.top + during.height <= opened.bottom);
    assert.equal(after.top, 296); assert.equal(after.height, 430);
});

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), value));
function rect(value) {
    if (!value || !(number(value.width) > 0) || !(number(value.height) > 0)) return null;
    const left = number(value.left ?? value.x), top = number(value.top ?? value.y);
    return { left, top, right: left + number(value.width), bottom: top + number(value.height) };
}

// v2.3 uses a surface-local IME inset; newer hosts resize the content viewport.
// Intersect these facts instead of preferring one source or subtracting IME twice.
export function visibleViewport({ width, height, visual, snapshot, css = {}, keyboard } = {}) {
    const windowRect = rect({ width, height }) ?? { left: 0, top: 0, right: 390, bottom: 844 };
    const sources = [windowRect, rect(visual), rect(snapshot?.viewport), rect(snapshot?.safeFrame)].filter(Boolean);
    let left = Math.max(...sources.map(r => r.left)), top = Math.max(...sources.map(r => r.top));
    let right = Math.min(...sources.map(r => r.right)), bottom = Math.min(...sources.map(r => r.bottom));
    if (!snapshot?.safeFrame) {
        const insets = snapshot?.safeInsets ?? css;
        left = Math.max(left, windowRect.left + number(insets.left));
        top = Math.max(top, windowRect.top + number(insets.top));
        right = Math.min(right, windowRect.right - number(insets.right));
        bottom = Math.min(bottom, windowRect.bottom - number(insets.bottom));
    }
    const ime = Math.max(0, number(css.imeBottom), number(css.viewportBottomInset), number(snapshot?.ime?.viewportBottomInset), number(snapshot?.ime?.bottom));
    const baseBottom = Math.max(windowRect.bottom, number(css.baseHeight), rect(snapshot?.viewport)?.bottom ?? 0);
    if (ime > 0) bottom = Math.min(bottom, baseBottom - ime);
    if (number(keyboard?.height) > 0 && number(keyboard?.top) > top) bottom = Math.min(bottom, number(keyboard.top));
    right = Math.max(left + 120, right); bottom = Math.max(top + 120, bottom);
    return { left, top, right, bottom, width: right - left, height: bottom - top, ime, keyboardOffset: Math.max(0, ime - number(snapshot?.safeInsets?.bottom ?? css.bottom)) };
}

export function floatingGeometry(viewport, { expanded = false, position = null, editing = false } = {}) {
    const margin = 10;
    const availableWidth = Math.max(120, viewport.width - margin * 2);
    const availableHeight = Math.max(120, viewport.height - margin * 2);
    const width = expanded ? Math.min(800, availableWidth) : Math.min(360, availableWidth);
    const height = expanded ? availableHeight : Math.min(430, Math.max(260, viewport.height * 0.52), availableHeight);
    const defaultLeft = expanded ? viewport.left + (viewport.width - width) / 2 : viewport.right - width - margin;
    const defaultTop = editing ? viewport.top + margin : viewport.top + Math.min(56, viewport.height * 0.09);
    return {
        left: clamp(position?.left ?? defaultLeft, viewport.left + margin, viewport.right - width - margin),
        top: clamp(editing ? Math.min(position?.top ?? defaultTop, defaultTop) : (position?.top ?? defaultTop), viewport.top + margin, viewport.bottom - height - margin),
        width, height,
    };
}

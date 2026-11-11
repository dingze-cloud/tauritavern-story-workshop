import { Assistant, Repository, DEFAULT_SETTINGS, settingsFrom } from './core.js';

const TOOL_LABELS = { story_overview: '了解故事概览', character_read: '阅读角色完整设定', story_search: '检索故事历史', story_read: '阅读故事原文', lore_search: '查阅世界书目录', lore_read: '阅读世界书', discussion_search: '检索旧讨论', web_search: '搜索网络资料', web_fetch: '读取网页正文' };
const $ = (root, selector) => root.querySelector(selector);
const element = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
const button = (text, action, className = '') => { const b = element('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b; };

export async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* 旧 WebView 复制降级 */ }
    const field = document.createElement('textarea');
    field.value = text; field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
    document.body.append(field); field.focus(); field.select(); field.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); field.remove();
    if (!ok) throw new Error('自动复制不可用，请长按文本选择并复制。');
}
function appendLinkedText(container, value) {
    const text = String(value ?? '');
    let previous = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"\]\)）。，]+/g)) {
        container.append(document.createTextNode(text.slice(previous, match.index)));
        const link = element('a', '', match[0]); link.href = match[0]; link.target = '_blank'; link.rel = 'noopener noreferrer';
        container.append(link); previous = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(previous)));
}

export async function mountAssistant(host) {
    const repo = await new Repository(host.api.extension.store).initialize();
    const assistant = new Assistant({ host, repository: repo });
    let settings = settingsFrom(await repo.get('settings', DEFAULT_SETTINGS));
    const secrets = settings.rememberKey ? await repo.get('credentials', {}) : {};
    let apiKey = secrets.apiKey ?? '', searchKey = secrets.searchKey ?? '';
    let session = repo.index.activeId ? await repo.load(repo.index.activeId) : null;
    let busy = false, controller = null, lastFocus = null, handoffPending = false;
    let viewportUnsubscribe = null;
    const root = element('div'); root.id = 'sw-root';
    root.innerHTML = `
      <button type="button" class="sw-fab" id="sw-launch" aria-label="打开故事研讨助手">✦ 故事助手</button>
      <div class="sw-backdrop" hidden></div>
      <section class="sw-panel" hidden role="dialog" aria-modal="true" aria-label="故事研讨助手">
        <header class="sw-head">
          <div class="sw-row sw-between"><div><div class="sw-eyebrow">STORY WORKSHOP</div><div class="sw-title">故事研讨助手</div></div><button type="button" id="sw-close" class="sw-icon" aria-label="关闭助手面板">✕</button></div>
          <div class="sw-binding" id="sw-binding">未关联主故事</div>
          <nav class="sw-tabs" role="tablist" aria-label="助手页面"><button type="button" role="tab" id="sw-tab-chat" aria-selected="true" aria-controls="sw-chat">讨论</button><button type="button" role="tab" id="sw-tab-sessions" aria-selected="false" aria-controls="sw-sessions">会话</button><button type="button" role="tab" id="sw-tab-settings" aria-selected="false" aria-controls="sw-settings">设置</button></nav>
        </header>
        <div class="sw-body" id="sw-chat" role="tabpanel" aria-labelledby="sw-tab-chat">
          <div class="sw-scroll" id="sw-messages" aria-label="助手讨论记录"></div>
          <div class="sw-compose"><div id="sw-status" class="sw-status" role="status" aria-live="polite">独立讨论 · 提示词由你手动复制到主故事</div><textarea id="sw-input" rows="2" aria-label="与助手讨论" placeholder="说说你的想法，或者让助手先了解当前故事…"></textarea><div class="sw-row sw-actions"><span class="sw-small" id="sw-context">只读故事资料，不影响主故事编排</span><div class="sw-row"><button type="button" id="sw-stop" hidden>停止</button><button type="button" id="sw-send" class="sw-primary">发送</button></div></div></div>
        </div>
        <div class="sw-body" id="sw-sessions" role="tabpanel" aria-labelledby="sw-tab-sessions" hidden><div class="sw-scroll"><div class="sw-section">开启新的讨论</div><p class="sw-small">新会话默认关联当前打开的主故事。旧会话继续保留。</p><div class="sw-row"><button type="button" id="sw-new" class="sw-primary">空白新会话</button><button type="button" id="sw-handoff">整理并接续</button></div><p class="sw-small">接续会查阅当前助手讨论，生成交接摘要。跨故事新建时不带入旧故事资料。</p><div class="sw-section">已有会话</div><div id="sw-session-list"></div></div></div>
        <div class="sw-body" id="sw-settings" role="tabpanel" aria-labelledby="sw-tab-settings" hidden><form class="sw-scroll sw-form" id="sw-form">
          <div class="sw-notice sw-small">助手设置独立保存，不修改主故事预设。首次使用请填写 API 密钥。</div>
          <label>模型 API 地址<input id="sw-base" type="url" inputmode="url" autocomplete="off" spellcheck="false" required></label>
          <label>模型名称<input id="sw-model" type="text" autocomplete="off" spellcheck="false" required><span class="sw-small">默认 deepseek-flash；可改为账号可用的模型名称。</span></label>
          <label>模型 API 密钥<input id="sw-key" type="password" autocomplete="off" spellcheck="false" placeholder="填写 DeepSeek API Key"></label>
          <label class="sw-check"><input id="sw-remember" type="checkbox">记住密钥（保存在本机插件数据中）</label>
          <div class="sw-section">助手身份与背景提示词</div>
          <label for="sw-background" class="sw-small">填写助手职责、创作背景与需要说明的语境。每次模型请求均完整包含，包括工具续轮。</label><textarea id="sw-background" spellcheck="false" aria-label="助手身份与背景提示词"></textarea>
          <div class="sw-section">本故事补充资料</div>
          <label for="sw-notes" class="sw-small">填写主线、人物经历或未写进世界书的资料。仅用于当前助手会话；同故事接续时继承。</label><textarea id="sw-notes" spellcheck="false" aria-label="本故事补充资料"></textarea>
          <button type="button" id="sw-bind">关联当前主故事（开启新会话）</button>
          <div class="sw-section">联网检索</div>
          <label class="sw-check"><input id="sw-search" type="checkbox">允许助手按需搜索和读取网页</label>
          <label>搜索 API 地址<input id="sw-search-base" type="url" inputmode="url" autocomplete="off" spellcheck="false"><span class="sw-small">DeepSeek 官方 Search / Fetch，单独计费。</span></label>
          <label>搜索 API 密钥（可留空）<input id="sw-search-key" type="password" autocomplete="off" spellcheck="false" placeholder="留空时使用模型密钥"></label>
          <div class="sw-section">长对话</div>
          <label>上下文字符预算<input id="sw-budget" type="number" min="12000" max="240000" step="1000"><span class="sw-small">这是字符预算，不是模型 token 数。超出后完整保留最近讨论轮次，旧讨论仍可检索。需要完整接续时使用“整理并接续”。</span></label>
          <label>每次最大输出 token<input id="sw-tokens" type="number" min="512" max="16384" step="512"></label>
          <div id="sw-settings-result" class="sw-small" role="status"></div><div class="sw-row sw-stick"><button type="submit" class="sw-primary" id="sw-save">保存设置</button><button type="button" id="sw-test">测试模型连接</button></div>
        </form></div>
      </section>`;
    document.body.append(root);
    const status = text => { $(root, '#sw-status').textContent = text; };
    const result = text => { $(root, '#sw-settings-result').textContent = text; };
    const panel = $(root, '.sw-panel');
    const input = $(root, '#sw-input');
    const messages = $(root, '#sw-messages');
    const guarded = fn => async () => { try { await fn(); } catch (error) { status(error.message); result(error.message); } };

    function updateGeometry(snapshot) {
        const vv = window.visualViewport;
        const v = snapshot?.viewport ?? { left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0, width: vv?.width ?? innerWidth, height: vv?.height ?? innerHeight };
        root.style.setProperty('--sw-left', `${v.left}px`); root.style.setProperty('--sw-top', `${v.top}px`);
        root.style.setProperty('--sw-width', `${v.width}px`); root.style.setProperty('--sw-height', `${v.height}px`);
    }
    updateGeometry(host.api.layout?.snapshot?.());
    if (host.api.layout?.subscribe) viewportUnsubscribe = await host.api.layout.subscribe(updateGeometry);
    else {
        window.visualViewport?.addEventListener('resize', () => updateGeometry());
        window.visualViewport?.addEventListener('scroll', () => updateGeometry());
        window.addEventListener('resize', () => updateGeometry());
    }
    function tab(name) {
        for (const candidate of ['chat', 'sessions', 'settings']) {
            $(root, `#sw-${candidate}`).hidden = candidate !== name;
            $(root, `#sw-tab-${candidate}`).setAttribute('aria-selected', String(candidate === name));
        }
        if (name === 'sessions') renderSessions();
        if (name === 'settings') fillSettings();
    }
    function setBusy(value) {
        busy = value;
        for (const id of ['sw-send', 'sw-new', 'sw-handoff', 'sw-bind', 'sw-save', 'sw-test']) $(root, `#${id}`).disabled = value;
        $(root, '#sw-stop').hidden = !value;
        input.readOnly = value;
        if (!value) controller = null;
        renderSessions();
    }
    function renderSessions() {
        const list = $(root, '#sw-session-list'); list.replaceChildren();
        for (const meta of repo.index.sessions) {
            const row = element('div', 'sw-session');
            const open = button('', guarded(async () => {
                if (busy) return;
                session = await repo.load(meta.id);
                if (!session) throw new Error('会话数据缺失。');
                repo.index.activeId = meta.id; await repo.put('index', repo.index);
                render(); tab('chat'); status('已切换助手会话，仍绑定原来的故事。');
            }), 'sw-session-open');
            open.append(element('div', '', meta.title), element('div', 'sw-small', meta.bindingTitle));
            open.setAttribute('aria-current', String(meta.id === session?.id)); open.disabled = busy;
            const remove = button('删除', guarded(async () => {
                if (busy || !window.confirm(`删除助手会话“${meta.title}”？主故事不会改变。`)) return;
                await repo.remove(meta.id);
                if (session?.id === meta.id) session = repo.index.activeId ? await repo.load(repo.index.activeId) : null;
                render(); renderSessions();
            })); remove.disabled = busy;
            row.append(open, remove); list.append(row);
        }
        if (!repo.index.sessions.length) list.append(element('p', 'sw-small', '尚无讨论会话。'));
    }
    async function copied(text, b) {
        try { await copyText(text); const previous = b.textContent; b.textContent = '已复制'; setTimeout(() => { b.textContent = previous; }, 1500); }
        catch (error) { status(error.message); }
    }
    function bubble(role, text) {
        const article = element('article', `sw-message ${role === 'user' ? 'sw-user' : ''}`);
        article.append(element('div', 'sw-who', role === 'user' ? '你' : '研讨助手'));
        const body = element('div', 'sw-text'); appendLinkedText(body, text); article.append(body);
        if (role === 'assistant') {
            const all = button('复制全文', () => copied(text, all), 'sw-copy'); article.append(all);
            const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[1].trim()).filter(Boolean);
            if (blocks.length) { const prompt = button('复制提示词块', () => copied(blocks.join('\n\n'), prompt), 'sw-copy'); article.append(document.createTextNode(' '), prompt); }
        }
        return article;
    }
    function render(scroll = false) {
        $(root, '#sw-binding').textContent = session?.binding ? `只读关联：${session.binding.title}` : '未关联故事 · 可在设置中关联当前主故事';
        $(root, '#sw-binding').title = $(root, '#sw-binding').textContent;
        messages.replaceChildren();
        if (!session?.turns.length) {
            const welcome = element('div', 'sw-welcome');
            welcome.append(element('div', 'sw-eyebrow', '先理解，再一起构思'), element('h2', '', '把还没成形的想法，慢慢讲清楚。'), element('p', '', '助手可以查阅关联故事与世界书，也可以上网寻找让人物和场景更鲜活的资料。'), element('p', 'sw-small', '这里的讨论独立保存。选定提示词后，你再复制到主故事发送。'));
            const suggestions = element('div', 'sw-suggestions');
            for (const text of ['先了解当前故事，梳理人物经历和未解决的伏笔。', '我有一个想融入剧情的画面，先陪我讨论它。', '帮我查一些与当前故事背景有关的生活细节，并附来源。']) suggestions.append(button(text, () => { input.value = text; tab('chat'); input.focus(); }));
            welcome.append(suggestions); messages.append(welcome);
        }
        if (session?.memory) {
            const memory = element('details', 'sw-notice sw-small'); memory.append(element('summary', '', '接续摘要（展开查看）'), element('div', 'sw-text', session.memory)); messages.append(memory);
        }
        for (const turn of session?.turns ?? []) {
            messages.append(bubble('user', turn.user));
            if (turn.answer) messages.append(bubble('assistant', turn.answer));
            if (turn.status === 'running') messages.append(element('p', 'sw-small', '助手正在整理资料…'));
            if (turn.error) messages.append(element('p', 'sw-error', turn.error));
        }
        if (session?.sources?.length) {
            const sources = element('details', 'sw-sources'); sources.append(element('summary', '', `查阅来源 · ${session.sources.length}`));
            for (const source of session.sources) {
                if (!/^https?:\/\//i.test(source.url)) continue;
                const a = element('a', 'sw-source', source.title); a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; sources.append(a);
            }
            messages.append(sources);
        }
        if (scroll) requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
    }
    async function currentBinding() {
        try { return await host.bindCurrent(); }
        catch (error) { status(error.message); return null; }
    }
    async function ensureSession() {
        if (!session) session = await repo.create(await currentBinding());
        // 页面重启后不恢复或重放中断工具请求。
        for (const turn of session.turns) if (turn.status === 'running') { turn.status = 'stopped'; turn.error = '上次运行被中断，可重新讨论；不会重放工具请求。'; }
        return session;
    }
    function fillSettings() {
        $(root, '#sw-base').value = settings.baseUrl; $(root, '#sw-model').value = settings.model;
        $(root, '#sw-key').value = apiKey; $(root, '#sw-search-key').value = searchKey;
        $(root, '#sw-remember').checked = settings.rememberKey;
        $(root, '#sw-background').value = settings.background; $(root, '#sw-notes').value = session?.notes ?? '';
        $(root, '#sw-search').checked = settings.searchEnabled; $(root, '#sw-search-base').value = settings.searchBaseUrl;
        $(root, '#sw-budget').value = settings.contextBudget; $(root, '#sw-tokens').value = settings.maxTokens;
    }
    async function saveSettings() {
        await ensureSession();
        const next = settingsFrom({ ...settings,
            baseUrl: $(root, '#sw-base').value, model: $(root, '#sw-model').value,
            background: $(root, '#sw-background').value, searchBaseUrl: $(root, '#sw-search-base').value,
            searchEnabled: $(root, '#sw-search').checked, rememberKey: $(root, '#sw-remember').checked,
            contextBudget: $(root, '#sw-budget').value, maxTokens: $(root, '#sw-tokens').value, notes: '',
        });
        const nextKey = $(root, '#sw-key').value.trim(), nextSearchKey = $(root, '#sw-search-key').value.trim();
        await repo.put('credentials', next.rememberKey ? { apiKey: nextKey, searchKey: nextSearchKey } : {});
        await repo.put('settings', next);
        session.notes = $(root, '#sw-notes').value; await repo.saveSession(session);
        settings = next; apiKey = nextKey; searchKey = nextSearchKey;
        result('已保存。助手背景指令从下一次发送起生效；主故事预设保持独立。');
    }
    async function newSession(carry) {
        if (busy) return;
        setBusy(true); controller = new AbortController();
        try {
            const binding = await currentBinding();
            if (carry && session?.binding?.stableId !== binding?.stableId) {
                if (!window.confirm('当前打开的是另一个故事。将新建空白助手会话，不带入原故事的讨论与补充资料。')) return;
                carry = false;
            }
            let memory = '', notes = '';
            if (carry && session) {
                if (!apiKey) { tab('settings'); result('整理接续摘要需要先填写并保存模型 API 密钥。也可选择空白新会话。'); return; }
                handoffPending = true; tab('chat');
                memory = await assistant.handoff({ session, settings: { ...settings, notes: session.notes ?? '' }, apiKey, signal: controller.signal, onEvent: event => status(event.text) });
                notes = session.notes ?? '';
            }
            session = await repo.create(binding, memory); session.notes = notes; await repo.saveSession(session);
            render(true); tab('chat'); status(memory ? '已接续讨论，原会话仍保留可查。' : binding ? '新会话已建立，默认关联当前主故事。' : '新会话已建立，尚未关联主故事，可先补充资料。');
        } finally { handoffPending = false; setBusy(false); }
    }
    async function send() {
        if (busy || !input.value.trim()) return;
        if (!apiKey) { tab('settings'); result('请填写模型 API 密钥并保存，再开始讨论。'); return; }
        const text = input.value; input.value = '';
        controller = new AbortController(); setBusy(true);
        try {
            await ensureSession();
            await assistant.send({ session, text, settings: { ...settings, notes: session.notes ?? '' }, apiKey, searchKey, signal: controller.signal, onEvent: event => {
                if (event.type === 'status') status(event.text);
                if (event.type === 'tool') status(`正在${TOOL_LABELS[event.name] ?? event.name}…`);
                if (event.type === 'toolError') status(`${TOOL_LABELS[event.name] ?? event.name}未成功：${event.text}`);
                if (event.type === 'context') $(root, '#sw-context').textContent = event.omitted ? `保留最近 ${event.included} 轮 · 更早 ${event.omitted} 轮可检索` : '独立讨论 · 主故事只读';
                if (['turn', 'answer', 'error'].includes(event.type)) render(true);
            } });
            status('已完成。选定内容后，复制到主故事输入框再发送。');
        } catch (error) {
            status(controller?.signal.aborted ? '已停止。' : error.message);
            if (session?.turns.at(-1)?.user !== text) input.value = text;
            render();
        } finally { setBusy(false); }
    }
    async function open() {
        lastFocus = document.activeElement;
        $(root, '#sw-launch').disabled = true;
        try {
            await ensureSession(); render(); panel.hidden = false; $(root, '.sw-backdrop').hidden = false;
            $(root, '#sw-launch').hidden = true; $(root, '#sw-close').focus();
        } finally { $(root, '#sw-launch').disabled = false; }
    }
    function close() {
        panel.hidden = true; $(root, '.sw-backdrop').hidden = true; $(root, '#sw-launch').hidden = false;
        (lastFocus?.isConnected ? lastFocus : $(root, '#sw-launch')).focus();
    }
    $(root, '#sw-launch').addEventListener('click', guarded(open));
    $(root, '#sw-close').addEventListener('click', close);
    $(root, '.sw-backdrop').addEventListener('click', close);
    for (const name of ['chat', 'sessions', 'settings']) $(root, `#sw-tab-${name}`).addEventListener('click', () => tab(name));
    $(root, '#sw-send').addEventListener('click', guarded(send));
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); guarded(send)(); } });
    $(root, '#sw-stop').addEventListener('click', () => { controller?.abort(); status(handoffPending ? '已停止整理摘要。' : '正在停止…'); });
    $(root, '#sw-new').addEventListener('click', guarded(() => newSession(false)));
    $(root, '#sw-handoff').addEventListener('click', guarded(() => newSession(true)));
    $(root, '#sw-bind').addEventListener('click', guarded(() => newSession(false)));
    $(root, '#sw-form').addEventListener('submit', event => { event.preventDefault(); if (!busy) guarded(saveSettings)(); });
    $(root, '#sw-test').addEventListener('click', guarded(async () => {
        await saveSettings(); if (!apiKey) throw new Error('请先填写 API 密钥。');
        controller = new AbortController(); setBusy(true); result('正在测试模型连接…');
        try {
            await assistant.model({ ...settings, maxTokens: 512 }, apiKey, assistant.systemMessages(settings, session).concat({ role: 'user', content: '请只回复：连接正常。' }), [], controller.signal);
            result('模型连接正常。联网搜索将在实际需要时调用，使用搜索 API 密钥或模型密钥。');
        } finally { setBusy(false); }
    }));
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
            const focusable = [...panel.querySelectorAll('button, textarea, input, select, a[href], summary')].filter(e => !e.disabled && e.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    });
    if (session) { for (const turn of session.turns) if (turn.status === 'running') { turn.status = 'stopped'; turn.error = '上次运行被中断，可重新发送。'; } }
    fillSettings(); render();
    return { root, repo, assistant, open, close, dispose: async () => { controller?.abort(); await viewportUnsubscribe?.(); root.remove(); }, getSession: () => session };
}

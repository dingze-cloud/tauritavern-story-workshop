import { clip, clone } from './core.js';

const unique = items => [...new Set(items.filter(v => typeof v === 'string' && v.trim()))];
function sliceText(text, offset = 0, length = 12000) {
    text = String(text ?? '');
    return { text: text.slice(offset, offset + length), offset, totalCharacters: text.length, hasMore: offset + length < text.length };
}
export class TavernHost {
    constructor({ api, context, loadWorldInfo = null, loreContext = () => ({}) }) {
        this.api = api; this.context = context; this.loadWorldInfo = loadWorldInfo; this.loreContext = loreContext;
    }
    async bindCurrent() {
        if (!this.api.chat?.current?.ref) throw new Error('当前 TauriTavern 缺少官方聊天 API，请更新应用。');
        const ref = this.api.chat.current.ref();
        if (!ref || (ref.kind === 'character' && (!ref.characterId || !ref.fileName)) || (ref.kind === 'group' && !ref.chatId)) throw new Error('请先打开一个主故事聊天，再关联助手。');
        const handle = this.api.chat.open(ref);
        const stableId = await handle.stableId();
        const summary = await handle.summary({ includeMetadata: true });
        const ctx = this.context();
        let cards = [];
        if (ref.kind === 'group') {
            const group = (ctx.groups ?? []).find(g => String(g.id) === String(ref.chatId) || String(g.id) === String(ctx.groupId));
            const members = group?.members ?? [];
            cards = (ctx.characters ?? []).filter(c => members.includes(c.avatar));
        } else {
            const current = (ctx.characters ?? [])[ctx.characterId];
            const match = (ctx.characters ?? []).find(c => c.avatar === ref.characterId || c.avatar?.replace(/\.png$/i, '') === ref.characterId);
            if (match || current) cards = [match || current];
        }
        const lore = this.loreContext() ?? {};
        const metadata = summary?.chat_metadata ?? summary?.metadata ?? ctx.chatMetadata ?? {};
        const books = [...(lore.selected_world_info ?? []), ...(lore.world_info?.globalSelect ?? []), metadata.world_info];
        const characters = cards.map(c => {
            const data = c.data ?? c;
            const fileName = String(c.avatar ?? '').replace(/\.png$/i, '');
            books.push(data.extensions?.world);
            books.push(...(lore.world_info?.charLore?.find(x => x.name === fileName)?.extraBooks ?? []));
            return {
                name: data.name ?? c.name, avatar: c.avatar,
                description: data.description ?? c.description ?? '', personality: data.personality ?? c.personality ?? '',
                scenario: data.scenario ?? c.scenario ?? '', examples: data.mes_example ?? c.mes_example ?? '',
                creatorNotes: data.creator_notes ?? '', characterBook: clone(data.character_book ?? null),
            };
        });
        return {
            ref: clone(ref), stableId, title: ref.kind === 'group' ? `群聊 · ${ref.chatId}` : `${characters[0]?.name ?? ref.characterId} · ${ref.fileName}`,
            books: unique(books), characters, boundAt: Date.now(),
        };
    }
    async handle(binding) {
        if (!binding?.ref) throw new Error('此助手未关联主故事。可新建并关联当前故事，或先在设置里提供背景资料。');
        const handle = this.api.chat.open(binding.ref);
        if (await handle.stableId() !== binding.stableId) throw new Error('绑定故事的稳定身份已变化，可能被删除或替换。请重新关联，不读取其他故事。');
        return handle;
    }
    async overview(binding) {
        const handle = await this.handle(binding);
        const summary = await handle.summary();
        const page = await handle.history.tail({ limit: 8 });
        return {
            title: binding.title, summary: { messageCount: summary.message_count, preview: clip(summary.preview, 2000) },
            characters: binding.characters.map(c => ({ name: c.name, description: clip(c.description, 6000), personality: clip(c.personality, 4000), scenario: clip(c.scenario, 4000), creatorNotes: clip(c.creatorNotes, 2000) })),
            books: this.bookNames(binding),
            recentMessages: (page.messages ?? []).map((m, i) => ({ index: page.startIndex + i, name: m.name, text: clip(m.mes, 1800), role: m.is_user ? 'user' : 'assistant' })),
            note: '这只是角色快照与最近事件，不代表完整故事；用 story_search 查历史，story_read 读原文，lore_search/read 查未激活的设定。',
        };
    }
    async search(binding, query, limit) {
        const handle = await this.handle(binding);
        const hits = await handle.searchMessages({ query, limit });
        return { query, hits: hits.map(h => ({ index: h.index, role: h.role, text: clip(h.text ?? h.snippet, 2600) })) };
    }
    async characterRead(binding, { name, field = 'description', offset, length }) {
        await this.handle(binding);
        if (!['description', 'personality', 'scenario', 'examples', 'creatorNotes'].includes(field)) throw new Error('不支持的角色字段。');
        const card = name ? binding.characters.find(c => c.name === name) : binding.characters[0];
        if (!card) throw new Error('没有找到绑定角色。');
        return { name: card.name, field, snapshotAt: binding.boundAt, note: '这是关联时的角色快照；更新角色后可新建关联会话。', ...sliceText(card[field], offset, length) };
    }
    async read(binding, { index, offset, length }) {
        const handle = await this.handle(binding);
        let page = await handle.history.tail({ limit: 100 });
        while (page.startIndex > index && page.hasMoreBefore) {
            const before = await handle.history.before(page, { limit: 100 });
            if (before.startIndex >= page.startIndex) throw new Error('历史分页未前进，请更新宿主后重试。');
            page = before;
        }
        const message = page.messages?.[index - page.startIndex];
        if (!message) throw new Error('没有找到此消息索引。');
        return { index, name: message.name, role: message.is_user ? 'user' : 'assistant', ...sliceText(message.mes, offset, length) };
    }
    bookNames(binding) {
        return [...(binding?.books ?? []), ...(binding?.characters ?? []).filter(c => c.characterBook?.entries).map(c => `角色内嵌:${c.avatar ?? c.name}`)];
    }
    async entries(binding, name) {
        if (!this.bookNames(binding).includes(name)) throw new Error('只能读取绑定故事关联的世界书。');
        let data;
        if (name.startsWith('角色内嵌:')) {
            data = binding.characters.find(c => `角色内嵌:${c.avatar ?? c.name}` === name)?.characterBook;
        } else {
            if (!this.loadWorldInfo) throw new Error('当前版本的世界书读取模块不可用；可将相关设定填入用户补充资料。');
            data = await this.loadWorldInfo(name);
        }
        if (!data?.entries) throw new Error(`世界书“${name}”没有可读取条目，可能已被删除。`);
        return Object.entries(data.entries).map(([id, e]) => ({ id: String(e.uid ?? e.id ?? id), name: e.comment ?? e.name ?? '', keys: e.key ?? e.keys ?? [], disabled: Boolean(e.disable || e.enabled === false), content: String(e.content ?? '') }));
    }
    async loreSearch(binding, query, book, offset = 0) {
        await this.handle(binding);
        const books = book ? [book] : this.bookNames(binding);
        if (!query.trim()) {
            if (book) {
                const entries = await this.entries(binding, book);
                return { book, entries: entries.slice(offset, offset + 40).map(e => ({ id: e.id, name: e.name, keys: e.keys, disabled: e.disabled, excerpt: clip(e.content, 180) })), offset, totalEntries: entries.length, hasMore: offset + 40 < entries.length };
            }
            return { books, note: '可指定 book 分页浏览条目目录，或提供 query 检索；包含未激活及禁用项，禁用状态单独标出。' };
        }
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const hits = [], errors = [];
        for (const name of books) {
            try {
                const entries = await this.entries(binding, name);
                for (const e of entries) {
                    if (words.some(w => `${e.name} ${e.keys.join(' ')} ${e.content}`.toLowerCase().includes(w))) hits.push({ book: name, id: e.id, name: e.name, disabled: e.disabled, excerpt: clip(e.content, 1800) });
                }
            } catch (error) { errors.push({ book: name, error: error.message }); }
        }
        return { hits: hits.slice(0, 15), totalHits: hits.length, errors };
    }
    async loreRead(binding, { book, id, offset, length }) {
        await this.handle(binding);
        const entry = (await this.entries(binding, book)).find(e => e.id === String(id));
        if (!entry) throw new Error('未找到此世界书条目。');
        return { book, id, name: entry.name, disabled: entry.disabled, ...sliceText(entry.content, offset, length) };
    }
}

export async function connectHost() {
    const host = window.__TAURITAVERN__;
    if (!host) throw new Error('故事研讨助手需要在 TauriTavern 中运行。');
    await (host.ready ?? window.__TAURITAVERN_MAIN_READY__);
    const api = host.api;
    if (!api?.extension?.store || !api.chat) throw new Error('缺少官方 Extension Store 或 Chat API，请更新 TauriTavern。');
    let loreModule = null;
    try { loreModule = await import('/scripts/world-info.js'); } catch { /* 用户仍可提供资料，工具会说明缺口 */ }
    return new TavernHost({ api, context: () => window.SillyTavern?.getContext?.() ?? {}, loadWorldInfo: loreModule?.loadWorldInfo, loreContext: () => loreModule ?? {} });
}

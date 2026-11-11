import test from 'node:test';
import assert from 'node:assert/strict';
import { TavernHost } from '../src/host.js';

function fixture() {
    let current = { kind: 'character', characterId: 'alice.png', fileName: 'story-A' };
    let replaced = false;
    const messages = Array.from({ length: 241 }, (_, i) => ({ name: i % 2 ? '角色' : '用户', is_user: i % 2 === 0, mes: `事件${i} 灯塔` }));
    const reads = [];
    const handle = ref => ({
        stableId: async () => replaced ? 'replaced' : ref.fileName,
        summary: async () => ({ message_count: 241, preview: '故事进展', chat_metadata: { world_info: '聊天世界书' } }),
        searchMessages: async args => { reads.push({ ref, args }); return [{ index: 3, text: messages[3].mes, role: 'assistant' }]; },
        history: {
            tail: async ({ limit }) => ({ startIndex: messages.length - limit, messages: messages.slice(-limit), hasMoreBefore: true }),
            before: async (page, { limit }) => { const startIndex = Math.max(0, page.startIndex - limit); return { startIndex, messages: messages.slice(startIndex, page.startIndex), hasMoreBefore: startIndex > 0 }; },
        },
    });
    const ctx = { characterId: 0, characters: [{ name: 'Alice', avatar: 'alice.png', data: { name: 'Alice', description: '人物经历', extensions: { world: '角色世界书' }, character_book: { entries: [{ id: 8, name: '内嵌', content: '灯塔约定' }] } } }], chatMetadata: {} };
    const host = new TavernHost({
        api: { chat: { current: { ref: () => current }, open: handle } }, context: () => ctx,
        loreContext: () => ({ selected_world_info: ['全局世界书'], world_info: { charLore: [{ name: 'alice', extraBooks: ['补充世界书'] }] } }),
        loadWorldInfo: async name => ({ entries: { 2: { uid: 2, comment: name, content: '未激活的灯塔史料', disable: true } } }),
    });
    return { host, reads, ctx, change: () => { current = { ...current, fileName: 'story-B' }; }, replace: () => { replaced = true; } };
}

test('绑定后切换当前 UI，不改变检索目标；未调用任何写 API', async () => {
    const f = fixture(), binding = await f.host.bindCurrent();
    const before = JSON.stringify(f.ctx);
    f.change(); await f.host.search(binding, '灯塔', 5);
    assert.equal(f.reads[0].ref.fileName, 'story-A'); assert.equal(JSON.stringify(f.ctx), before);
    assert.deepEqual(binding.books, ['全局世界书', '聊天世界书', '角色世界书', '补充世界书']);
});
test('从官方历史分页读取窗口之外的原文及字符偏移', async () => {
    const f = fixture(), binding = await f.host.bindCurrent();
    const message = await f.host.read(binding, { index: 3, offset: 2, length: 3 });
    assert.equal(message.index, 3); assert.equal(message.text, '3 灯'); assert.equal(message.hasMore, true);
});
test('可查未激活、禁用及卡内世界书条目，但拒绝无关联书籍', async () => {
    const f = fixture(), binding = await f.host.bindCurrent();
    const result = await f.host.loreSearch(binding, '灯塔');
    assert.equal(result.hits.length, 5); assert.ok(result.hits.some(h => h.disabled));
    const read = await f.host.loreRead(binding, { book: '角色世界书', id: '2', offset: 0, length: 4 });
    assert.equal(read.text, '未激活的');
    await assert.rejects(f.host.loreRead(binding, { book: '无关联秘密', id: '2' }), /只能读取绑定/);
});
test('主故事被替换时拒绝读取，不悄悄切到另一故事', async () => {
    const f = fixture(), binding = await f.host.bindCurrent(); f.replace();
    await assert.rejects(f.host.overview(binding), /稳定身份已变化/);
});
test('角色长设定可分页；世界书可浏览条目目录，无需猜关键词', async () => {
    const f = fixture(); f.ctx.characters[0].data.description = '背景'.repeat(10000);
    const binding = await f.host.bindCurrent();
    const text = await f.host.characterRead(binding, { field: 'description', offset: 15000, length: 10 });
    assert.equal(text.text.length, 10); assert.equal(text.totalCharacters, 20000);
    const directory = await f.host.loreSearch(binding, '', '角色世界书');
    assert.equal(directory.entries[0].id, '2'); assert.equal(directory.totalEntries, 1);
});

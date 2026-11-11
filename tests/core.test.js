import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository, Assistant, DEFAULT_SETTINGS, settingsFrom, selectHistory, requestJSON, contextCharacters } from '../src/core.js';

const response = message => new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), { status: 200 });
const call = (id, name, args = {}) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const binding = id => ({ stableId: id, title: id, books: [], characters: [], ref: { kind: 'character', characterId: id, fileName: 'story' } });
export function memoryStore() {
    const data = new Map();
    return {
        data,
        async tryGetJson({ key }) { return data.has(key) ? { found: true, value: structuredClone(data.get(key)) } : { found: false }; },
        async setJson({ key, value }) { data.set(key, structuredClone(value)); },
        async deleteJson({ key }) { data.delete(key); },
    };
}
async function setup(fetcher, host = {}) {
    const repo = await new Repository(memoryStore()).initialize();
    const session = await repo.create(binding('A'));
    const assistant = new Assistant({ host, repository: repo, fetcher });
    return { repo, session, assistant };
}
const settings = { ...DEFAULT_SETTINGS, background: '固定身份测试：研究历史与人物', notes: '主线事实：人物尚未和解' };

test('真实工具循环每次包含完整身份，搜索正文引用持久化，独立于主故事', async () => {
    const requests = [], hostCalls = [];
    const host = { overview: async b => { hostCalls.push(b.stableId); return { recent: '原故事' }; } };
    let round = 0;
    const fetcher = async (url, options) => {
        const payload = JSON.parse(options.body); requests.push({ url, payload });
        if (url.endsWith('/tools/search')) return new Response(JSON.stringify({ results: [{ title: '档案', url: 'https://example.org/archive', summary: '交通背景' }] }));
        if (url.endsWith('/tools/fetch')) return new Response(JSON.stringify({ title: '档案正文', content: '史料正文内容' }));
        round++;
        if (round === 1) return response({ content: '', tool_calls: [call('one', 'story_overview'), call('two', 'web_search', { query: '清代 驿站 行程' })] });
        if (round === 2) return response({ content: '', tool_calls: [call('three', 'web_fetch', { url: 'https://example.org/archive' })] });
        return response({ content: '建议采用这一细节。来源：https://example.org/archive' });
    };
    const { assistant, session, repo } = await setup(fetcher, host);
    await assistant.send({ session, text: '丰富旅途中人物的细节', settings, apiKey: 'dummy-test-key' });
    assert.equal(round, 3); assert.deepEqual(hostCalls, ['A']);
    for (const { payload } of requests.filter(r => r.url.endsWith('/chat/completions'))) {
        assert.equal(payload.messages[0].role, 'system');
        assert.equal(payload.messages[0].content.split(settings.background).length, 2);
        assert.ok(payload.messages[1].content.includes(settings.notes));
        assert.equal(payload.thinking.type, 'disabled');
    }
    assert.equal(session.turns[0].complete, true);
    assert.equal(session.sources.length, 1);
    assert.ok((await repo.load(session.id)).turns[0].answer.includes('来源'));
    assert.equal(session.turns[0].history.filter(m => m.role === 'tool').length, 3);
});

test('无效工具参数作为工具错误返回，未伪装成功', async () => {
    const requests = []; let n = 0;
    const { assistant, session } = await setup(async (url, options) => {
        const payload = JSON.parse(options.body); requests.push(payload);
        return response(++n === 1 ? { content: '', tool_calls: [{ ...call('bad', 'story_read'), function: { name: 'story_read', arguments: '{invalid' } }] } : { content: '读取失败，需要修正索引。' });
    });
    await assistant.send({ session, text: '查看旧事件', settings, apiKey: 'dummy' });
    assert.ok(requests[1].messages.find(m => m.role === 'tool').content.includes('error'));
});

test('停止后的不完整工具组不进入下一次模型请求，历史可保留', async () => {
    const controller = new AbortController();
    const { assistant, session } = await setup(async () => { controller.abort(); throw new DOMException('stopped', 'AbortError'); });
    await assert.rejects(assistant.send({ session, text: '第一次', settings, apiKey: 'dummy', signal: controller.signal }));
    assert.equal(session.turns[0].status, 'stopped');
    const requests = [];
    assistant.fetcher = async (url, options) => { requests.push(JSON.parse(options.body)); return response({ content: '新的回答' }); };
    await assistant.send({ session, text: '第二次', settings, apiKey: 'dummy' });
    assert.equal(requests[0].messages.some(m => m.content === '第一次'), false);
    assert.equal(session.turns.length, 2);
});

test('历史预算只选择完整轮次，未完成与孤立工具不会发送', () => {
    const session = { turns: [
        { complete: true, history: [{ role: 'user', content: '旧'.repeat(1000) }] },
        { complete: false, history: [{ role: 'tool', tool_call_id: 'broken', content: 'oops' }] },
        { complete: true, history: [{ role: 'user', content: '新' }, { role: 'assistant', content: '回答' }] },
    ] };
    const selected = selectHistory(session, 200);
    assert.equal(selected.included, 1); assert.equal(selected.omitted, 1);
    assert.deepEqual(selected.messages.map(m => m.role), ['user', 'assistant']);
});

test('旧讨论检索按故事隔离；未绑定的独立会话也不互相混入', async () => {
    const { repo, session } = await setup(async () => response({ content: 'unused' }));
    session.turns.push({ user: '灯塔约定', answer: '仅是备选，尚未确认' }); await repo.saveSession(session);
    const other = await repo.create(binding('B')); other.turns.push({ user: '灯塔约定', answer: '另一个故事的秘密' }); await repo.saveSession(other);
    const hits = await repo.searchDiscussions('A', '灯塔');
    assert.equal(hits.hits.length, 1); assert.equal(hits.hits[0].sessionId, session.id);
    const unbound = await repo.create(null); unbound.turns.push({ user: '无绑定资料', answer: 'test' }); await repo.saveSession(unbound);
    const another = await repo.create(null);
    assert.equal((await repo.searchDiscussions(`unbound:${another.id}`, '资料')).hits.length, 0);
});

test('整理接续覆盖所有已完成讨论，身份与未确认状态的要求在每次请求保留', async () => {
    const requests = [];
    const { assistant, session } = await setup(async (url, options) => { requests.push(JSON.parse(options.body)); return response({ content: '尚未确认的构思：先铺垫，后发生变化。' }); });
    session.turns = [
        { complete: true, user: '开头想法' + 'A'.repeat(23000), answer: '第一段建议' },
        { complete: true, user: '后半想法' + 'B'.repeat(23000), answer: '第二段建议' },
        { complete: false, user: '未完成内容', answer: '' },
    ];
    const summary = await assistant.handoff({ session, settings: { ...settings, contextBudget: 32000 }, apiKey: 'dummy' });
    assert.ok(summary.includes('尚未确认')); assert.ok(requests.length > 1);
    const inputs = requests.map(p => p.messages.at(-1).content).join('');
    assert.ok(inputs.includes('开头想法')); assert.ok(inputs.includes('后半想法')); assert.ok(!inputs.includes('未完成内容'));
    assert.ok(requests.every(p => p.messages[0].content.includes(settings.background)));
});

test('工具循环有界且最后一轮要求直接回答', async () => {
    const requests = [];
    const { assistant, session } = await setup(async (url, options) => {
        const p = JSON.parse(options.body); requests.push(p);
        return response(p.tools ? { content: '', tool_calls: [call('x', 'story_overview')] } : { content: '资料不足，先说明已查到的部分。' });
    }, { overview: async () => ({ ok: true }) });
    await assistant.send({ session, text: '讨论', settings: { ...settings, maxRounds: 2 }, apiKey: 'dummy' });
    assert.equal(requests.length, 3); assert.equal(requests.at(-1).tools, undefined);
});

test('设置剔除密钥；危险地址与凭据化 URL 不接受；服务端错误脱敏', async () => {
    assert.equal(settingsFrom({ apiKey: 'secret', searchKey: 'secret' }).apiKey, undefined);
    assert.throws(() => settingsFrom({ baseUrl: 'javascript:alert(1)' }));
    assert.throws(() => settingsFrom({ baseUrl: 'https://user:password@example.com' }));
    await assert.rejects(requestJSON('https://example.org', 'secret-value', {}, undefined, async () => new Response(JSON.stringify({ error: { message: 'bad secret-value' } }), { status: 401 })), /bad \[密钥\]/);
});

test('持久化失败时停止，不调用模型并伪装保存成功', async () => {
    const { assistant, session, repo } = await setup(async () => { throw new Error('不应调用'); });
    repo.store.setJson = async () => { throw new Error('磁盘写入失败'); };
    await assert.rejects(assistant.send({ session, text: '讨论', settings, apiKey: 'dummy' }), /磁盘写入失败/);
});

test('网页正文缓存和分页；不重复收费抓取同一页', async () => {
    let calls = 0;
    const { assistant, session } = await setup(async () => { calls++; return new Response(JSON.stringify({ title: '资料', content: '0123456789' })); });
    const run = { session, settings, apiKey: 'dummy' };
    const first = await assistant.invokeTool('web_fetch', { url: 'https://example.org', length: 4 }, run);
    const second = await assistant.invokeTool('web_fetch', { url: 'https://example.org', offset: 4, length: 4 }, run);
    assert.equal(first.content, '0123'); assert.equal(second.content, '4567'); assert.equal(calls, 1); assert.equal(second.hasMore, true);
});

test('上下文实时计入固定指令、资料、历史、工具说明和待发送文字', async () => {
    const { assistant, session } = await setup(async () => response({ content: 'unused' }));
    const empty = assistant.previewContext(session, settings);
    const pending = assistant.previewContext(session, settings, '正在输入的新想法');
    assert.ok(empty.usedCharacters > settings.background.length + settings.notes.length);
    assert.ok(pending.usedCharacters > empty.usedCharacters);
    assert.equal(pending.usedCharacters, contextCharacters(pending.messages, pending.tools));
    assert.equal(pending.percent, Math.round(pending.usedCharacters / settings.contextBudget * 100));
    session.turns.push({ complete: true, history: [{ role: 'user', content: '旧讨论'.repeat(5000) }] });
    const limited = assistant.previewContext(session, { ...settings, contextBudget: 12000 });
    assert.equal(limited.omitted, 1);
});

test('显示 API 的实际单次输入 token，不把多轮消费累加为上下文；字符统计随工具增长', async () => {
    const events = [], payloads = []; let round = 0;
    const { assistant, session, repo } = await setup(async (url, options) => {
        payloads.push(JSON.parse(options.body)); round++;
        return new Response(JSON.stringify({ choices: [{ message: round === 1 ? { content: '', tool_calls: [call('metrics', 'story_overview')] } : { content: '回答' } }], usage: { prompt_tokens: round === 1 ? 1000 : 1700, completion_tokens: 120, total_tokens: round === 1 ? 1120 : 1820 } }));
    }, { overview: async () => ({ content: '查阅得到的资料'.repeat(100) }) });
    await assistant.send({ session, text: '讨论', settings, apiKey: 'dummy', onEvent: e => events.push(e) });
    const contexts = events.filter(e => e.type === 'context');
    assert.equal(contexts.at(-1).usedCharacters, contextCharacters(payloads.at(-1).messages, payloads.at(-1).tools));
    assert.ok(contexts.at(-1).usedCharacters > contexts[0].usedCharacters);
    assert.equal(session.lastUsage.promptTokens, 1700); assert.equal(session.lastUsage.completionTokens, 120);
    assert.equal((await repo.load(session.id)).lastUsage.promptTokens, 1700);
});

test('未返回 usage 的 API 不捏造 token 数', async () => {
    const { assistant, session } = await setup(async () => response({ content: '正常回答' }));
    await assistant.send({ session, text: '讨论', settings, apiKey: 'dummy' });
    assert.equal(session.lastUsage, undefined);
});

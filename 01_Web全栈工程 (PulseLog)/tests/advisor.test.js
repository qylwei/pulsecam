const { test } = require('node:test');
const assert = require('node:assert/strict');
const { respond } = require('../src/advisor');
const { askLLM } = require('../src/advisor/llm');
const { buildFacts } = require('../src/advisor/facts');

const record = {
  recordedAt: new Date().toISOString(), scenario: '日常',
  sleepHours: 6.4, stress: 4, fatigue: 3, mood: 3, recoveryScore: 62,
  heartRate: null, hrv: null, respiration: null,
  provenance: { sleepHours: 'manual', stress: 'manual', fatigue: 'manual', mood: 'manual', recoveryScore: 'derived' }
};

test('missing HRV does not create measured values', async () => {
  const answer = await respond({ records: [record], message: '为什么 HRV 下降' });
  assert.match(answer.answer, /没有 HRV/);
  assert.doesNotMatch(answer.answer, /\d+\s*ms/i);
  assert.ok(answer.missing.some(item => item.key === 'hrv'));
  assert.equal(answer.engine, 'local');
});

test('urgent symptom is escalated before any model request', async () => {
  const answer = await respond({ records: [record], message: '胸口疼，喘不上气', config: { apiKey: 'not-real' } });
  assert.equal(answer.escalate, true);
  assert.equal(answer.engine, 'local');
  assert.equal(answer.actions.length, 0);
});

test('empty history never invents a numeric reading', async () => {
  const answer = await respond({ records: [], message: '今晚几点睡' });
  assert.ok(answer.missing.length > 0 || /还没有/.test(answer.answer));
  assert.doesNotMatch(answer.answer, /\d/);
  assert.equal(answer.evidence.length, 0);
});

test('configured model is contacted even before the first record, without inventing evidence', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  try {
    global.fetch = async () => {
      calls++;
      return { ok: true, json: async () => ({ choices: [{ message: {
        content: JSON.stringify({ answer: '可以先从固定的作息开始，但缺少个人记录。', evidence: [],
          actions: [], missing: [], escalate: false })
      } }] }) };
    };
    const answer = await respond({ records: [], message: '今晚怎么休息？',
      config: { apiKey: 'test', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', provider: 'DeepSeek' } });
    assert.equal(calls, 1);
    assert.equal(answer.engine, 'DeepSeek');
    assert.match(answer.answer, /还没有保存记录/);
    assert.doesNotMatch(answer.answer, /\d/);
    assert.equal(answer.evidence.length, 0);
    assert.ok(answer.missing.length > 0);
  } finally { global.fetch = originalFetch; }
});

test('urgent symptom does not contact a configured model', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new Error('Unexpected model request'); };
    const result = await respond({ records: [], message: '胸口疼',
      config: { apiKey: 'test', baseUrl: 'https://api.deepseek.com' } });
    assert.equal(result.escalate, true);
  } finally { global.fetch = originalFetch; }
});

test('cloud evidence is rejected when no records exist', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: {
      content: JSON.stringify({ answer: '建议休息。', evidence: [{ label: '睡眠', value: '6h', source: 'manual' }],
        actions: [], missing: [], escalate: false })
    } }] }) });
    const result = await respond({ records: [], message: '今天怎么样？',
      config: { apiKey: 'test', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' } });
    assert.equal(result.engine, 'local');
    assert.equal(result.fallbackReason, 'bad_output');
  } finally { global.fetch = originalFetch; }
});

test('only saved values may appear as evidence', async () => {
  const answer = await respond({ records: [record], message: '为什么今天累' });
  assert.ok(answer.evidence.some(item => item.value === '6.4h'));
  assert.ok(answer.evidence.every(item => ['manual', 'measured', 'derived'].includes(item.source)));
});

test('malformed or fabricated cloud evidence falls back to local answers', async () => {
  const originalFetch = global.fetch;
  const config = { apiKey: 'test', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' };
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{' } }] }) });
    let answer = await respond({ records: [record], message: '为什么今天累', config });
    assert.equal(answer.engine, 'local');
    assert.equal(answer.fallbackReason, 'bad_output');
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: {
      content: JSON.stringify({ answer: '睡眠 6.4', evidence: [{ label: '心率', value: '6.4bpm', source: 'measured' }],
        actions: [], missing: [], escalate: false })
    } }] }) });
    answer = await respond({ records: [record], message: '为什么今天累', config });
    assert.equal(answer.engine, 'local');
    assert.equal(answer.fallbackReason, 'bad_output');
  } finally { global.fetch = originalFetch; }
});

test('timeout does not retry a slow upstream', async () => {
  const originalFetch = global.fetch;
  let count = 0;
  try {
    global.fetch = async () => { count++; throw Object.assign(new Error('Timed out'), { name: 'TimeoutError' }); };
    const result = await askLLM({ facts: buildFacts([record]), message: '睡眠', config: {
      apiKey: 'test', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat'
    } });
    assert.equal(result.meta.fallbackReason, 'timeout');
    assert.equal(count, 1);
  } finally { global.fetch = originalFetch; }
});

test('a record from another day is not treated as today', () => {
  const old = { ...record, recordedAt: '2020-01-01T08:00:00Z' };
  const facts = buildFacts([old]);
  assert.equal(facts.today.date, null);
  assert.equal(facts.availability.sleep, false);
  assert.ok(facts.lastRecord);
  assert.equal(facts.lastRecord.date, '2020-01-01');
});

test('local answer cites the saved sleep value instead of a generic question', async () => {
  const answer = await respond({ records: [record], message: '昨晚睡得怎么样' });
  assert.match(answer.answer, /6\.4/);
  assert.ok(answer.evidence.some(item => item.value === '6.4h'));
});

test('sudden severe headache with vomiting escalates before any model call', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new Error('Unexpected model request'); };
    const result = await respond({ records: [record], message: '突然剧烈头痛，还呕吐了',
      config: { apiKey: 'test', baseUrl: 'https://api.deepseek.com' } });
    assert.equal(result.escalate, true);
    assert.equal(result.engine, 'local');
    assert.equal(result.actions.length, 0);
  } finally { global.fetch = originalFetch; }
});

test('symptom questions stay on local safety rules even with a configured model', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new Error('Unexpected model request'); };
    const result = await respond({ records: [record], message: '今天有点头晕',
      config: { apiKey: 'test', baseUrl: 'https://api.deepseek.com' } });
    assert.equal(result.engine, 'local');
    assert.equal(result.escalate, false);
    assert.match(result.answer, /不能判断原因/);
    assert.ok(result.evidence.some(item => item.value === '6.4h'));
  } finally { global.fetch = originalFetch; }
});

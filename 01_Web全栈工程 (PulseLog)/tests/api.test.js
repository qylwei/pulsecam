const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const root = join(__dirname, '..');
const dataDir = mkdtempSync(join(tmpdir(), 'pulselog-test-'));
const port = 31000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: root, env: { ...process.env, PORT: String(port), PULSELOG_DATA_DIR: dataDir },
  stdio: 'ignore'
});
after(async () => {
  server.kill();
  await new Promise(resolve => {
    if (server.exitCode !== null) resolve();
    else server.once('exit', resolve);
  });
  rmSync(dataDir, { recursive: true, force: true });
});

async function request(path, options) {
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await request('/health')).ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Test server failed to start');
}

test('Canonical scenario code saves; invalid values and forged score do not enter records', async () => {
  await waitForServer();
  const userId = 'test-' + Date.now();
  const data = {
    userId, scenario: '日常', sleepHours: 7.5, activityMinutes: 30,
    fatigue: 2, stress: 2, mood: 4, recoveryScore: 999
  };
  const post = async body => request('/api/checkins', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  assert.equal((await post({ ...data, scenario: 'Daily' })).status, 400);
  assert.equal((await post({ ...data, heartRate: 500 })).status, 400);
  assert.equal((await post({ ...data, hrv: -7 })).status, 400);
  assert.equal((await post({ ...data, respiration: 3 })).status, 400);
  const saved = await post(data);
  assert.equal(saved.status, 201);
  const record = await saved.json();
  assert.equal(record.scenario, '日常');
  assert.equal(record.dataSource, 'manual');
  assert.equal(record.heartRate, null);
  assert.equal(record.provenance.heartRate, null);
  assert.equal(record.provenance.sleepHours, 'manual');
  assert.equal(record.hrv, null);
  assert.equal(record.respiration, null);
  assert.ok(record.recoveryScore >= 0 && record.recoveryScore <= 100);
  assert.notEqual(record.recoveryScore, 999);
  const list = await (await request(`/api/checkins?userId=${userId}`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, record.id);
  const scan = await post({ ...data, dataSource: 'scan', heartRate: 78, quality: 0.8 });
  assert.equal(scan.status, 201);
  const measured = await scan.json();
  assert.equal(measured.provenance.heartRate, 'measured');
  assert.equal(measured.quality, 0.8);
  const periodic = await post({ ...data, dataSource: 'scan', heartRate: 72, hrv: 0, quality: 0.9 });
  assert.equal(periodic.status, 201);
  assert.equal((await periodic.json()).provenance.hrv, 'measured');
  const dashboard = await (await request(`/api/dashboard?userId=${userId}`)).json();
  assert.equal(dashboard.baseline.heartRate.value, 75);
  const empty = await (await request('/api/dashboard?userId=new-empty-user')).json();
  assert.equal(empty.baseline.heartRate, null);
});

test('legacy records are hidden and purge is repeatable in isolated database', async () => {
  await waitForServer();
  const Database = require('better-sqlite3');
  const db = new Database(join(dataDir, 'pulselog.db'));
  db.prepare('INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)').run('legacy-test', new Date().toISOString());
  db.prepare("INSERT INTO daily_checkins (user_id, recorded_at, sleep_hours, activity_minutes, fatigue, stress, mood, scenario, data_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'legacy')")
    .run('legacy-test', new Date().toISOString(), 7, 20, 3, 3, 3, '日常');
  db.close();
  const records = await (await request('/api/checkins?userId=legacy-test')).json();
  assert.equal(records.length, 0);
  const run = () => execFileSync(process.execPath, ['scripts/purge-legacy.js'], { cwd: root, env: { ...process.env, PULSELOG_DATA_DIR: dataDir }, encoding: 'utf8' });
  assert.match(run(), /Removed 1/);
  assert.match(run(), /Removed 0/);
});

test('AI configuration rejects a non-official host', async () => {
  await waitForServer();
  const result = await request('/api/ai/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: 'http://127.0.0.1:1234' })
  });
  assert.equal(result.status, 400);
});

test('AI configuration accepts multiple major providers with slash models', async () => {
  await waitForServer();
  const providers = [
    { provider: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { provider: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
    { provider: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { provider: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }
  ];
  for (const item of providers) {
    const res = await request('/api/ai/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-test-12345678', ...item })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.provider, item.provider);
    assert.equal(body.model, item.model);
  }
});

test('AI test returns language-matched errors without mixing Chinese and English', async () => {
  await waitForServer();
  const zhTest = await request('/api/ai/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'sk-invalid-key-for-test', baseUrl: 'https://api.deepseek.com', lang: 'zh' })
  });
  assert.equal(zhTest.status, 401);
  const zhJson = await zhTest.json();
  assert.ok(/[\u4e00-\u9fa5]/.test(zhJson.error));
  assert.ok(!/[a-zA-Z]{5,}/.test(zhJson.error));

  const enTest = await request('/api/ai/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'sk-invalid-key-for-test', baseUrl: 'https://api.deepseek.com', lang: 'en' })
  });
  assert.equal(enTest.status, 401);
  const enJson = await enTest.json();
  assert.ok(!/[\u4e00-\u9fa5]/.test(enJson.error));
  assert.ok(/[a-zA-Z]/.test(enJson.error));
});

test('AI config can be cleared without changing saved check-ins', async () => {
  await waitForServer();
  const set = await request('/api/ai/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'test-key', baseUrl: 'https://api.deepseek.com' })
  });
  assert.equal(set.status, 200);
  const cleared = await request('/api/ai/config', { method: 'DELETE' });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).configured, false);
  assert.equal((await (await request('/api/ai/config')).json()).configured, false);
  const testWithoutKey = await request('/api/ai/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(testWithoutKey.status, 400);
});

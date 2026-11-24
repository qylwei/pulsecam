const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const express = require('express');
const { createAnonymousUser, addCheckin, listCheckins, deleteCheckin, updateCheckin, clearCheckins, membershipFor, setMembership } = require('./store');
const { respond } = require('./advisor');
const { buildFacts } = require('./advisor/facts');
const { askLLM } = require('./advisor/llm');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const scenarios = new Set(['日常', '面试', '考试', '运动', '经期']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const configFile = path.join(__dirname, '..', 'data', 'ai-config.json');

function loadAiConfig() {
  const defaults = {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
    model: process.env.LLM_MODEL || 'deepseek-chat',
    provider: 'DeepSeek'
  };
  try {
    if (fs.existsSync(configFile)) {
      const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return { ...defaults, ...saved, baseUrl: allowedAiUrl(saved.baseUrl) || defaults.baseUrl };
    }
  } catch (_) {}
  return defaults;
}

let aiConfig = loadAiConfig();

function saveAiConfig(cfg) {
  aiConfig = { ...aiConfig, ...cfg };
}

function allowedAiUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return null;
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    let p = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${p}`;
  } catch (_) { return null; }
}

function isLoopback(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

function score(checkin) {
  return scoreBreakdown(checkin).total;
}

function scoreBreakdown(checkin) {
  const sleep = clamp(checkin.sleep_hours, 0, 12);
  const activity = clamp(checkin.activity_minutes, 0, 180);
  const fatigue = clamp(checkin.fatigue, 1, 5);
  const stress = clamp(checkin.stress, 1, 5);
  const mood = clamp(checkin.mood, 1, 5);
  if (checkin.recovery_score) {
    const target = checkin.recovery_score;
    const sleepBonus = Math.round((sleep - 7) * 4);
    const penalty = fatigue * 4 + stress * 3;
    const reward = mood * 3;
    const base = target - sleepBonus + penalty - reward;
    const factors = [
      { label: `基线评分 (${checkin.scenario || '日常'})`, points: base },
      { label: `睡眠 ${sleep} 小时`, points: sleepBonus },
      { label: `身心负荷 (疲劳${fatigue}/压力${stress})`, points: -penalty },
      { label: `状态调节 (心情等级${mood})`, points: reward }
    ];
    return { factors, total: target };
  }

  const factors = [
    { label: '基础状态', points: 50 },
    { label: `睡眠 ${sleep} 小时`, points: Math.round((sleep - 7) * 5) },
    { label: `活动 ${activity} 分钟`, points: Math.round(Math.min(activity, 60) * 0.12) },
    { label: `疲劳等级 ${fatigue}`, points: -fatigue * 6 },
    { label: `压力等级 ${stress}`, points: -stress * 5 },
    { label: `心情等级 ${mood}`, points: mood * 5 }
  ];
  return { factors, total: Math.round(clamp(factors.reduce((sum, item) => sum + item.points, 0), 0, 100)) };
}

function adviceFor(checkin, recoveryScore) {
  if (checkin.scenario === '面试') {
    return recoveryScore >= 75
      ? '面试前生理指标恢复良好。建议深呼吸保持节奏，保持自信与专注。'
      : '面试前交感神经稍显兴奋（压力感较高）。建议用 3 分钟腹式呼吸放松，少量饮用温水。';
  }
  if (checkin.scenario === '考试') {
    return recoveryScore >= 75
      ? '脑力状态处于黄金恢复期。适合集中精力攻克重点题型，注意定时休息。'
      : '当前脑力负荷较高。建议每 45 分钟离开座位活动放松肩颈，保证今晚规律睡眠。';
  }
  if (checkin.scenario === '运动') {
    return recoveryScore >= 75
      ? '心肺恢复状态极佳，适合中高强度训练，运动后注意拉伸补液。'
      : '肌肉与心肺恢复度一般，今天建议以轻度慢跑、散步或拉伸为主，避免极限大重量。';
  }
  if (checkin.scenario === '经期') {
    return 'HRV 处于周期生理波动期，建议以温和舒缓活动为主，注意腰腹保暖并充分补水。';
  }
  if (checkin.sleep_hours < 6) return '昨晚睡眠偏少。今天优先安排固定休息时间，今晚建议 23 点前入睡。';
  if (checkin.stress >= 4) return '压力感偏高。建议利用 5 分钟做闭目深呼吸，将高负荷任务拆成小步骤。';
  if (checkin.fatigue >= 4) return '疲劳感较强。今天建议以轻量活动和温水补水为主，避免连续高强度安排。';
  if (recoveryScore >= 80) return '整体恢复状态优秀。下午适合高效学习或深度专注，晚上保持稳定节律。';
  if (recoveryScore >= 60) return '状态基本稳定。今天保持适量活动，晚上尽量在固定时间入睡。';
  return '身心恢复指数偏低，提示蓄积疲劳。建议今晚提早 1 小时就寝，减少夜间屏幕使用。';
}

function toClient(checkin) {
  const recoveryScore = checkin.recovery_score ?? score(checkin);
  const legacy = checkin.data_source === 'legacy';
  const source = legacy ? 'legacy' : 'manual';
  const measured = legacy ? 'legacy' : checkin.data_source === 'scan' ? 'measured' : 'manual';
  return {
    id: checkin.id,
    userId: checkin.user_id,
    recordedAt: checkin.recorded_at,
    sleepHours: checkin.sleep_hours,
    activityMinutes: checkin.activity_minutes,
    fatigue: checkin.fatigue,
    stress: checkin.stress,
    mood: checkin.mood,
    scenario: checkin.scenario,
    note: checkin.note,
    heartRate: checkin.heart_rate,
    hrv: checkin.hrv,
    respiration: checkin.respiration,
    dataSource: checkin.data_source || 'legacy',
    quality: checkin.quality ?? null,
    provenance: {
      sleepHours: source, activityMinutes: source, fatigue: source, stress: source,
      mood: source, note: source,
      heartRate: checkin.heart_rate == null ? null : measured,
      hrv: checkin.hrv == null ? null : measured,
      respiration: checkin.respiration == null ? null : measured,
      recoveryScore: legacy ? 'legacy' : 'derived'
    },
    recoveryScore,
    scoreBreakdown: scoreBreakdown(checkin),
    advice: adviceFor(checkin, recoveryScore)
  };
}

function validateVitals(body) {
  const limits = { heartRate: [30, 220], hrv: [0, 300], respiration: [4, 60] };
  const values = {};
  for (const [key, [min, max]] of Object.entries(limits)) {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === '') {
      values[key] = null;
    } else if (!Number.isFinite(Number(raw)) || Number(raw) < min || Number(raw) > max) {
      return null;
    } else {
      values[key] = Math.round(Number(raw));
    }
  }
  return values;
}

function validateSource(body) {
  const source = body.dataSource ?? 'manual';
  if (!['manual', 'scan'].includes(source)) return null;
  if (body.quality != null && (!Number.isFinite(Number(body.quality)) || Number(body.quality) < 0 || Number(body.quality) > 1)) return null;
  if (source === 'manual' && ['heartRate', 'hrv', 'respiration'].some(key => body[key] != null && body[key] !== '')) return null;
  return { dataSource: source, quality: body.quality == null ? null : Number(body.quality) };
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'PulseLog API',
  projectId: crypto.createHash('sha256').update(path.resolve(__dirname, '..').toLowerCase()).digest('hex')
}));

function lanAddress() {
  const networks = os.networkInterfaces();
  for (const entries of Object.values(networks)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && entry.address.startsWith('192.168.')) return entry.address;
    }
  }
  return null;
}

app.get('/api/lan-info', (_req, res) => {
  const ip = lanAddress();
  const exposed = process.env.PULSELOG_HOST === '0.0.0.0';
  const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  res.json({
    lanIp: ip,
    lanUrl: exposed && ip ? `http://${ip}:${port}/` : null,
    publicUrl: publicUrl || null,
    exposed
  });
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!/^https?:\/\/[^\s]{4,500}$/i.test(text)) return res.status(400).send('invalid url');
  try {
    const png = await QRCode.toBuffer(text, { width: 560, margin: 1, color: { dark: '#23221E', light: '#FFFFFE' } });
    res.setHeader('Cache-Control', 'no-store');
    res.type('png').send(png);
  } catch (error) {
    res.status(500).send('qr failed');
  }
});

app.get('/preview', async (_req, res) => {
  if (process.env.PULSELOG_HOST !== '0.0.0.0') return res.status(503).send('默认仅允许本机访问。如需局域网界面预览，请在可信网络显式设置 PULSELOG_HOST=0.0.0.0；此服务不提供账号鉴权。');
  const ip = lanAddress();
  if (!ip) return res.status(503).send('未找到局域网地址，请确认电脑已连接 Wi‑Fi。');
  const url = `http://${ip}:${port}/?v=measure-v6`;
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#23221E', light: '#FBF8F3' } });
  res.type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PulseCam 手机界面预览</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F1F0EC;color:#23221E;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.card{width:min(86vw,380px);padding:28px;background:#FFFFFE;border-radius:22px;text-align:center;box-shadow:0 12px 36px #23221e18}h1{font-size:23px;margin:0 0 8px}p{font-size:14px;color:#58564E;line-height:1.6}.qr{width:280px;max-width:100%;margin:12px auto}.url{padding:10px;border-radius:9px;background:#F1F5F1;color:#4F6E56;font:12px ui-monospace,monospace;word-break:break-all}</style><main class="card"><h1>PulseCam 手机界面预览</h1><p>仅供界面预览，HTTP 地址不提供相机测量。<br>手机和电脑须连接同一可信 Wi‑Fi；服务无账号鉴权。</p><img class="qr" src="${qr}" alt="PulseCam 预览二维码"><div class="url">${url}</div></main></html>`);
});

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PulseLog · 今日记录</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{max-width:560px;margin:36px auto;padding:28px;background:#fff;border-radius:20px;box-shadow:0 8px 32px #22345b16}h1{margin:0}p{color:#61708a;line-height:1.55}.tag{display:inline-block;padding:5px 10px;border-radius:99px;background:#e8f0ff;color:#3260bc;font-size:13px}label{display:block;margin-top:16px;font-weight:600}input,select,textarea,button{width:100%;margin-top:7px;border:1px solid #dbe1ee;border-radius:10px;padding:12px;font:inherit;background:#fff}textarea{resize:vertical}button{border:0;background:#2865db;color:#fff;font-weight:700;cursor:pointer;margin-top:22px}#result{padding:14px;margin-top:16px;border-radius:10px;background:#eff5ff;display:none;line-height:1.55}.hint{font-size:13px;color:#758198}</style></head>
<body><main class="card"><span class="tag">PulseLog 初始版</span><h1>记录今天的状态</h1><p>仅用于日常自我记录与生活节律参考，不提供医疗诊断。</p>
<form id="form"><label>睡眠时长（小时）<input name="sleepHours" type="number" min="0" max="24" step="0.5" value="7" required></label>
<label>活动时长（分钟）<input name="activityMinutes" type="number" min="0" max="1440" value="30" required></label>
<label>疲劳程度（1 低 — 5 高）<input name="fatigue" type="number" min="1" max="5" value="3" required></label>
<label>压力程度（1 低 — 5 高）<input name="stress" type="number" min="1" max="5" value="3" required></label>
<label>心情程度（1 低 — 5 好）<input name="mood" type="number" min="1" max="5" value="3" required></label>
<label>今日情景<select name="scenario"><option>日常</option><option>考试</option><option>面试</option><option>运动</option><option>经期</option></select></label>
<label>备注（可不填）<textarea name="note" rows="3" maxlength="300" placeholder="例如：下午有一场考试"></textarea></label><button>保存今日记录</button></form><div id="result"></div><p class="hint">记录仅保存在你电脑本机的数据库中。</p></main>
<script>const key='pulselog-user-id';const form=document.querySelector('#form');const result=document.querySelector('#result');async function userId(){let id=localStorage.getItem(key);if(!id){id=(await (await fetch('/api/auth/anonymous',{method:'POST'})).json()).id;localStorage.setItem(key,id)}return id}form.addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form));for(const k of ['sleepHours','activityMinutes','fatigue','stress','mood'])data[k]=Number(data[k]);data.userId=await userId();const r=await fetch('/api/checkins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const out=await r.json();result.style.display='block';result.textContent=r.ok?('已保存。今日恢复分数：'+out.recoveryScore+' 分。'+out.advice):(out.error||'保存失败，请稍后重试。')})</script></body></html>`);
});

app.post('/api/auth/anonymous', (_req, res) => {
  const user = createAnonymousUser(`anon_${crypto.randomUUID()}`);
  res.status(201).json(user);
});

app.get('/api/checkins', (req, res) => {
  if (!req.query.userId) return res.status(400).json({ error: 'userId is required' });
  res.json(listCheckins(req.query.userId).map(toClient));
});

app.post('/api/checkins', (req, res) => {
  const body = req.body || {};
  if (!body.userId || !scenarios.has(body.scenario)) return res.status(400).json({ error: '请提供 userId 和有效情景' });
  const numericFields = ['sleepHours', 'activityMinutes', 'fatigue', 'stress', 'mood'];
  if (numericFields.some((key) => !Number.isFinite(Number(body[key])))) return res.status(400).json({ error: '记录数据格式不正确' });
  if (body.sleepHours < 0 || body.sleepHours > 24 || body.activityMinutes < 0 || body.activityMinutes > 1440 || [body.fatigue, body.stress, body.mood].some((value) => value < 1 || value > 5)) {
    return res.status(400).json({ error: '记录数据超出合理范围' });
  }
  const vitals = validateVitals(body);
  if (!vitals) return res.status(400).json({ error: '心率、HRV 或呼吸值超出合理范围' });
  const source = validateSource(body);
  if (!source) return res.status(400).json({ error: '记录来源或质量无效；手填记录不能包含实测指标' });
  const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
  if (Number.isNaN(recordedAt.getTime()) || recordedAt > new Date(Date.now() + 5 * 60 * 1000)) return res.status(400).json({ error: '记录日期无效，不能晚于当前时间。' });
  createAnonymousUser(body.userId);
  const checkin = addCheckin({
    userId: String(body.userId), recordedAt: recordedAt.toISOString(), sleepHours: Number(body.sleepHours),
    activityMinutes: Math.round(Number(body.activityMinutes)), fatigue: Math.round(Number(body.fatigue)),
    stress: Math.round(Number(body.stress)), mood: Math.round(Number(body.mood)), scenario: body.scenario,
    note: String(body.note || '').trim().slice(0, 300),
    ...vitals, ...source, recoveryScore: null
  });
  res.status(201).json(toClient(checkin));
});

app.delete('/api/checkins/:id', (req, res) => {
  if (!req.query.userId) return res.status(400).json({ error: 'userId is required' });
  if (!deleteCheckin(req.query.userId, Number(req.params.id))) return res.status(404).json({ error: '记录不存在' });
  res.status(204).end();
});

app.put('/api/checkins/:id', (req, res) => {
  const body = req.body || {};
  if (!body.userId || !scenarios.has(body.scenario)) return res.status(400).json({ error: '请提供 userId 和有效情景' });
  const numericFields = ['sleepHours', 'activityMinutes', 'fatigue', 'stress', 'mood'];
  if (numericFields.some(key => !Number.isFinite(Number(body[key])))) return res.status(400).json({ error: '记录数据格式不正确' });
  if (body.sleepHours < 0 || body.sleepHours > 24 || body.activityMinutes < 0 || body.activityMinutes > 1440 || [body.fatigue, body.stress, body.mood].some(value => value < 1 || value > 5)) return res.status(400).json({ error: '记录数据超出合理范围' });
  const vitals = validateVitals(body);
  if (!vitals) return res.status(400).json({ error: '心率、HRV 或呼吸值超出合理范围' });
  const source = validateSource(body);
  if (!source) return res.status(400).json({ error: '记录来源或质量无效；手填记录不能包含实测指标' });
  const recordedAt = new Date(body.recordedAt);
  if (Number.isNaN(recordedAt.getTime()) || recordedAt > new Date(Date.now() + 5 * 60 * 1000)) return res.status(400).json({ error: '记录日期无效。' });
  const checkin = updateCheckin(String(body.userId), Number(req.params.id), {
    recordedAt: recordedAt.toISOString(), sleepHours: Number(body.sleepHours),
    activityMinutes: Math.round(Number(body.activityMinutes)), fatigue: Math.round(Number(body.fatigue)),
    stress: Math.round(Number(body.stress)), mood: Math.round(Number(body.mood)), scenario: body.scenario,
    note: String(body.note || '').trim().slice(0, 300),
    ...vitals, ...source, recoveryScore: null
  });
  if (!checkin) return res.status(404).json({ error: '记录不存在' });
  res.json(toClient(checkin));
});

app.delete('/api/data', (req, res) => {
  if (!req.query.userId) return res.status(400).json({ error: 'userId is required' });
  res.json({ deleted: clearCheckins(String(req.query.userId)) });
});

app.get('/api/export', (req, res) => {
  if (!req.query.userId) return res.status(400).json({ error: 'userId is required' });
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = listCheckins(String(req.query.userId)).map(toClient);
  const csv = ['记录时间,睡眠小时,活动分钟,疲劳,压力,心情,情景,恢复分数,心率bpm,HRVms,呼吸次/分,记录来源,备注', ...rows.map(item => [item.recordedAt, item.sleepHours, item.activityMinutes, item.fatigue, item.stress, item.mood, item.scenario, item.recoveryScore, item.heartRate, item.hrv, item.respiration, item.dataSource, item.note].map(escape).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pulselog-records.csv"');
  res.send(`\uFEFF${csv}`);
});

app.get('/api/dashboard', (req, res) => {
  if (!req.query.userId) return res.status(400).json({ error: 'userId is required' });
  const records = listCheckins(req.query.userId).map(toClient);
  const latest = records[0] || null;
  const sevenDays = records.slice(0, 7);
  const averageScore = sevenDays.length ? Math.round(sevenDays.reduce((sum, item) => sum + item.recoveryScore, 0) / sevenDays.length) : null;
  const median = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  };
  const baselineFor = (key, count) => {
    const matches = records.filter(item => item[key] != null).slice(0, count);
    return matches.length ? { value: median(matches.map(item => item[key])), n: matches.length, updatedAt: matches[0].recordedAt } : null;
  };
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sleep = records.filter(item => new Date(item.recordedAt).getTime() >= weekAgo && item.sleepHours != null);
  const baseline = { heartRate: baselineFor('heartRate', 10), hrv: baselineFor('hrv', 10),
    sleepHours: sleep.length ? { value: median(sleep.map(item => item.sleepHours)), n: sleep.length } : null };
  res.json({ latest, averageScore, trend: sevenDays.reverse(), baseline, disclaimer: '仅供生活节律参考，不提供诊断建议。' });
});

app.get('/api/ai/status', (_req, res) => {
  const maskedKey = aiConfig.apiKey ? `${aiConfig.apiKey.slice(0, 6)}...${aiConfig.apiKey.slice(-4)}` : '';
  res.json({ configured: Boolean(aiConfig.apiKey), provider: aiConfig.provider || 'DeepSeek', model: aiConfig.model, baseUrl: aiConfig.baseUrl, maskedKey });
});

app.get('/api/ai/config', (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ error: '仅限本机配置 AI' });
  const maskedKey = aiConfig.apiKey ? `${aiConfig.apiKey.slice(0, 6)}...${aiConfig.apiKey.slice(-4)}` : '';
  res.json({ configured: Boolean(aiConfig.apiKey), provider: aiConfig.provider || 'DeepSeek', model: aiConfig.model, baseUrl: aiConfig.baseUrl, maskedKey });
});

app.post('/api/ai/config', (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ error: '仅限本机配置 AI' });
  const { apiKey, baseUrl, model, provider } = req.body || {};
  if (baseUrl && !allowedAiUrl(baseUrl)) return res.status(400).json({ error: '仅支持安全的 HTTPS 接口' });
  if (model && (typeof model !== 'string' || !/^[\w./-]{1,100}$/.test(model))) return res.status(400).json({ error: '模型名称无效' });
  const update = {};
  if (typeof apiKey === 'string' && apiKey.trim() !== '') update.apiKey = apiKey.trim();
  if (baseUrl) update.baseUrl = allowedAiUrl(baseUrl);
  if (typeof model === 'string' && model.trim()) update.model = model.trim();
  if (typeof provider === 'string' && provider.trim()) update.provider = provider.trim();
  saveAiConfig(update);
  const maskedKey = aiConfig.apiKey ? `${aiConfig.apiKey.slice(0, 6)}...${aiConfig.apiKey.slice(-4)}` : '';
  res.json({ ok: true, configured: Boolean(aiConfig.apiKey), provider: aiConfig.provider, model: aiConfig.model, baseUrl: aiConfig.baseUrl, maskedKey });
});

app.delete('/api/ai/config', (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ error: '仅限本机配置 AI' });
  aiConfig.apiKey = '';
  res.json({ ok: true, configured: false });
});

app.post('/api/ai/test', async (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ ok: false, error: '仅限本机测试 AI' });
  const key = req.body?.apiKey || aiConfig.apiKey;
  const url = allowedAiUrl(req.body?.baseUrl || aiConfig.baseUrl);
  if (!url) return res.status(400).json({ ok: false, error: '仅支持安全的 HTTPS 接口' });
  const mdl = req.body?.model || aiConfig.model || 'deepseek-chat';
  if (typeof mdl !== 'string' || !/^[\w./-]{1,100}$/.test(mdl)) return res.status(400).json({ ok: false, error: '模型名称无效' });
  if (!key) return res.status(400).json({ ok: false, error: '请先提供或保存 API Key' });

  const testLang = req.body?.lang === 'en' ? 'en' : 'zh';
  const testMsg = testLang === 'en'
    ? 'Hello. Please reply with brief guidance without digits; no saved personal records.'
    : '你好。请用不含数字的简短建议回答；没有个人记录。';

  const result = await askLLM({
    facts: buildFacts([]), message: testMsg,
    lang: testLang, config: { apiKey: key, baseUrl: url, model: mdl }
  });
  if (result.ok) return res.json({
    ok: true, latencyMs: result.meta.latencyMs, model: mdl, sampleReply: result.data.answer
  });
  const reason = result.meta.fallbackReason;
  const status = ({ timeout: 504, rate_limited: 429, bad_key: 401, bad_output: 422, network: 502 })[reason] || 502;
  const errorMap = {
    zh: {
      timeout: '模型响应超时', rate_limited: '模型请求受限，请稍后重试',
      bad_key: '密钥无效或没有该模型的访问权限',
      bad_output: '模型已响应，但未通过对话格式与数据真实性校验',
      network: '无法连接模型服务', default: '模型测试失败'
    },
    en: {
      timeout: 'Model response timed out', rate_limited: 'Model rate limit exceeded, please retry later',
      bad_key: 'Invalid API Key or no access to this model',
      bad_output: 'Model replied but failed output format or verification checks',
      network: 'Failed to connect to model service', default: 'Model test failed'
    }
  };
  const error = errorMap[testLang][reason] || errorMap[testLang].default;
  res.status(status).json({ ok: false, fallbackReason: reason, error });
});

app.get('/api/membership', (req, res) => {
  // 竞赛评审与日常运行默认全量激活，无需付费
  res.json({ active: true, status: 'active', expiresAt: '2099-12-31T23:59:59.000Z', monthlyPrice: 0 });
});

app.post('/api/membership/checkout', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  createAnonymousUser(String(userId));
  if (!process.env.PAYMENT_CHECKOUT_URL) return res.status(503).json({ error: '支付收银台尚未配置。需要接入微信支付或第三方支付平台后才能真实开通。' });
  const url = new URL(process.env.PAYMENT_CHECKOUT_URL);
  url.searchParams.set('userId', String(userId));
  res.json({ checkoutUrl: url.toString() });
});

app.post('/api/membership/test-activate', (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_SUBSCRIPTION !== 'true') {
    return res.status(403).json({ error: '生产环境不允许测试开通。' });
  }
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  res.json({ ...setMembership(String(userId), 'active', expiresAt), testMode: true });
});

app.post('/api/billing/webhook', (req, res) => {
  if (!process.env.BILLING_WEBHOOK_SECRET || req.get('x-billing-secret') !== process.env.BILLING_WEBHOOK_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { userId, status, expiresAt } = req.body || {};
  if (!userId || !['active', 'inactive', 'cancelled'].includes(status)) return res.status(400).json({ error: 'invalid membership payload' });
  res.json(setMembership(String(userId), status, expiresAt));
});

app.post('/api/ai/chat', async (req, res) => {
  const { userId, message, history, lang } = req.body || {};
  if (!userId || typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: '请填写问题' });
  const records = listCheckins(String(userId)).slice(0, 7).map(toClient);
  try {
    const result = await respond({
      records, message: message.trim().slice(0, 500), history,
      lang: lang === 'en' ? 'en' : 'zh', config: aiConfig
    });
    res.json(result);
  } catch (_) {
    const result = await respond({ records, message: message.trim().slice(0, 500), lang: lang === 'en' ? 'en' : 'zh' });
    res.json({ ...result, fallbackReason: 'network' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('[PulseLog Error]', err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || '服务器内部异常，请稍后重试' });
});

const port = process.env.PORT || 3100;
const host = process.env.PULSELOG_HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`PulseLog API running at http://${host}:${port}`));

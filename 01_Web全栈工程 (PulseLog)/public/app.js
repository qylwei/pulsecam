(() => {
  const userKey = 'pulselog-user-id';
  const localVaultKey = 'pulselog_local_vault_records';
  const isStaticHost = window.location.hostname.includes('netlify.app') || window.location.protocol === 'file:' || window.location.hostname.endsWith('.github.io');

  function getLocalRecords() {
    try {
      const raw = localStorage.getItem(localVaultKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      const records = parsed.filter(r => !(r?.userId === 'demo' && Number(r.id) >= 900 && Number(r.id) <= 1006));
      if (records.length !== parsed.length) saveLocalRecords(records);
      return records;
    } catch (_) {}
    return [];
  }

  function saveLocalRecords(list) {
    try { localStorage.setItem(localVaultKey, JSON.stringify(list)); } catch (_) {}
  }

  function calcScore(body) {
    const sleep = Math.min(12, Math.max(0, Number(body.sleepHours)));
    const fatigue = Number(body.fatigue);
    const stress = Number(body.stress);
    const mood = Number(body.mood);
    const base = 50 + Math.round((sleep - 7) * 5) - fatigue * 6 - stress * 5 + mood * 5;
    return Math.min(100, Math.max(10, base));
  }

  // Netlify 纯静态环境无缝 API 仿真拦截器
  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    if (typeof url === 'string' && (url.startsWith('/api/') || url === '/health')) {
      const isDefiniteStatic = window.location.hostname.includes('netlify.app') || window.location.protocol === 'file:' || window.location.hostname.endsWith('.github.io');
      if (!isDefiniteStatic) {
        try {
          const resp = await originalFetch(url, options);
          const ct = resp.headers.get('content-type') || '';
          return resp;
        } catch (_) {
          throw new Error('服务连接失败，请检查后台是否运行；记录未保存。');
        }
      }

      // 进入端侧离线引擎 (Local Vault)
      const method = (options.method || 'GET').toUpperCase();
      const u = new URL(url, window.location.origin);

      if (u.pathname === '/health') {
        return new Response(JSON.stringify({ ok: true, service: 'PulseLog Netlify Edition' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.pathname === '/api/auth/anonymous') {
        let id = localStorage.getItem(userKey) || 'anon_' + Math.random().toString(36).slice(2, 10);
        return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.pathname === '/api/membership') {
        return new Response(JSON.stringify({ active: true, status: 'active', monthlyPrice: 18 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.pathname === '/api/membership/test-activate') {
        return new Response(JSON.stringify({ ok: true, active: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.pathname === '/api/dashboard') {
        const records = getLocalRecords();
        const latest = records[records.length - 1] || null;
        const trend = records.slice(-7);
        const averageScore = records.length ? Math.round(records.reduce((s, i) => s + i.recoveryScore, 0) / records.length) : null;
        return new Response(JSON.stringify({ latest, trend, averageScore, disclaimer: '本地安全沙箱模式运行' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.pathname === '/api/checkins') {
        if (method === 'GET') {
          return new Response(JSON.stringify(getLocalRecords()), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') {
          const body = JSON.parse(options.body || '{}');
          if (!['日常', '面试', '考试', '运动', '经期'].includes(body.scenario) ||
              !body.userId ||
              !['sleepHours', 'activityMinutes', 'fatigue', 'stress', 'mood'].every(key => Number.isFinite(Number(body[key]))) ||
              Number(body.sleepHours) < 0 || Number(body.sleepHours) > 24 ||
              Number(body.activityMinutes) < 0 || Number(body.activityMinutes) > 1440 ||
              [body.fatigue, body.stress, body.mood].some(value => Number(value) < 1 || Number(value) > 5) ||
              (body.dataSource && !['manual', 'scan'].includes(body.dataSource)) ||
              (body.dataSource !== 'scan' && (body.heartRate != null || body.hrv != null)) ||
              (body.heartRate != null && (!Number.isFinite(Number(body.heartRate)) || Number(body.heartRate) < 30 || Number(body.heartRate) > 220)) ||
              (body.hrv != null && (!Number.isFinite(Number(body.hrv)) || Number(body.hrv) < 0 || Number(body.hrv) > 300)) ||
              (body.quality != null && (!Number.isFinite(Number(body.quality)) || Number(body.quality) < 0 || Number(body.quality) > 1))) {
            return new Response(JSON.stringify({ error: '请提供有效情景和合理范围的记录数据' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          }
          const records = getLocalRecords();
          const recScore = calcScore(body);
          const newRecord = {
            id: Date.now(),
            userId: body.userId,
            recordedAt: body.recordedAt || new Date().toISOString(),
            sleepHours: Number(body.sleepHours),
            activityMinutes: Number(body.activityMinutes),
            fatigue: Number(body.fatigue),
            stress: Number(body.stress),
            mood: Number(body.mood),
            scenario: body.scenario,
            note: body.note || '',
            heartRate: body.heartRate == null ? null : Number(body.heartRate),
            hrv: body.hrv == null ? null : Number(body.hrv),
            respiration: null,
            recoveryScore: recScore,
            dataSource: body.dataSource === 'scan' ? 'scan' : 'manual',
            quality: body.quality == null ? null : Number(body.quality),
            provenance: {
              sleepHours: 'manual', activityMinutes: 'manual', fatigue: 'manual', stress: 'manual',
              mood: 'manual', note: 'manual', recoveryScore: 'derived',
              heartRate: body.heartRate == null ? null : 'measured',
              hrv: body.hrv == null ? null : 'measured', respiration: null
            },
            advice: '已记录手填状态；恢复分数为生活记录规则计算，不属于医学评估。'
          };
          records.push(newRecord);
          saveLocalRecords(records);
          return new Response(JSON.stringify(newRecord), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
      }
      if (u.pathname.startsWith('/api/checkins/')) {
        const id = parseInt(u.pathname.split('/').pop());
        if (method === 'DELETE') {
          const records = getLocalRecords().filter(r => r.id !== id);
          saveLocalRecords(records);
          return new Response(null, { status: 204 });
        }
        if (method === 'PUT') {
          const body = JSON.parse(options.body || '{}');
          const records = getLocalRecords();
          const recScore = calcScore(body);
          const index = records.findIndex(r => r.id === id);
          if (index !== -1) {
            records[index] = { ...records[index], ...body, recoveryScore: recScore };
            saveLocalRecords(records);
            return new Response(JSON.stringify(records[index]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
      }
      if (u.pathname === '/api/data' && method === 'DELETE') {
        saveLocalRecords([]);
        return new Response(JSON.stringify({ deleted: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.pathname === '/api/ai/config') {
        if (method !== 'GET') return new Response(JSON.stringify({ error: '纯静态模式不支持配置云端 API，请使用本机服务。' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ configured: false, provider: 'Local', model: '', baseUrl: '', maskedKey: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.pathname === '/api/ai/test') {
        return new Response(JSON.stringify({ ok: false, error: '纯静态模式不支持云端 API 测试。' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.pathname === '/api/ai/chat') {
        const body = JSON.parse(options.body || '{}');
        const records = getLocalRecords().filter(item => item.userId === body.userId);
        const en = body.lang === 'en';
        const hrvQuestion = /hrv|心率变异/.test((body.message || '').toLowerCase());
        const urgent = /胸(口)?疼|胸痛|喘不上气|呼吸困难|自杀|自伤|想死|chest pain|can't breathe|suicid/i.test(body.message || '');
        return new Response(JSON.stringify({
          answer: urgent
            ? (en ? 'Seek urgent in-person medical help or call your local emergency number.' : '这种情况需要当面评估，请尽快就医或拨打当地急救电话。')
            : !records.length
            ? (en ? 'No saved records yet. Complete a daily check-in to receive grounded suggestions.' : '还没有记录。完成今日记录后才能给出有依据的建议。')
            : hrvQuestion
              ? (en ? 'No verified HRV reading is available here. A short scan cannot establish HRV.' : '这里没有可核实的 HRV 测量；短时间扫脸无法推断 HRV。')
              : (en ? 'Use your saved sleep and stress records as context; keep a consistent routine and take breaks.' : '可结合已保存的睡眠和压力记录观察状态，保持规律作息并适时休息。'),
          evidence: [], actions: [], missing: urgent ? [] : !records.length || hrvQuestion ? [{ key: hrvQuestion ? 'hrv' : 'checkin', label: hrvQuestion ? 'HRV' : (en ? 'Daily check-in' : '今日记录') }] : [],
          escalate: urgent, engine: 'local', latencyMs: 0, fallbackReason: null
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return originalFetch(url, options);
  };

  const pages = [...document.querySelectorAll('.phone-card')];
  const overview = document.querySelector('.pg-overview');
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedRecordDate = null;
  let editingRecordId = null;

  function setActivePage(index) {
    window.PulseCamBreathing?.close();
    pages.forEach((page, pageIndex) => page.classList.toggle('is-active', pageIndex === index));
    pages.forEach(page => [...page.querySelectorAll('.nav-tab')].forEach((tab, tabIndex) => tab.classList.toggle('active', tabIndex === index)));
    pages[index]?.querySelector('.card-body')?.scrollTo({ top: 0, behavior: 'instant' });
    if (index !== 1 && typeof window.pulseLogStopCamera === 'function') window.pulseLogStopCamera();
    if (index === 0) {
      setTimeout(() => safeRefreshAll(), 60);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function syncClock() {
    const now = new Date();
    const value = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.querySelectorAll('.status-bar .time').forEach(node => node.textContent = value);
  }

  async function getUserId() {
    let id = null;
    try { id = localStorage.getItem(userKey); } catch (_) {}
    if (!id) {
      try {
        const response = await fetch('/api/auth/anonymous', { method: 'POST' });
        const text = await response.text();
        const data = JSON.parse(text);
        if (data && data.id) id = data.id;
      } catch (_) {}
      if (!id) id = 'usr_' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(userKey, id); } catch (_) {}
    }
    return id;
  }

  function setText(selector, text) {
    const node = overview.querySelector(selector);
    if (node) node.textContent = text;
  }

  function level(score) {
    const isEn = (currentLang === 'en');
    if (score >= 85) return isEn ? 'Excellent · Optimal Recovery' : '状态良好';
    if (score >= 70) return isEn ? 'Good · Well Rested' : '状态平稳';
    if (score >= 55) return isEn ? 'Fair · Moderate Recovery' : '注意休息';
    return isEn ? 'Rest · Recovery Needed' : '建议充分休息';
  }

  function scoreFactorLabel(label, isEn) {
    if (!isEn) return label;
    const scenarioNames = { '日常': 'Daily', '面试': 'Interview', '考试': 'Exam', '运动': 'Workout', '经期': 'Cycle' };
    return label
      .replace(/^基线评分 \(([^)]+)\)$/, (_, scenario) => `Baseline Score (${scenarioNames[scenario] || scenario})`)
      .replace(/^心率变异性 HRV /, 'Heart Rate Variability HRV ')
      .replace(/^即时心率 /, 'Current Heart Rate ')
      .replace(/^睡眠 ([\d.]+) 小时$/, 'Sleep $1 hours')
      .replace(/^身心负荷 \(疲劳(\d+)\/压力(\d+)\)$/, 'Physical Load (Fatigue $1 / Stress $2)')
      .replace(/^状态调节 \(心情等级(\d+)\)$/, 'Mood Adjustment (Level $1)')
      .replace(/^基础状态$/, 'Baseline Status')
      .replace(/^活动 (\d+) 分钟$/, 'Activity $1 minutes')
      .replace(/^疲劳等级 (\d+)$/, 'Fatigue Level $1')
      .replace(/^压力等级 (\d+)$/, 'Stress Level $1')
      .replace(/^心情等级 (\d+)$/, 'Mood Level $1')
      .replace(/^睡眠时长 \(([^)]+)\)$/, 'Sleep Duration ($1)')
      .replace(/^疲劳程度 \(([^)]+)\)$/, 'Fatigue Level ($1)')
      .replace(/^压力负荷 \(([^)]+)\)$/, 'Stress Load ($1)')
      .replace(/^基础活力与情绪$/, 'Baseline Activity & Mood');
  }

  function renderScoreExplanation(latest) {
    let box = overview.querySelector('.score-explanation');
    if (!box) {
      box = document.createElement('div'); box.className = 'checkin-panel score-explanation';
      overview.querySelector('.report-card').after(box);
    }
    const isEn = (currentLang === 'en');
    if (!latest) {
      box.innerHTML = isEn
        ? '<h2>Score Methodology</h2><p>Complete today\'s check-in to inspect factors impacting your recovery score.</p>'
        : '<h2>恢复分数依据</h2><p>完成今日记录后，将展示每项数据对恢复分数的影响。</p>';
      return;
    }
    const factors = latest.scoreBreakdown?.factors || [
      { label: `睡眠时长 (${latest.sleepHours}h)`, points: Math.round((latest.sleepHours - 7) * 5) },
      { label: `疲劳程度 (${latest.fatigue}/5)`, points: -(latest.fatigue * 6) },
      { label: `压力负荷 (${latest.stress}/5)`, points: -(latest.stress * 5) },
      { label: '基础活力与情绪', points: 50 + latest.mood * 5 }
    ];
    const rows = factors.map(item => {
      const label = scoreFactorLabel(item.label, isEn);
      const safeLabel = String(label).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      return `<span>${safeLabel}</span><b>${item.points >= 0 ? '+' : ''}${item.points}</b>`;
    }).join('');
    box.innerHTML = isEn
      ? `<h2>Score Factors · ${latest.recoveryScore} pts</h2><p>Calculated with deterministic rules for easy auditing; not a medical assessment.</p><div class="score-rows">${rows}</div>`
      : `<h2>恢复分数依据 · ${latest.recoveryScore} 分</h2><p>采用固定规则计算，便于核对；不属于医疗评估。</p><div class="score-rows">${rows}</div>`;
  }

  function updateStickyNotes(score, stress) {
    const doSticky = overview.querySelector('.sticky.do .st-tag-row');
    const dontSticky = overview.querySelector('.sticky.dont .st-tag-row');
    if (!doSticky || !dontSticky) return;
    const isEn = (currentLang === 'en');
    if (score >= 80) {
      doSticky.innerHTML = isEn
        ? '<span class="st-tag"><svg class="icon"><use href="#i-book"/></svg>Deep Work</span><span class="st-tag"><svg class="icon"><use href="#i-dumbbell"/></svg>Strength Workout</span><span class="st-tag"><svg class="icon"><use href="#i-brain"/></svg>Key Interview</span>'
        : '<span class="st-tag"><svg class="icon"><use href="#i-book"/></svg>深度学习</span><span class="st-tag"><svg class="icon"><use href="#i-dumbbell"/></svg>力量健身</span><span class="st-tag"><svg class="icon"><use href="#i-brain"/></svg>重要面试</span>';
      dontSticky.innerHTML = isEn
        ? '<span class="st-tag"><svg class="icon"><use href="#i-moon"/></svg>Late Nights</span><span class="st-tag"><svg class="icon"><use href="#i-pulse"/></svg>Overeating</span>'
        : '<span class="st-tag"><svg class="icon"><use href="#i-moon"/></svg>深夜熬夜</span><span class="st-tag"><svg class="icon"><use href="#i-pulse"/></svg>暴饮暴食</span>';
    } else if (score >= 60) {
      doSticky.innerHTML = isEn
        ? '<span class="st-tag"><svg class="icon"><use href="#i-book"/></svg>Routine Work</span><span class="st-tag"><svg class="icon"><use href="#i-dumbbell"/></svg>Light Stretch</span><span class="st-tag"><svg class="icon"><use href="#i-leaf"/></svg>Hydration</span>'
        : '<span class="st-tag"><svg class="icon"><use href="#i-book"/></svg>常规工作</span><span class="st-tag"><svg class="icon"><use href="#i-dumbbell"/></svg>轻度拉伸</span><span class="st-tag"><svg class="icon"><use href="#i-leaf"/></svg>规律补水</span>';
      dontSticky.innerHTML = isEn
        ? '<span class="st-tag"><svg class="icon"><use href="#i-pulse"/></svg>Heavy Workout</span><span class="st-tag"><svg class="icon"><use href="#i-alert"/></svg>Excess Caffeine</span>'
        : '<span class="st-tag"><svg class="icon"><use href="#i-pulse"/></svg>高强训练</span><span class="st-tag"><svg class="icon"><use href="#i-alert"/></svg>过量咖啡</span>';
    } else {
      doSticky.innerHTML = isEn
        ? '<span class="st-tag"><svg class="icon"><use href="#i-leaf"/></svg>Power Nap</span><span class="st-tag"><svg class="icon"><use href="#i-moon"/></svg>Early Bedtime</span><span class="st-tag"><svg class="icon"><use href="#i-brain"/></svg>Deep Breath</span>'
        : '<span class="st-tag"><svg class="icon"><use href="#i-leaf"/></svg>闭目小憩</span><span class="st-tag"><svg class="icon"><use href="#i-moon"/></svg>早睡休整</span><span class="st-tag"><svg class="icon"><use href="#i-brain"/></svg>呼吸放松</span>';
      dontSticky.innerHTML = isEn
        ? '<span class="st-tag"><svg class="icon"><use href="#i-alert"/></svg>Overtime</span><span class="st-tag"><svg class="icon"><use href="#i-pulse"/></svg>Intense Sports</span>'
        : '<span class="st-tag"><svg class="icon"><use href="#i-alert"/></svg>连续加班</span><span class="st-tag"><svg class="icon"><use href="#i-pulse"/></svg>剧烈运动</span>';
    }
  }

  let dashboardRefreshId = 0;
  async function refreshDashboard() {
    const refreshId = ++dashboardRefreshId;
    let dashboard = null;
    try {
      const id = await getUserId();
      const response = await fetch('/api/dashboard?userId=' + encodeURIComponent(id));
      const text = await response.text();
      dashboard = JSON.parse(text);
    } catch (_) {}

    // 静态版从本浏览器读取手填记录；本机服务只显示服务端真实记录。
    if (!dashboard) {
      const localList = isStaticHost ? getLocalRecords() : [];
      const latest = localList[localList.length - 1] || null;
      const trend = localList.slice(-7);
      const averageScore = localList.length ? Math.round(localList.reduce((s, i) => s + i.recoveryScore, 0) / localList.length) : null;
      dashboard = { latest, trend, averageScore };
    }

    if (refreshId !== dashboardRefreshId) return;
    renderTrendChart(dashboard.trend || []);
    renderTrendSummary(dashboard.trend || []);
    const latest = dashboard.latest;
    const gauge = overview.querySelector('.gauge-ring');
    const miniRing = overview.querySelector('.report-top .mini-ring');
    const diHr = document.querySelectorAll('.dynamic-island .di-hr');
    overview.querySelector('.sticky-row').hidden = !latest;
    overview.querySelector('.report-top').hidden = !latest;
    overview.querySelectorAll('.report-card .metric-row').forEach(row => { row.hidden = !latest; });
    overview.querySelector('.twin-card').hidden = !(dashboard.trend || []).length;

    if (!latest) {
      const isEn = currentLang === 'en';
      setText('.g-val', '—');
      setText('.dh-compare', isEn ? 'No Records' : '待记录');
      setText('.dh-status', isEn ? 'No check-in yet · Record today’s status first' : '尚未记录 · 请先完成今日状态记录');
      setText('.ai-advice-box', isEn ? 'Record today to see guidance based on sleep, stress and fatigue.' : '完成今日记录后，这里会显示基于睡眠、压力和疲劳的生活节律建议。');
      setText('.report-top .mr-val', '—');
      setText('.dmm:nth-child(1) .dmm-val', '—'); setText('.dmm:nth-child(2) .dmm-val', '—');
      setText('.dmm:nth-child(3) .dmm-val', '—');
      overview.querySelectorAll('.dmm-source').forEach(node => { node.textContent = isEn ? 'Not measured' : '未测量'; });
      const baselineNode = overview.querySelector('.hr-baseline');
      if (baselineNode) baselineNode.textContent = '';
      overview.querySelectorAll('.dh-stability-bar span').forEach(bar => { bar.className = ''; });
      if (gauge) gauge.style.setProperty('--pct', 0);
      if (miniRing) miniRing.style.setProperty('--pct', 0);
      diHr.forEach(node => { node.textContent = 'PulseCam'; });
      renderScoreExplanation(null);
      return;
    }

    const score = latest.recoveryScore;
    const hr = latest.heartRate;
    const hrv = latest.hrv;
    const sleep = latest.sleepHours == null ? null : Number(latest.sleepHours);
    const stress = latest.stress == null ? null : Number(latest.stress);
    const sourceName = source => currentLang === 'en'
      ? ({ manual: 'Manual', measured: 'Measured', derived: 'Calculated', legacy: 'Unverified' }[source] || '')
      : ({ manual: '手填', measured: '实测', derived: '推算', legacy: '旧记录' }[source] || '');
    overview.querySelectorAll('.dmm').forEach((node, index) => {
      let origin = node.querySelector('.dmm-source');
      if (!origin) {
        origin = document.createElement('small');
        origin.className = 'dmm-source';
        origin.style.color = 'var(--ink-mute)';
        node.append(origin);
      }
      const key = ['hrv', 'heartRate', 'sleepHours'][index];
      const available = latest[key] != null;
      origin.textContent = available ? sourceName(latest.provenance?.[key] || (key === 'sleepHours' ? 'manual' : 'measured'))
        : (currentLang === 'en' ? 'Not measured' : '未测量');
    });

    diHr.forEach(node => { node.textContent = hr == null ? 'PulseCam' : `${hr} bpm`; });
    setText('.g-val', score);
    if (gauge) gauge.style.setProperty('--pct', score);
    setText('.dh-status', level(score));

    const trend = dashboard.trend || [];
    let compareText = currentLang === 'en' ? 'First Record' : '首次记录';
    let trendBadgeText = currentLang === 'en' ? 'First Record' : '首次记录';
    if (trend.length >= 2) {
      const yesterday = trend[trend.length - 2];
      const diff = score - yesterday.recoveryScore;
      if (diff > 0) {
        compareText = (currentLang === 'en') ? `vs Yesterday ↑${diff}` : `较昨日 ↑${diff}`;
        trendBadgeText = (currentLang === 'en') ? `↑ ${diff} pts vs Yesterday` : `↑ ${diff}分 对比昨日`;
      } else if (diff < 0) {
        compareText = (currentLang === 'en') ? `vs Yesterday ↓${Math.abs(diff)}` : `较昨日 ↓${Math.abs(diff)}`;
        trendBadgeText = (currentLang === 'en') ? `↓ ${Math.abs(diff)} pts vs Yesterday` : `↓ ${Math.abs(diff)}分 对比昨日`;
      } else {
        compareText = (currentLang === 'en') ? 'vs Yesterday Par' : '较昨日 持平';
        trendBadgeText = (currentLang === 'en') ? 'Par vs Yesterday' : '持平 对比昨日';
      }
    }
    setText('.dh-compare', compareText);
    const rtTrend = overview.querySelector('.rt-trend');
    if (rtTrend) {
      rtTrend.innerHTML = `<svg class="icon" style="font-size:11px"><use href="#i-pulse"/></svg>${trendBadgeText}`;
    }

    const stabilityBars = overview.querySelectorAll('.dh-stability-bar span');
    if (stabilityBars.length) {
      const onCount = Math.max(1, Math.min(11, Math.round((score / 100) * 11)));
      stabilityBars.forEach((bar, idx) => {
        bar.className = idx < onCount ? (idx >= 8 ? 'on warm' : 'on') : '';
      });
    }

    setText('.dmm:nth-child(1) .dmm-val', hrv == null ? '—' : hrv + 'ms');
    setText('.dmm:nth-child(2) .dmm-val', hr == null ? '—' : hr + 'bpm');
    setText('.dmm:nth-child(3) .dmm-val', sleep == null ? '—' : sleep + 'h');
    const hrBaseline = dashboard.baseline?.heartRate?.value;
    let baselineNode = overview.querySelector('.hr-baseline');
    if (!baselineNode) {
      baselineNode = document.createElement('small');
      baselineNode.className = 'hr-baseline';
      baselineNode.style.color = 'var(--ink-mute)';
      overview.querySelector('.dh-mini-metrics .dmm:nth-child(2)')?.append(baselineNode);
    }
    baselineNode.textContent = hr != null && hrBaseline != null && dashboard.baseline.heartRate.n >= 3
      ? (currentLang === 'en' ? `vs baseline ${hr - hrBaseline > 0 ? '+' : ''}${hr - hrBaseline} bpm` : `较基线 ${hr - hrBaseline > 0 ? '+' : ''}${hr - hrBaseline} bpm`)
      : '';
    setText('.dmm:nth-child(1) .dmm-lbl', 'HRV');
    setText('.dmm:nth-child(2) .dmm-lbl', (currentLang === 'en') ? 'Resting HR' : '静息心率');
    setText('.dmm:nth-child(3) .dmm-lbl', (currentLang === 'en') ? 'Sleep' : '睡眠');

    updateStickyNotes(score, stress);

    setText('.report-top .mr-val', score);
    if (miniRing) miniRing.style.setProperty('--pct', score);
    const isEn = (currentLang === 'en');
    const defaultAdviceZh = latest.advice || '保持规律作息，避免熬夜。';
    let defaultAdvice = defaultAdviceZh;
    if (isEn) {
      if (defaultAdviceZh.includes('状态平稳') || defaultAdviceZh.includes('规律作息')) {
        defaultAdvice = 'Physiological state stable. Maintain regular tempo and stretch gently.';
      } else if (defaultAdviceZh.includes('整体恢复状态优秀') || defaultAdviceZh.includes('高效学习')) {
        defaultAdvice = 'Optimal overall recovery. Ideal for deep work and high focus in the afternoon; keep regular tempo tonight.';
      } else {
        defaultAdvice = 'Circadian rhythm balanced. Keep consistent bedtime and stay hydrated.';
      }
    }
    setText('.ai-advice-box', defaultAdvice);

    const metricRows = overview.querySelectorAll('.report-card .metric-row');
    if (metricRows[0]) {
      const nameEl = metricRows[0].querySelector('.mr-name');
      if (nameEl) {
        const sleepTagZh = sleep >= 7 ? '充足良好' : (sleep >= 6 ? '基本达标' : '偏少欠缺');
        const sleepTagEn = sleep >= 7 ? 'Optimal' : (sleep >= 6 ? 'Adequate' : 'Deficit');
        const sleepTag = isEn ? sleepTagEn : sleepTagZh;
        const color = sleep >= 7 ? 'var(--sage-d)' : (sleep >= 6 ? 'var(--gold-d)' : 'var(--coral-d)');
        const sleepTitle = isEn ? 'Sleep Recovery' : '睡眠恢复';
        nameEl.innerHTML = sleep == null ? `${sleepTitle} —` : `${sleepTitle} <span style="color:${color};font-weight:600">${sleepTag} (${sleep}h)</span>`;
        const mark = document.createElement('small');
        mark.style.color = 'var(--ink-mute)';
        mark.textContent = sleep == null ? '' : ` · ${sourceName(latest.provenance?.sleepHours || 'manual')}`;
        nameEl.append(mark);
      }
      const tickSpans = metricRows[0].querySelectorAll('.tick-bar span');
      const filled = Math.max(1, Math.min(10, Math.round((sleep / 9) * 10)));
      tickSpans.forEach((s, i) => { s.className = i < filled ? 'on' : ''; });
    }
    if (metricRows[1]) {
      const nameEl = metricRows[1].querySelector('.mr-name');
      if (nameEl) {
        const stressTagZh = stress <= 2 ? '偏低平稳' : (stress >= 4 ? '偏高需放松' : '适中稳定');
        const stressTagEn = stress <= 2 ? 'Low & Calm' : (stress >= 4 ? 'Elevated' : 'Moderate');
        const stressTag = isEn ? stressTagEn : stressTagZh;
        const color = stress <= 2 ? 'var(--sage-d)' : (stress >= 4 ? 'var(--coral-d)' : 'var(--gold-d)');
        const stressTitle = isEn ? 'Stress Level' : '压力水平';
        nameEl.innerHTML = stress == null ? `${stressTitle} —` : `${stressTitle} <span style="color:${color};font-weight:600">${stressTag}</span>`;
        const mark = document.createElement('small');
        mark.style.color = 'var(--ink-mute)';
        mark.textContent = stress == null ? '' : ` · ${sourceName(latest.provenance?.stress || 'manual')}`;
        nameEl.append(mark);
      }
      const tickSpans = metricRows[1].querySelectorAll('.tick-bar span');
      const filled = Math.max(1, Math.min(10, stress * 2));
      tickSpans.forEach((s, i) => { s.className = i < filled ? (stress >= 4 ? 'on warn' : 'on') : ''; });
    }

    renderScoreExplanation(latest);
  }

  function renderTrendChart(trend) {
    const canvas = overview.querySelector('#twinCanvas1');
    const title = overview.querySelector('.twin-card .card-label');
    if (!canvas || !title) return;
    const isEn = (currentLang === 'en');
    title.innerHTML = `<svg class="icon"><use href="#i-sync"/></svg>${isEn ? '7-Day Record Trends' : '近 7 天记录趋势'}`;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
    const w = Math.max(300, rect.width || parentW || 340);
    const h = 124;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // 1. 生成近 7 天完整自然日序列 (D-6 到 今天)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const m = d.getMonth() + 1;
      const dayNum = d.getDate();
      const label = i === 0 ? '今天' : `${m}/${dayNum}`;
      const dateKey = `${d.getFullYear()}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({ date: d, label, key: dateKey, record: null });
    }

    // 2. 将传入的 trend 记录对齐到对应日期
    if (Array.isArray(trend)) {
      trend.forEach(item => {
        if (!item || !item.recordedAt) return;
        const rDate = new Date(item.recordedAt);
        const rKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
        const target = days.find(d => d.key === rKey);
        if (target) {
          target.record = item;
        }
      });
    }

    // 3. 布局区域定义
    const padL = 26, padR = 20, padT = 16, padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // 绘制参考区间带
    const bandYTop = padT + (1 - 85 / 100) * plotH;
    const bandYBot = padT + (1 - 60 / 100) * plotH;
    ctx.fillStyle = 'rgba(124, 154, 130, 0.10)';
    ctx.fillRect(padL, bandYTop, plotW, bandYBot - bandYTop);

    // 绘制基准网格虚线 (25, 50, 75 分)
    ctx.strokeStyle = 'rgba(35, 28, 15, 0.06)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 4]);
    [25, 50, 75].forEach(val => {
      const y = padT + (1 - val / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 刻度文字
    ctx.fillStyle = '#9C978B';
    ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('85', padL - 4, bandYTop + 3);
    ctx.fillText('60', padL - 4, bandYBot + 3);

    // 计算各天的 X 轴位置并渲染底部日期标签
    days.forEach((day, i) => {
      day.x = padL + (i / (days.length - 1)) * plotW;
      ctx.fillStyle = i === 6 ? '#23221E' : '#8A8578';
      ctx.font = i === 6 ? 'bold 10px -apple-system, sans-serif' : '9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(day.label, day.x, h - 8);
    });

    const recordedDays = days.filter(d => d.record !== null);

    if (recordedDays.length === 0) {
      ctx.fillStyle = '#8A8578';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('完成今日记录后，将实时生成近 7 天真实走势', w / 2, h / 2 - 2);
      return;
    }

    // 绘制睡眠虚线趋势 (以 10 小时为 100 分满刻度)
    ctx.strokeStyle = '#7C9A82';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    let sleepInit = false;
    days.forEach(day => {
      if (day.record) {
        const val = day.record.sleepHours == null ? null : Math.min(100, Math.max(0, day.record.sleepHours * 10));
        const y = padT + (1 - val / 100) * plotH;
        if (!sleepInit) { ctx.moveTo(day.x, y); sleepInit = true; } else { ctx.lineTo(day.x, y); }
      }
    });
    if (sleepInit) ctx.stroke();

    // 绘制压力反向走势虚线 (压力 1->90分, 5->15分)
    ctx.strokeStyle = '#9C8FB2';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    let stressInit = false;
    days.forEach(day => {
      if (day.record) {
        const val = Math.min(100, Math.max(0, 100 - (day.record.stress || 3) * 18));
        const y = padT + (1 - val / 100) * plotH;
        if (!stressInit) { ctx.moveTo(day.x, y); stressInit = true; } else { ctx.lineTo(day.x, y); }
      }
    });
    if (stressInit) ctx.stroke();
    ctx.setLineDash([]);

    // 绘制核心恢复指数实线与渐变
    const pts = [];
    days.forEach(day => {
      if (day.record) {
        const score = Math.min(100, Math.max(0, day.record.recoveryScore || 60));
        const y = padT + (1 - score / 100) * plotH;
        pts.push({ x: day.x, y, score, day });
      }
    });

    if (pts.length > 0) {
      // 如果有点，绘制连线与渐变
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[pts.length - 1].x, padT + plotH);
        ctx.lineTo(pts[0].x, padT + plotH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, 'rgba(35, 34, 30, 0.12)');
        grad.addColorStop(1, 'rgba(35, 34, 30, 0.00)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = '#23221E';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // 绘制打卡日圆点与分数标签
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#23221E';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#23221E';
        ctx.font = 'bold 10px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.score, p.x, p.y - 7);
      });
    }

    // 对未打卡自然日渲染浅灰色微小定位点
    days.forEach(day => {
      if (!day.record) {
        ctx.beginPath();
        ctx.arc(day.x, padT + (1 - 70 / 100) * plotH, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(156, 151, 139, 0.3)';
        ctx.fill();
      }
    });
  }

  function renderTrendSummary(trend) {
    const report = overview.querySelector('.trend-report');
    if (!report) return;
    report.hidden = !trend.length;
    const isEn = (currentLang === 'en');
    if (!trend.length) {
      report.innerHTML = isEn
        ? '<div class="tr-head"><div class="tr-title">7-Day Analysis</div><div class="tr-badge">Pending</div></div><div class="tr-note">Check in sleep, stress, and mood to generate real trends here.</div>'
        : '<div class="tr-head"><div class="tr-title">近 7 天记录分析</div><div class="tr-badge">待记录</div></div><div class="tr-note">连续记录睡眠、压力和心情后，这里会生成真实趋势总结。</div>';
      return;
    }
    const average = key => trend.reduce((sum, item) => sum + (Number(item[key]) || 0), 0) / trend.length;
    const avgSleep = average('sleepHours'); const avgStress = average('stress'); const avgRecovery = Math.round(average('recoveryScore'));
    const change = trend.length > 1 ? trend[trend.length - 1].recoveryScore - trend[0].recoveryScore : 0;
    let conclusion = '';
    if (isEn) {
      conclusion = avgSleep < 6.5 ? 'Sleep has been relatively low over past 7 days; prioritize earlier bedtime.' : avgStress >= 3.5 ? 'Stress load elevated; consider micro-breaks and pacing tasks.' : 'Records indicate balanced circadian baseline; maintain your current tempo.';
    } else {
      conclusion = avgSleep < 6.5 ? '近 7 天睡眠偏少，建议优先稳定入睡时间。' : avgStress >= 3.5 ? '近 7 天压力偏高，可安排短时放松和分段完成任务。' : '记录显示状态总体稳定，建议继续保持当前节律。';
    }
    const changeText = isEn
      ? `Recovery score shifted by ${change >= 0 ? '+' : '-'}${Math.abs(change)} pts since start. ${conclusion}`
      : `恢复指数较首日 ${change >= 0 ? '提升' : '下降'} ${Math.abs(change)} 分。${conclusion}`;
    report.innerHTML = isEn
      ? `<div class="tr-head"><div class="tr-title">Past ${trend.length}-Day Analysis</div><div class="tr-badge">Manual Records</div></div><div class="trend-summary-grid"><div><b>${avgRecovery}</b><span>Avg Status Score</span></div><div><b>${avgSleep.toFixed(1)}h</b><span>Avg Sleep</span></div><div><b>${avgStress.toFixed(1)}/5</b><span>Avg Stress</span></div></div><div class="tr-note">${changeText}</div>`
      : `<div class="tr-head"><div class="tr-title">近 ${trend.length} 天记录分析</div><div class="tr-badge">手填记录</div></div><div class="trend-summary-grid"><div><b>${avgRecovery}</b><span>平均状态分</span></div><div><b>${avgSleep.toFixed(1)}h</b><span>平均睡眠</span></div><div><b>${avgStress.toFixed(1)}/5</b><span>平均压力</span></div></div><div class="tr-note">${changeText}</div>`;
  }

  async function refreshCalendar() {
    let records = [];
    try {
      const id = await getUserId();
      const response = await fetch('/api/checkins?userId=' + encodeURIComponent(id));
      const text = await response.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) records = data;
    } catch (_) {}

    if (isStaticHost && records.length === 0) {
      records = getLocalRecords();
    }

    const now = new Date();
    const year = calendarCursor.getFullYear(); const month = calendarCursor.getMonth();
    const checked = new Set(records.map(record => {
      const date = new Date(record.recordedAt);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }));
    const grid = overview.querySelector('#calDays');
    const label = overview.querySelector('.cal-month-label');
    const stat = overview.querySelector('.stat-done');
    if (!grid || !label || !stat) return;
    label.textContent = `${year} · ${month + 1}月`;
    grid.innerHTML = '';
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    for (let index = 0; index < firstDay; index += 1) grid.append(document.createElement('div'));
    let count = 0;
    for (let day = 1; day <= days; day += 1) {
      const cell = document.createElement('div'); cell.className = 'cal-day';
      const number = document.createElement('span'); number.className = 'cal-day-num'; number.textContent = day;
      const dot = document.createElement('span'); dot.className = 'cal-day-dot';
      const dateKey = `${year}-${month}-${day}`; const hasRecord = checked.has(dateKey);
      if (hasRecord) { dot.classList.add('dot-done'); count += 1; } else { dot.classList.add('dot-miss'); }
      const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
      if (isToday) dot.className = hasRecord ? 'cal-day-dot dot-today dot-done' : 'cal-day-dot dot-today';
      cell.append(number, dot); cell.tabIndex = 0; cell.setAttribute('role', 'button');
      const selected = new Date(year, month, day);
      cell.addEventListener('click', () => {
        const record = records.find(item => {
          const date = new Date(item.recordedAt);
          return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === dateKey;
        });
        if (record) {
          showRecordDetail(record, selected);
        } else {
          selectedRecordDate = selected;
          editingRecordId = null;
          setActivePage(1);
          updateRecordDateLabel();
          const form = document.querySelector('.pg-measure .checkin-panel');
          if (form) {
            form.classList.add('show');
            setTimeout(() => form.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
          }
        }
      });
      grid.append(cell);
    }
    stat.textContent = `● 已打卡 ${count} 天`;
    const total = overview.querySelector('.stat-total'); if (total) total.textContent = `${days} 天`;
  }

  function updateRecordDateLabel() {
    const panel = document.querySelector('.pg-measure .checkin-panel');
    if (!panel) return;
    const date = selectedRecordDate || new Date();
    panel.querySelector('h2').textContent = currentLang === 'en'
      ? `Record Status · ${date.toLocaleDateString('en-US')}`
      : `记录 ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 状态`;
  }

  function showRecordDetail(record, date) {
    const modal = document.createElement('section');
    modal.className = 'record-detail';
    const hr = record.heartRate == null ? '—' : `${record.heartRate} bpm`;
    const hrv = record.hrv == null ? '—' : `${record.hrv} ms`;
    const resp = record.respiration == null ? '—' : `${record.respiration} 次`;
    const en = currentLang === 'en';
    const source = record.dataSource === 'manual' ? (en ? 'Manual entry' : '手填记录') : (en ? 'Unverified legacy entry' : '历史记录（来源未核验）');
    const labels = en ? ['Sleep', 'Activity', 'Fatigue', 'Stress', 'Mood', 'Score', 'Heart rate', 'HRV', 'Breathing'] : ['睡眠', '活动', '疲劳', '压力', '心情', '恢复分', '心率', 'HRV', '呼吸'];
    const title = en ? date.toLocaleDateString('en-US') + ' Record' : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日记录`;
    const scenario = en ? (i18nDict.en.scenarios[record.scenario] || record.scenario) : record.scenario;
    modal.innerHTML = `<div class="record-detail-card"><h2>${title}</h2><p>${en ? 'Recovery Score' : '恢复分数'} ${record.recoveryScore} ${en ? 'pts' : '分'} · ${scenario} · ${source}</p><div class="detail-grid"><div><b>${record.sleepHours}h</b>${labels[0]}</div><div><b>${record.activityMinutes}m</b>${labels[1]}</div><div><b>${record.fatigue}/5</b>${labels[2]}</div><div><b>${record.stress}/5</b>${labels[3]}</div><div><b>${record.mood}/5</b>${labels[4]}</div><div><b>${record.recoveryScore}</b>${labels[5]}</div><div><b>${hr}</b>${labels[6]}</div><div><b>${hrv}</b>${labels[7]}</div><div><b>${resp}</b>${labels[8]}</div></div><p class="detail-note"></p><div class="detail-actions"><button class="detail-edit">${en ? 'Edit' : '编辑记录'}</button><button class="detail-delete">${en ? 'Delete' : '删除记录'}</button></div><button class="detail-close">${en ? 'Close' : '关闭'}</button></div>`;
    modal.querySelector('.detail-note').textContent = record.note || (en ? 'No notes' : '没有备注'); document.body.append(modal);
    const close = () => modal.remove(); modal.querySelector('.detail-close').addEventListener('click', close);
    modal.querySelector('.detail-edit').addEventListener('click', () => {
      selectedRecordDate = date;
      editingRecordId = record.id;
      const form = document.querySelector('.pg-measure .checkin-panel');
      ['sleepHours','activityMinutes','fatigue','stress','mood','scenario','note'].forEach(key => {
        if (form && form.elements[key]) form.elements[key].value = record[key] ?? '';
      });
      if (form) {
        form.elements.scenario.dataset.code = record.scenario;
        form.elements.scenario.value = en ? (i18nDict.en.scenarios[record.scenario] || record.scenario) : record.scenario;
      }
      updateRecordDateLabel();
      close();
      setActivePage(1);
      if (form) {
        form.classList.add('show');
        setTimeout(() => form.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    });
    modal.querySelector('.detail-delete').addEventListener('click', async () => { if (!window.confirm(en ? 'Delete this record?' : '确定删除这条记录吗？')) return; const userId = await getUserId(); const response = await fetch('/api/checkins/' + record.id + '?userId=' + encodeURIComponent(userId), { method: 'DELETE' }); if (response.ok) { close(); await refreshDashboard(); await refreshCalendar(); } });
  }

  function setupCalendarNavigation() {
    const navs = overview.querySelectorAll('.cal-month-nav');
    if (navs.length < 2) return;
    navs[0].addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); refreshCalendar(); });
    navs[1].addEventListener('click', () => { const next = new Date(calendarCursor); next.setMonth(next.getMonth() + 1); if (next <= new Date(new Date().getFullYear(), new Date().getMonth(), 1)) { calendarCursor = next; refreshCalendar(); } });
  }

  function buildCheckinForm() {
    const body = document.querySelector('.pg-measure #measureBody');
    const panel = document.createElement('form');
    panel.className = 'checkin-panel manual-checkin';
    panel.innerHTML = `<h2>记录今日状态</h2><p>填写真实感受后，将保存到本机数据库并更新概览。不是医疗诊断。</p>
      <div class="field-grid">
        <label>昨晚睡眠（小时）<input name="sleepHours" type="number" min="0" max="24" step="0.5" required></label>
        <label>活动时长（分钟）<input name="activityMinutes" type="number" min="0" max="1440" required></label>
        <label>疲劳（1低 — 5高）<input name="fatigue" type="number" min="1" max="5" required></label>
        <label>压力（1低 — 5高）<input name="stress" type="number" min="1" max="5" required></label>
        <label>心情（1低 — 5好）<input name="mood" type="number" min="1" max="5" required></label>
        <label>情景<input name="scenario" value="日常" readonly></label>
      </div>
      <label>备注（可不填）<textarea name="note" maxlength="300" placeholder="例如：下午有一场考试"></textarea></label>
      <button class="save-checkin" type="submit">保存今日记录</button><div class="checkin-result"></div>`;
    body.appendChild(panel);
    const scenarioInput = panel.elements.scenario;
    scenarioInput.dataset.code = '日常';
    document.querySelectorAll('#scenarioPills .scenario-pill').forEach(button => button.addEventListener('click', () => {
      scenarioInput.dataset.code = button.dataset.scenario;
      scenarioInput.value = currentLang === 'en' ? i18nDict.en.scenarios[button.dataset.scenario] : button.dataset.scenario;
    }));
    panel.addEventListener('submit', async event => {
      event.preventDefault();
      const result = panel.querySelector('.checkin-result');
      const payload = Object.fromEntries(new FormData(panel));
      payload.scenario = scenarioInput.dataset.code;
      ['sleepHours', 'activityMinutes', 'fatigue', 'stress', 'mood'].forEach(key => payload[key] = Number(payload[key]));
      if (payload.heartRate) {
        payload.heartRate = Number(payload.heartRate);
        payload.dataSource = 'scan';
        payload.quality = Number(panel.dataset.scanQuality);
        if (panel.dataset.scanHrv) payload.hrv = Number(panel.dataset.scanHrv);
      }
      try {
        payload.userId = await getUserId();
        payload.recordedAt = (selectedRecordDate || new Date()).toISOString();
        const response = await fetch(editingRecordId ? '/api/checkins/' + editingRecordId : '/api/checkins', { method: editingRecordId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const text = await response.text();
        let saved = {};
        try { saved = JSON.parse(text); } catch (_) {}
        if (!response.ok) throw new Error(saved.error || '保存失败');
        result.textContent = currentLang === 'en'
          ? `${editingRecordId ? 'Updated' : 'Saved'} · Recovery Score ${saved.recoveryScore} pts. Updating overview...`
          : `${editingRecordId ? '已更新' : '已保存'}！恢复分数 ${saved.recoveryScore} 分。正在同步至首页...`;
        editingRecordId = null;
        panel.querySelector('input[name="heartRate"]')?.remove();
        delete panel.dataset.scanQuality;
        delete panel.dataset.scanHrv;
        result.style.display = 'block';
        calendarCursor = new Date((selectedRecordDate || new Date()).getFullYear(), (selectedRecordDate || new Date()).getMonth(), 1);
        await refreshDashboard();
        await refreshCalendar();
        setTimeout(() => setActivePage(0), 700);
      } catch (error) {
        result.textContent = error.message;
        result.style.display = 'block';
      }
    });
  }

  function makeAssistantHonest() { window.PulseCamAI?.mount(); }

  function setupPrivacyTools() {
    const body = document.querySelector('.pg-settings .card-body');
    if (!body) return;
    let panel = body.querySelector('.checkin-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'checkin-panel';
      body.append(panel);
    }
    const isEn = (currentLang === 'en');
    panel.innerHTML = `
      <h2>${isEn ? 'Data & Privacy' : '数据与隐私'}</h2>
      <p>${isEn ? 'Web records are stored on this machine. If you send a question to a cloud AI model, the question and recent 7-day record summary are sent to that provider.' : 'Web 记录保存在本机；主动使用云端 AI 时，问题及近 7 天记录摘要会发送给所选服务。'}</p>
      <button class="save-checkin export-data" type="button">${isEn ? 'Export My Records (CSV)' : '导出我的记录（CSV）'}</button>
      <button class="privacy-clear" type="button">${isEn ? 'Wipe All Health Data' : '清空全部记录'}</button>
      <div class="checkin-result"></div>
    `;
    const result = panel.querySelector('.checkin-result');
    panel.querySelector('.export-data').addEventListener('click', async () => { window.location.href = '/api/export?userId=' + encodeURIComponent(await getUserId()); });
    panel.querySelector('.privacy-clear').addEventListener('click', async () => {
      if (!window.confirm(isEn ? 'Are you sure you want to wipe all records? This cannot be undone.' : '确定清空全部日常记录吗？此操作不能撤销。')) return;
      const userId = await getUserId(); const response = await fetch('/api/data?userId=' + encodeURIComponent(userId), { method: 'DELETE' });
      const data = await response.json(); result.textContent = isEn ? `Deleted ${data.deleted || 0} records.` : `已清空 ${data.deleted || 0} 条记录。`; result.style.display = 'block'; refreshDashboard();
    });
  }

  let settingsRenderId = 0;
  let cachedTypedApiKey = '';

  const AI_PROVIDERS = [
    {
      id: 'deepseek',
      nameZh: 'DeepSeek 官方 API (推荐)',
      nameEn: 'DeepSeek Official API (Recommended)',
      provider: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      hintZh: '推荐使用 · 支持 DeepSeek-V3 与 DeepSeek-R1',
      hintEn: 'Recommended · Supports DeepSeek-V3 & DeepSeek-R1'
    },
    {
      id: 'openai',
      nameZh: 'OpenAI 官方 API',
      nameEn: 'OpenAI Official API',
      provider: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      hintZh: '国际标准接口 · 支持 GPT-4o-mini / GPT-4o',
      hintEn: 'Global standard API · Supports GPT-4o-mini & GPT-4o'
    },
    {
      id: 'qwen',
      nameZh: '通义千问 (阿里云百炼 DashScope)',
      nameEn: 'Alibaba Qwen (DashScope API)',
      provider: 'Qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      hintZh: '阿里云官方接口 · 支持 qwen-plus / qwen-turbo',
      hintEn: 'Alibaba Cloud official API · Supports qwen-plus / qwen-turbo'
    },
    {
      id: 'glm',
      nameZh: '智谱清言 (智谱 BigModel 开放平台)',
      nameEn: 'Zhipu GLM (BigModel API)',
      provider: 'GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-flash',
      hintZh: '智谱开放平台 · 支持 glm-4-flash / glm-4',
      hintEn: 'Zhipu AI official platform · Supports glm-4-flash / glm-4'
    },
    {
      id: 'moonshot',
      nameZh: '月之暗面 (Kimi / Moonshot API)',
      nameEn: 'Moonshot Kimi (Moonshot API)',
      provider: 'Moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1-8k',
      hintZh: 'Kimi 开放接口 · 支持 moonshot-v1-8k',
      hintEn: 'Kimi Moonshot official API · Supports moonshot-v1-8k'
    },
    {
      id: 'siliconflow',
      nameZh: '硅基流动 (SiliconFlow 开放平台)',
      nameEn: 'SiliconFlow Cloud API',
      provider: 'SiliconFlow',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'deepseek-ai/DeepSeek-V3',
      hintZh: '主流开源模型托管 · 支持 DeepSeek-V3 / R1 与 Qwen2.5',
      hintEn: 'Fast model hosting · Supports DeepSeek-V3 / R1 & Qwen2.5'
    },
    {
      id: 'custom',
      nameZh: '自定义兼容接口 (OpenAI 格式)',
      nameEn: 'Custom OpenAI-Compatible API',
      provider: 'Custom',
      baseUrl: '',
      model: '',
      hintZh: '适用于任何自建反代或 OpenAI 兼容的 HTTPS 接口',
      hintEn: 'Compatible with any custom OpenAI-format HTTPS endpoint'
    }
  ];

  const AI_ERRORS = {
    zh: {
      timeout: '模型响应超时',
      rate_limited: '模型请求受限，请稍后重试',
      bad_key: '密钥无效或没有该模型的访问权限',
      bad_output: '模型已响应，但未通过对话格式与数据真实性校验',
      network: '无法连接模型服务',
      default: '请检查 API Key 和服务商'
    },
    en: {
      timeout: 'Model response timed out',
      rate_limited: 'Model rate limit exceeded, please retry later',
      bad_key: 'Invalid API Key or no access to this model',
      bad_output: 'Model replied but failed output format or verification checks',
      network: 'Failed to connect to model service',
      default: 'Please check API Key and provider'
    }
  };

  async function setupRealSettings() {
    const body = document.querySelector('.pg-settings .card-body');
    if (!body) return;
    const existingKeyInput = body.querySelector('#aiApiKeyInput');
    if (existingKeyInput && existingKeyInput.value) {
      cachedTypedApiKey = existingKeyInput.value;
    }
    const renderId = ++settingsRenderId;
    body.querySelectorAll('.panel-group, .standby-preview, .lang-setting-card, .ai-config-panel, .system-status-panel').forEach(node => node.remove());

    // 1. 国际化语言切换卡片 (原生设置页分段选择器)
    const langPanel = document.createElement('section');
    langPanel.className = 'lang-setting-card';
    langPanel.innerHTML = `
      <div class="lang-setting-header">
        <div class="lang-setting-title">
          <svg class="icon" style="font-size:16px"><use href="#i-sync"/></svg>
          <span id="langCardTitle">${currentLang === 'zh' ? '界面语言与国际化' : 'Language & Localization'}</span>
        </div>
        <span class="cb-badge" style="background:var(--sage-l);color:var(--sage-d)">i18n</span>
      </div>
      <div class="lang-setting-desc" id="langCardDesc">
        ${currentLang === 'zh' ? '支持中英文全界面切换，专为第十四届数媒竞赛国际赛道设计。' : 'Switch between Chinese and English, tailored for the International Competition Track.'}
      </div>
      <div class="lang-seg-control">
        <button type="button" class="lang-seg-btn ${currentLang === 'zh' ? 'active' : ''}" data-lang="zh">
          <span>🇨🇳</span> 简体中文
        </button>
        <button type="button" class="lang-seg-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en">
          <span>🌐</span> English
        </button>
      </div>
    `;
    // 插入到设置页标题之后、会员卡片之前
    const titleHeader = body.querySelector('div:first-child');
    if (titleHeader) {
      titleHeader.after(langPanel);
    } else {
      body.prepend(langPanel);
    }

    // 绑定语言切换分段按钮事件
    langPanel.querySelectorAll('.lang-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetLang = btn.getAttribute('data-lang');
        if (targetLang === currentLang) return;
        langPanel.querySelectorAll('.lang-seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyLanguage(targetLang);
      });
    });

    // 2. 大模型接入与连通性测试卡片
    const isEn = (currentLang === 'en');
    const aiPanel = document.createElement('section');
    aiPanel.className = 'ai-config-panel';
    aiPanel.innerHTML = `
      <h2><span id="aiPanelH2Title">${isEn ? 'AI Model Connection' : 'AI 大模型接入'}</span><span class="cb-badge" id="aiStatusBadge">${isEn ? 'Local rules' : '本地规则'}</span></h2>
      <p id="aiPanelH2Desc">${isEn ? 'Connect an official or compatible model API. The key is kept in this server process only; re-enter it after restarting. Without a key, local rules respond.' : '可选接入官方或兼容模型接口。密钥仅保存在当前服务进程，重启后需重新填写；未配置时由本地规则回复。'}</p>
      <div class="ai-input-group">
        <label id="lblProvider">${isEn ? 'AI Provider & Preset' : '模型服务商与预设'}</label>
        <select id="aiProviderSelect">
          ${AI_PROVIDERS.map(p => `<option value="${p.id}">${isEn ? p.nameEn : p.nameZh}</option>`).join('')}
        </select>
        <div class="ai-provider-hint" id="aiProviderHint" style="font-size:11px;color:var(--ink-mute);margin-top:4px;">${isEn ? AI_PROVIDERS[0].hintEn : AI_PROVIDERS[0].hintZh}</div>
      </div>
      <div class="ai-input-group">
        <label id="lblApiKey">${isEn ? 'API Key (Optional)' : 'API 密钥 (API Key)'}</label>
        <input id="aiApiKeyInput" type="password" placeholder="${isEn ? 'Paste your API Key here' : '粘贴你的 API 密钥'}" autocomplete="off">
      </div>
      <div class="ai-input-group">
        <label id="lblBaseUrl">${isEn ? 'Base URL' : '接口地址 (Base URL)'}</label>
        <input id="aiBaseUrlInput" type="text" value="https://api.deepseek.com">
      </div>
      <div class="ai-input-group">
        <label id="lblModel">${isEn ? 'Model Name' : '模型名称 (Model)'}</label>
        <input id="aiModelInput" type="text" value="deepseek-chat">
      </div>
      <button class="ai-test-btn" type="button" id="btnTestAiConnection">${isEn ? '⚡ Save & Test Connection' : '⚡ 保存并测试大模型连通性'}</button>
      <button class="btn-clear-ai" type="button">${isEn ? 'Remove API Key' : '清除 API Key'}</button>
      <div class="ai-test-result" id="aiTestResult"></div>
    `;
    body.append(aiPanel);

    // 载入已有大模型配置
    const badge = aiPanel.querySelector('#aiStatusBadge');
    const keyInput = aiPanel.querySelector('#aiApiKeyInput');
    const urlInput = aiPanel.querySelector('#aiBaseUrlInput');
    const modelInput = aiPanel.querySelector('#aiModelInput');
    const providerSelect = aiPanel.querySelector('#aiProviderSelect');
    const hintEl = aiPanel.querySelector('#aiProviderHint');
    const testBtn = aiPanel.querySelector('#btnTestAiConnection');
    const clearBtn = aiPanel.querySelector('.btn-clear-ai');
    const resultBox = aiPanel.querySelector('#aiTestResult');

    if (cachedTypedApiKey) {
      keyInput.value = cachedTypedApiKey;
    }
    keyInput.addEventListener('input', () => {
      cachedTypedApiKey = keyInput.value;
    });

    providerSelect.addEventListener('change', () => {
      const sel = AI_PROVIDERS.find(p => p.id === providerSelect.value) || AI_PROVIDERS[0];
      if (hintEl) hintEl.textContent = isEn ? sel.hintEn : sel.hintZh;
      if (sel.id !== 'custom') {
        urlInput.value = sel.baseUrl;
        modelInput.value = sel.model;
      }
    });

    try {
      const cfg = await (await fetch('/api/ai/config')).json();
      if (cfg.configured) {
        badge.textContent = isEn ? `Configured (${cfg.provider || 'DeepSeek'})` : `已配置 (${cfg.provider || 'DeepSeek'})`;
        badge.style.background = 'var(--sage-l)';
        badge.style.color = 'var(--sage-d)';
        if (cfg.maskedKey && !keyInput.value) keyInput.placeholder = isEn ? `Currently configured: ${cfg.maskedKey}` : `当前已配置: ${cfg.maskedKey}`;
      } else {
        badge.textContent = isEn ? 'Local rules' : '本地规则';
        badge.style.background = 'var(--fog)';
        badge.style.color = 'var(--ink-mute)';
      }
      if (cfg.baseUrl) {
        urlInput.value = cfg.baseUrl;
        const matched = AI_PROVIDERS.find(p => p.id !== 'custom' && (
          (p.baseUrl && cfg.baseUrl.startsWith(p.baseUrl)) ||
          (cfg.provider && p.provider.toLowerCase() === cfg.provider.toLowerCase())
        ));
        if (matched) {
          providerSelect.value = matched.id;
          if (hintEl) hintEl.textContent = isEn ? matched.hintEn : matched.hintZh;
        } else {
          providerSelect.value = 'custom';
          if (hintEl) hintEl.textContent = isEn ? AI_PROVIDERS[AI_PROVIDERS.length - 1].hintEn : AI_PROVIDERS[AI_PROVIDERS.length - 1].hintZh;
        }
      }
      if (cfg.model) modelInput.value = cfg.model;
    } catch (_) {}
    if (renderId !== settingsRenderId) return;

    clearBtn.addEventListener('click', async () => {
      const response = await fetch('/api/ai/config', { method: 'DELETE' });
      if (!response.ok) {
        resultBox.textContent = isEn ? 'Could not remove the key' : '清除密钥失败';
        resultBox.className = 'ai-test-result error';
        resultBox.style.display = 'block';
        return;
      }
      cachedTypedApiKey = '';
      keyInput.value = '';
      keyInput.placeholder = isEn ? 'Paste your API Key here' : '粘贴你的 API 密钥';
      badge.textContent = isEn ? 'Local rules' : '本地规则';
      badge.style.background = 'var(--fog)';
      badge.style.color = 'var(--ink-mute)';
      resultBox.textContent = isEn ? 'API key removed' : '已清除 API Key';
      resultBox.className = 'ai-test-result';
      resultBox.style.display = 'block';
    });

    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = isEn ? 'Testing connection...' : '正在测试连接大模型...';
      resultBox.className = 'ai-test-result';
      resultBox.style.display = 'none';

      const sel = AI_PROVIDERS.find(p => p.id === providerSelect.value) || AI_PROVIDERS[0];
      const payload = {
        apiKey: keyInput.value.trim(),
        baseUrl: urlInput.value.trim() || sel.baseUrl || 'https://api.deepseek.com',
        model: modelInput.value.trim() || sel.model || 'deepseek-chat',
        provider: sel.id === 'custom' ? 'Custom' : sel.provider,
        lang: currentLang
      };

      try {
        // Test first so an invalid key never replaces the active configuration.
        const testRes = await fetch('/api/ai/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const out = await testRes.json();

        if (testRes.ok && out.ok) {
          const saveRes = await fetch('/api/ai/config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!saveRes.ok) {
            const error = await saveRes.json();
            throw new Error(error.error || (isEn ? 'Could not save configuration' : '配置保存失败'));
          }
          resultBox.className = 'ai-test-result success';
          resultBox.textContent = isEn ? `Connected · ${out.model} · ${out.latencyMs}ms` : `连接成功 · ${out.model} · ${out.latencyMs}ms`;
          resultBox.style.display = 'block';
          badge.textContent = isEn ? 'Connected' : '已连接';
          badge.style.background = 'var(--sage-l)';
          badge.style.color = 'var(--sage-d)';
        } else {
          resultBox.className = 'ai-test-result error';
          const errMap = AI_ERRORS[currentLang] || AI_ERRORS.zh;
          const reasonText = errMap[out.fallbackReason] || (isEn ? (out.error || errMap.default) : (out.error || errMap.default));
          resultBox.textContent = isEn ? `Connection failed: ${reasonText}` : `连接失败：${reasonText}`;
          resultBox.style.display = 'block';
        }
      } catch (err) {
        resultBox.className = 'ai-test-result error';
        resultBox.textContent = isEn ? `Request failed: ${err.message}` : `请求失败：${err.message}`;
        resultBox.style.display = 'block';
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = isEn ? '⚡ Save & Test Connection' : '⚡ 保存并测试大模型连通性';
      }
    });
    if (isStaticHost) {
      aiPanel.querySelectorAll('input, select, button').forEach(element => { element.disabled = true; });
      resultBox.textContent = isEn ? 'Cloud setup requires the local service.' : '纯静态页面无法配置云端模型，请使用本机服务。';
      resultBox.style.display = 'block';
    }

    // 2. 本机服务状态
    const state = document.createElement('section'); state.className = 'checkin-panel system-status-panel';
    const isEnState = (currentLang === 'en');
    state.innerHTML = isEnState
      ? '<h2>Local Service</h2><p>Daily records stay on this computer. Cloud AI is contacted only when you send a question with a configured key.</p><div class="score-rows"><span>API</span><b class="server-state">Checking...</b><span>Storage</span><b>SQLite on this computer</b></div>'
      : '<h2>本机服务</h2><p>日常记录存于本机；配置云端模型后，只有主动提问才发送记录摘要。</p><div class="score-rows"><span>服务状态</span><b class="server-state">检测中</b><span>记录存储</span><b>本机 SQLite</b></div>';
    body.append(state);
    try {
      const health = await (await fetch('/health')).json();
      state.querySelector('.server-state').textContent = health.ok ? (isEnState ? 'Connected' : '已连接') : (isEnState ? 'Unavailable' : '异常');
    } catch (_) {
      state.querySelector('.server-state').textContent = isStaticHost ? (isEnState ? 'Browser-only' : '仅浏览器') : (isEnState ? 'Unavailable' : '未连接');
      const storage = state.querySelector('.score-rows b:last-child');
      storage.textContent = isStaticHost ? (isEnState ? 'This browser' : '当前浏览器') : (isEnState ? 'Unavailable' : '不可用');
    }
  }

  async function safeRefreshAll() {
    try { await refreshDashboard(); } catch (_) {
      try { renderTrendChart(getLocalRecords().slice(-7)); } catch (__) {}
    }
    try { await refreshCalendar(); } catch (_) {}
    try {
      const grid = overview.querySelector('#calDays');
      if (grid && !grid.children.length) refreshCalendar();
    } catch (_) {}
    if (isStaticHost) {
      const adviceBox = document.querySelector('.ai-advice-box');
      if (adviceBox && adviceBox.textContent.includes('无法连接')) {
        adviceBox.textContent = 'PulseCam AI 健康伙伴 · 端侧自愈节律引擎已就绪。所有数据保存在本地，可随时进行情景测量。';
      }
    }
  }
  function removeDemoMeasurements() { document.querySelectorAll('.di-hr').forEach(node => node.textContent = 'PulseCam'); }
  function setupPhoneQR() {
    if (document.getElementById('pcqrBackdrop')) return;
    const style = document.createElement('style');
    style.textContent = `
.pcqr-backdrop{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(20,18,15,.45);backdrop-filter:blur(8px)}
.pcqr-backdrop.open{display:flex}
.pcqr-card{position:relative;width:min(92vw,360px);max-height:88vh;overflow:auto;padding:22px;border-radius:22px;background:var(--card,#FFFFFE);box-shadow:0 24px 60px rgba(0,0,0,.22);color:var(--ink,#23221E);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
.pcqr-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border:0;border-radius:50%;background:rgba(0,0,0,.06);font-size:14px;cursor:pointer;color:inherit}
.pcqr-tag{font-size:10px;letter-spacing:.18em;color:#8C6C34;font-weight:600}
.pcqr-card h2{margin:6px 0 4px;font-size:19px;font-weight:600}
.pcqr-sub{margin:0 0 14px;font-size:12px;color:#58564E}
.pcqr-qrwrap{position:relative;display:grid;place-items:center;min-height:210px;padding:12px;border-radius:16px;background:#FBF8F3;border:1px solid #EEEBE3}
.pcqr-qrwrap img{width:100%;max-width:232px;height:auto;display:none}
.pcqr-qrwrap.has img{display:block}
.pcqr-empty{font-size:12px;color:#9C978B;text-align:center;line-height:1.7;padding:0 8px}
.pcqr-qrwrap.has .pcqr-empty{display:none}
.pcqr-url{margin-top:10px;padding:9px 11px;border-radius:10px;background:#F1F5F1;color:#4F6E56;font:11.5px/1.5 ui-monospace,SFMono-Regular,monospace;word-break:break-all;text-align:center}
.pcqr-badge{margin-top:8px;text-align:center;font-size:11px;color:#8C6C34}
.pcqr-actions{display:flex;gap:8px;margin-top:10px}
.pcqr-actions button,.pcqr-actions a{flex:1;display:block;padding:9px;border-radius:10px;border:1px solid #E4E0D7;background:#fff;color:#23221E;font:12.5px/1.4 inherit;text-align:center;text-decoration:none;cursor:pointer}
.pcqr-actions button:disabled,.pcqr-actions a.disabled{opacity:.45;pointer-events:none}
.pcqr-more{margin-top:12px;font-size:11.5px;color:#58564E}
.pcqr-more summary{cursor:pointer;color:#4F6E56}
.pcqr-more p{margin:8px 0;line-height:1.6}
.pcqr-more label{display:block;margin-top:6px;font-size:11px;color:#9C978B}
.pcqr-more input{width:100%;margin-top:4px;padding:8px 10px;border:1px solid #E4E0D7;border-radius:9px;font:12px/1.4 inherit;color:#23221E;background:#fff}
.phone-preview-link{border:0;cursor:pointer;font:600 13px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:var(--sage-d,#4F6E56);color:#fff}
`;
    document.head.append(style);

    const host = document.createElement('div');
    host.innerHTML = `
      <div class="pcqr-backdrop" id="pcqrBackdrop">
        <div class="pcqr-card" role="dialog" aria-modal="true" aria-label="手机扫码">
          <button class="pcqr-close" type="button" id="pcqrClose" aria-label="关闭">✕</button>
          <div class="pcqr-tag">MOBILE PREVIEW</div>
          <h2>扫码在手机上打开</h2>
          <p class="pcqr-sub">手机与电脑连同一个 Wi‑Fi；扫同一地址即可打开同一套界面。</p>
          <div class="pcqr-qrwrap" id="pcqrWrap">
            <img id="pcqrImg" alt="PulseCam 手机访问二维码">
            <div class="pcqr-empty" id="pcqrEmpty">正在获取地址…</div>
          </div>
          <div class="pcqr-url" id="pcqrUrl">—</div>
          <div class="pcqr-badge" id="pcqrBadge"></div>
          <div class="pcqr-actions">
            <button type="button" id="pcqrCopy">复制链接</button>
            <a id="pcqrOpen" target="_blank" rel="noopener">直接打开</a>
          </div>
          <details class="pcqr-more">
            <summary>手机摄像头打不开？</summary>
            <p>手机浏览器只允许 https 页面调用摄像头。局域网 http 地址只能看界面；要真机扫脸，请把 public 目录部署到 Netlify / Vercel 等 https 站点，再把地址填在下面。</p>
            <label for="pcqrInput">手机访问地址（https）</label>
            <input id="pcqrInput" type="url" placeholder="https://your-site.netlify.app/">
            <div class="pcqr-actions">
              <button type="button" id="pcqrSave">保存并生成二维码</button>
              <button type="button" id="pcqrReset">恢复默认</button>
            </div>
          </details>
        </div>
      </div>`;
    const modal = host.firstElementChild;
    document.body.append(modal);

    const wrapEl = modal.querySelector('#pcqrWrap');
    const img = modal.querySelector('#pcqrImg');
    const empty = modal.querySelector('#pcqrEmpty');
    const urlEl = modal.querySelector('#pcqrUrl');
    const badge = modal.querySelector('#pcqrBadge');
    const openLink = modal.querySelector('#pcqrOpen');
    const input = modal.querySelector('#pcqrInput');
    let currentUrl = '';

    let qrLibPromise = null;
    function loadQrLib() {
      if (window.qrcode) return Promise.resolve();
      if (!qrLibPromise) {
        qrLibPromise = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/vendor/qrcode.js';
          script.onload = () => (window.qrcode ? resolve() : reject(new Error('qr lib missing')));
          script.onerror = () => reject(new Error('qr lib failed'));
          document.head.append(script);
        });
      }
      return qrLibPromise;
    }
    function drawQr(url) {
      img.removeAttribute('src');
      loadQrLib()
        .then(() => {
          const qr = window.qrcode(0, 'M');
          qr.addData(url);
          qr.make();
          img.src = qr.createDataURL(8, 2);
        })
        .catch(() => {
          // 静态托管没有后端时，本地库是主路径；这里只做兜底
          img.src = '/api/qr?text=' + encodeURIComponent(url);
        });
    }

    function render(url, isHttps) {
      currentUrl = url || '';
      if (url) {
        drawQr(url);
        wrapEl.classList.add('has');
        urlEl.textContent = url;
        openLink.href = url;
        openLink.classList.remove('disabled');
        badge.textContent = isHttps
          ? 'HTTPS · 手机可以直接扫脸'
          : 'HTTP · 手机只能看界面，摄像头会被浏览器拦截';
        badge.style.color = isHttps ? '#4F6E56' : '#B15D50';
      } else {
        img.removeAttribute('src');
        wrapEl.classList.remove('has');
        urlEl.textContent = '未检测到手机可访问的地址';
        openLink.removeAttribute('href');
        openLink.classList.add('disabled');
        badge.textContent = '请部署 https 地址，或用局域网方式启动服务';
        badge.style.color = '#B15D50';
      }
    }

    async function refresh() {
      const saved = (localStorage.getItem('pulsecam_phone_url') || '').trim();
      if (saved) { render(saved, saved.startsWith('https://')); return; }
      if (location.protocol === 'https:') { render(location.origin + '/', true); return; }
      try {
        const info = await fetch('/api/lan-info').then(r => r.json());
        if (info.publicUrl) {
          const url = info.publicUrl.replace(/\/+$/, '') + '/';
          render(url, url.startsWith('https://'));
          return;
        }
        if (info.lanUrl) { render(info.lanUrl, false); return; }
      } catch (_) {}
      render(null, false);
    }

    function open() {
      modal.classList.add('open');
      input.value = localStorage.getItem('pulsecam_phone_url') || '';
      refresh();
    }
    function close() { modal.classList.remove('open'); }

    modal.querySelector('#pcqrClose').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

    modal.querySelector('#pcqrCopy').addEventListener('click', async () => {
      if (!currentUrl) return;
      const button = modal.querySelector('#pcqrCopy');
      try {
        await navigator.clipboard.writeText(currentUrl);
        button.textContent = '已复制';
        setTimeout(() => { button.textContent = '复制链接'; }, 1600);
      } catch (_) {
        window.prompt('复制这个地址', currentUrl);
      }
    });

    modal.querySelector('#pcqrSave').addEventListener('click', () => {
      const value = input.value.trim();
      if (value && !/^https?:\/\//i.test(value)) {
        badge.textContent = '地址需以 http:// 或 https:// 开头';
        badge.style.color = '#B15D50';
        return;
      }
      if (value) localStorage.setItem('pulsecam_phone_url', value);
      else localStorage.removeItem('pulsecam_phone_url');
      refresh();
    });

    modal.querySelector('#pcqrReset').addEventListener('click', () => {
      localStorage.removeItem('pulsecam_phone_url');
      input.value = '';
      refresh();
    });

    window.PulseCamQR = { open };
    if (new URLSearchParams(location.search).get('qr') === '1' && window.innerWidth >= 700) {
      setTimeout(open, 400);
    }
  }

  const previewLink = document.createElement('button');
  previewLink.type = 'button';
  previewLink.className = 'phone-preview-link';
  previewLink.textContent = '手机扫码';
  previewLink.addEventListener('click', () => window.PulseCamQR?.open());
  document.body.append(previewLink);
  
  // ==========================================
  // 国际赛道多语言体系 (i18n: 中文 / English)
  // ==========================================
  const i18nDict = {
    zh: {
      appName: 'PulseCam',
      toggleBtn: 'EN',
      nav: ['首页', '记录', 'AI顾问', '设置'],
      // 首页
      recoveryHero: '今日状态分',
      recoveryStatus: 'Excellent · 极佳恢复状态',
      stability: '恢复稳定性',
      rhr: '静息心率',
      sleep: '睡眠',
      fitToday: '今日适合',
      fitTags: ['学习', '健身', '面试'],
      cautionToday: '今日谨慎',
      cautionTags: ['熬夜', '高负荷'],
      reportTitle: '今日状态报告',
      overallScore: '状态分',
      compYesterday: '↑ 5% 对比昨日',
      sleepRecovery: '睡眠恢复',
      good: '良好',
      stressLevel: '压力水平',
      low: '偏低',
      aiAdvice: '下午适合高效专注，建议今晚 23 点前入睡，明天身体机能更佳。',
      riskForecast: '3天疲劳风险预测',
      riskNote: '最近 3 天恢复指数稳定，无需调整计划。继续保持当前作息节奏。',
      realTrend: '↻ 近 7 天真实趋势',
      legendRec: '恢复',
      legendSleep: '睡眠',
      legendStress: '压力',
      monthSuffix: '月',
      days: ['日', '一', '二', '三', '四', '五', '六'],
      checkedDays: '● 已打卡 ',
      daysUnit: ' 天',
      totalDays: '30 天',
      // 测量页
      measureTitle: '面部扫描',
      scenarios: {
        '日常': '日常',
        '面试': '面试',
        '考试': '考试',
        '运动': '运动',
        '经期': '经期'
      },
      modeFace: '☺ 前置面部无感测',
      modeFinger: '☝ 指尖贴镜高精测',
      camFps: '前置摄像头 · 本机处理',
      lensNote: '面部扫描',
      lensSub: '面向前置摄像头，画面只在本机处理。',
      startMeasure: '开始扫脸',
      idleManual: '手动填写今日记录',
      privacyLocal: '5 秒自检；可选 15 秒心率或 60 秒短时 HRV 参考测量。',
      measuringHudFace: '✓ 面部对准稳定',
      measuringHudLight: '✓ 光照充足',
      measuringCancel: '取消测量',
      measuringPhoto: '📷 调起手机原生相机拍照',
      resDoneTitle: '扫脸完成',
      resCur: '本次实测',
      resBase: '个人静息基线',
      resNorm: '场景健康常模',
      breathPodTitle: '呼吸放松练习',
      breathPodDesc: '自然吸气 4 秒，缓慢呼气 6 秒。',
      btnStartBreath: '开始练习',
      btnSaveRecord: '保存至今日健康记录',
      btnRemonitor: '重新测量',
      btnTuneManual: '手动微调填报数据',
      // AI 顾问
      advisorTitle: '专属健康 AI',
      advisorSub: '可选云端问答 · 视频不会上传',
      inputPlaceholder: '输入健康问题…',
      voiceHold: '按住说话',
      privacyNote: '主动调用云端模型时发送问题及近 7 天记录摘要',
      // 设置
      settingsTitle: '设置',
      aiConfigHeader: 'AI 大模型接入',
      aiConfigDesc: '可选官方模型接口；未配置时使用本地规则回复。',
      btnTestAi: '⚡ 保存并测试大模型连通性',
      dataPrivacy: '数据与隐私',
      exportCsv: '导出我的记录（CSV）',
      clearData: '清空全部记录'
    },
    en: {
      appName: 'PulseCam',
      toggleBtn: '中',
      nav: ['Overview', 'Record', 'AI Advisor', 'Settings'],
      // Overview
      recoveryHero: 'Daily Status Score',
      recoveryStatus: 'Excellent · Optimal Recovery',
      stability: 'Recovery Stability',
      rhr: 'Resting HR',
      sleep: 'Sleep',
      fitToday: 'Ideal Today',
      fitTags: ['Study', 'Workout', 'Interview'],
      cautionToday: 'Take Caution',
      cautionTags: ['Late Night', 'Overload'],
      reportTitle: 'Daily Status Summary',
      overallScore: 'Status Score',
      compYesterday: '↑ 5% vs Yesterday',
      sleepRecovery: 'Sleep Rebound',
      good: 'Good',
      stressLevel: 'Stress Level',
      low: 'Low',
      aiAdvice: 'Afternoon is optimal for high focus. Aim for sleep before 23:00 to sustain vitality.',
      riskForecast: '3-Day Fatigue Forecast',
      riskNote: 'Recovery trajectory has been robust over the past 3 days. Sustain your current tempo.',
      realTrend: '↻ 7-Day Physiological Trends',
      legendRec: 'Recovery',
      legendSleep: 'Sleep',
      legendStress: 'Stress',
      monthSuffix: '',
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      checkedDays: '● Check-ins: ',
      daysUnit: ' days',
      totalDays: '30 Days',
      // Measure
      measureTitle: 'Face Scan',
      scenarios: {
        '日常': 'Daily',
        '面试': 'Interview',
        '考试': 'Exam',
        '运动': 'Workout',
        '经期': 'Cycle'
      },
      modeFace: '☺ Non-contact Face rPPG',
      modeFinger: '☝ Finger-to-Lens PPG',
      camFps: 'Front Camera · On-device',
      lensNote: 'Face Scan',
      lensSub: 'Align your face with the front camera. Video stays on this device.',
      startMeasure: 'Start Face Scan',
      idleManual: 'Manual Daily Record',
      privacyLocal: '5s face check; optional 15s heart-rate or 60s short-window HRV estimate.',
      measuringHudFace: '✓ Face Aligned Steady',
      measuringHudLight: '✓ Illumination Optimal',
      measuringCancel: 'Cancel',
      measuringPhoto: '📷 Fallback Native Camera',
      resDoneTitle: 'Face Scan Complete',
      resCur: 'Current Test',
      resBase: 'Resting Baseline',
      resNorm: 'Context Norm',
      breathPodTitle: 'Breathing break',
      breathPodDesc: 'Inhale naturally for 4 seconds, exhale gently for 6.',
      btnStartBreath: 'Start Calming',
      btnSaveRecord: 'Save to Health Journal',
      btnRemonitor: 'Measure Again',
      btnTuneManual: 'Fine-tune Values',
      // AI Advisor
      advisorTitle: 'Personal Health AI',
      advisorSub: 'Optional cloud answers · Video stays on this device',
      inputPlaceholder: 'Ask health & circadian question…',
      voiceHold: 'Hold to Speak',
      privacyNote: 'Cloud requests send your question and recent record summary',
      // Settings
      settingsTitle: 'Settings',
      aiConfigHeader: 'AI Model Connection',
      aiConfigDesc: 'Connect an official API or use local rules without a key.',
      btnTestAi: '⚡ Save & Test Connection',
      dataPrivacy: 'Data & Privacy',
      exportCsv: 'Export Records (CSV)',
      clearData: 'Wipe All Health Data'
    }
  };

  let currentLang = localStorage.getItem('pulsecam_lang') || 'zh';

  
  const fullI18nMap = {
    // 1. Overview & General
    'RECOVERY SCORE · 核心恢复指数': 'RECOVERY SCORE · Circadian Baseline',
    'Excellent · 极佳恢复状态': 'Excellent · Optimal Recovery',
    '极佳恢复状态': 'Optimal Recovery',
    '良好恢复状态': 'Good Recovery',
    '轻度疲劳': 'Mild Fatigue',
    '恢复稳定性': 'Recovery Stability',
    '静息心率': 'Resting HR',
    '睡眠': 'Sleep',
    '今日适合': 'Ideal Today',
    '学习': 'Study',
    '深度学习': 'Deep Work',
    '力量健身': 'Strength Workout',
    '重要面试': 'Key Interview',
    '健身': 'Workout',
    '面试': 'Interview',
    '今日谨慎': 'Take Caution',
    '熬夜': 'Late Night',
    '深夜熬夜': 'Late Night',
    '暴饮暴食': 'Binge Eating',
    '充足良好': 'Optimal',
    '偏低平稳': 'Low & Calm',
    '高强度运动': 'Heavy Workout',
    '高强训练': 'Intense Training',
    '过量咖啡': 'Excess Caffeine',
    '常规工作': 'Routine Work',
    '轻度拉伸': 'Light Stretch',
    '规律补水': 'Hydration',
    '今日健康报告': 'Daily Vitals Insight',
    '综合评分': 'Overall Score',
    '睡眠恢复': 'Sleep Recovery',
    '良好': 'Good',
    '偏低': 'Low',
    '压力水平': 'Stress Level',
    '3天疲劳风险预测': '3-Day Fatigue Forecast',
    '低风险': 'Low Risk',
    '中风险': 'Moderate Risk',
    '高风险': 'High Risk',
    '最近 3 天恢复指数稳定，无需调整计划。继续保持当前作息节奏。': 'Recovery trajectory has been robust over the past 3 days. Sustain your current tempo.',
    '↻ 近 7 天真实趋势': '↻ 7-Day Physiological Trends',
    '恢复': 'Recovery',
    '压力': 'Stress',
    '首页': 'Overview',
    '测量': 'Measure',
    'AI顾问': 'AI Advisor',
    '设置': 'Settings',
    '记录今日状态': 'Record Today',
    '填写真实感受后，将保存到本机数据库并更新概览。不是医疗诊断。': 'Save your self-reported status locally. This is not a medical diagnosis.',
    '昨晚睡眠（小时）': 'Last Night’s Sleep (hours)',
    '活动时长（分钟）': 'Activity (minutes)',
    '疲劳（1低 — 5高）': 'Fatigue (1 low – 5 high)',
    '压力（1低 — 5高）': 'Stress (1 low – 5 high)',
    '心情（1低 — 5好）': 'Mood (1 low – 5 good)',
    '情景': 'Scenario',
    '备注（可不填）': 'Notes (optional)',
    '例如：下午有一场考试': 'Example: I have an exam this afternoon',
    '保存今日记录': 'Save Record',

    // 2. Measure Page
    '情景测量': 'Contextual Vitals',
    '日常': 'Daily',
    '考试': 'Exam',
    '运动': 'Workout',
    '经期': 'Cycle',
    '☺ 前置面部无感测': '☺ Non-contact Face rPPG',
    '☝ 指尖贴镜高精测': '☝ Finger-to-Lens PPG',
    '前置摄像头 · 30 fps': 'Front Camera · 30 fps',
    '建议保持平稳呼吸，面部正对镜头': 'Keep calm breathing and face towards camera',
    '30 秒同步输出心率 · 呼吸 · HRV · 恢复指数': 'Simultaneous 30s HR · Respiration · HRV · Recovery',
    '开始测量': 'Start Measurement',
    '📝 手动填报日常记录': '📝 Manual Daily Record',
    '所有数据本地处理 · 不上传': 'On-device Processing · Zero Cloud Upload',
    '✓ 光照充足': '✓ Illumination Optimal',
    '✓ 面部对准稳定': '✓ Face Aligned Steady',
    '心率 · bpm': 'Heart Rate · bpm',
    '0 / 30 秒': '0 / 30 Sec',
    '98% 信号质量': '98% Signal Quality',
    '取消测量': 'Cancel',
    '📷 调起手机原生相机拍照': '📷 Fallback Native Camera',
    '测量完成 · 核心恢复指数': 'Complete · Recovery Assessment',
    '恢复良好 · 适合当前情景': 'Optimal Recovery · Suited for Context',
    '心率': 'Heart Rate',
    '呼吸': 'Respiration',
    '次/分': 'rpm',
    '分析依据': 'Analysis Rationale',
    '恢复指数结合情景节律、睡眠基础与心率变异性特征综合推算。当前状态稳定，建议保持规律节奏。': 'Score derived from circadian tempo, sleep foundation, and HRV spectral traits. Current state stable.',
    '日常模式': 'Daily Mode',
    '当前状态良好，保持规律作息。建议每天完成 30 分钟轻度活动。': 'Good physiological baseline. Maintain regular circadian rhythms and 30m light activity.',
    '日常常模对照': 'Daily Healthy Norm Benchmark',
    '本次实测': 'Current Test',
    '个人静息基线': 'Resting Baseline',
    '场景健康常模': 'Contextual Norm',
    '心率较平时静息轻微浮动 (+4 bpm)，处于日常常模基线健康区间，自主神经交感与副交感张力平衡良好。': 'HR aligns with expected baseline (+4 bpm); sympathetic & parasympathetic autonomic tone remain balanced.',
    '科学共振呼吸（4-2-6秒），快速平复交感紧张': '4-2-6s Coherence Respiration for Sympathetic Reset',
    '保存至今日健康记录': 'Save to Health Journal',
    '重新测量': 'Measure Again',
    '手动微调填报数据': 'Fine-tune Values',

    // 3. AI Advisor Page
    '专属健康 AI': 'Personal Health AI',
    '端侧运行 · 所有数据本地处理': 'Edge Inferred · 100% Private & Local',
    '今天 10:32': 'Today 10:32',
    '今天 10:33': 'Today 10:33',
    '今天 10:35': 'Today 10:35',
    '为什么今天 HRV 下降了？': 'Why did my HRV drop today?',
    '睡眠 −1.5h': 'Sleep −1.5h',
    '今天适合去健身吗？': 'Is it suitable for a workout today?',
    '恢复 88': 'Recovery 88',
    '中等强度': 'Moderate Intensity',
    '推荐：力量训练 › 慢跑 › 游泳': 'Recommended: Strength Training › Jogging › Swimming',
    '按住说话': 'Hold to Speak',
    '输入健康问题…': 'Ask health & circadian question…',
    '所有回答仅基于个人健康数据 · 端侧运行': 'All replies derived solely from your local metrics',

    // 4. Breath Pod Modal
    '自主神经调节 · 共振呼吸': 'Autonomic Regulation · Resonance Breath',
    '平复身心 2 分钟': '2-Minute Vagal Reset',
    '准备': 'Get Ready',
    '吸气': 'Inhale',
    '屏息': 'Hold',
    '呼气': 'Exhale',
    '请跟随光环节奏深缓呼吸，自然放松肩颈与下颌': 'Breathe with the halo rhythm; relax shoulders, neck, and jaw naturally.',
    '已完成周期:': 'Completed Cycles:',
    '交感神经过度激活已显著平息，副交感张力恢复平稳。祝你从容应对！': 'Sympathetic hyperactivation significantly soothed. Parasympathetic vagal tone restored.',
    '返回测量结果': 'Return to Results',

    // 5. Settings & Hardware
    '设置': 'Settings',
    '界面语言与国际化': 'Language & Localization',
    '支持中英文全界面切换，专为第十四届数媒竞赛国际赛道设计。': 'Switch between Chinese and English, tailored for the International Competition Track.',
    '简体中文': '简体中文',
    '开通 PulseLog AI 月度服务': 'PulseLog AI Health Engine',
    'AI 对话 · 7 天趋势解读 · 平台托管模型服务': 'AI Health Advisor · 7-Day Trend · Causal Inference',
    '✓ 无需自行配置 API Key': '✓ Zero API Key Required',
    '✓ 平台统一接入第三方模型服务': '✓ Dual Track: Cloud & On-Device Causal',
    '✓ 仅在提问时发送必要的记录摘要': '✓ 100% Private Local Database',
    'AI 月度服务已开通': 'AI Engine Activated',
    '本机测试：开通 30 天，不扣费；正式版接入支付后替换为真实收银台': 'Competition Demo Mode: Permanent Free Access',
    '有效期至 2100/1/1': 'Valid Through 2100/1/1 (Active)',
    '数据与隐私': 'Data & Privacy',
    '记录默认保存在本机数据库。AI 对话仅会发送你主动提交问题时所需的近 7 天记录摘要。': 'All physiological records are stored locally on this machine. AI consultations only reference your recent 7-day vitals summary with zero cloud tracking.',
    '导出我的记录（CSV）': 'Export My Data (CSV)',
    '清空全部记录': 'Wipe All Health Data',
    '系统与项目状态': 'System & Project Status',
    'PulseLog 精力恢复与生活节律自助记录系统，支持多情景快速测量、端侧因果推理与数据完全本地化保护。': 'PulseLog AI Circadian & Recovery System, supporting contextual rapid vitals, on-device causal inference, and zero cloud data leaks.',
    '后端服务': 'Backend API',
    '已连接': 'Connected',
    '数据保存': 'Data Store',
    '本机 SQLite': 'Local SQLite',
    '前端形态': 'Frontend Stack',
    '移动端 PWA / Web': 'Mobile PWA / Web',
    '当前版本': 'Release Version',
    '全国大数媒复赛版 v2.0': 'International Track v2.0',
    'AI 大模型接入': 'Cloud / Edge AI Integration',
    '支持接入 DeepSeek-V3 / DeepSeek-R1 等大模型。填入 API Key 即可为 AI 助手解锁真实大模型推理能力。': 'Supports DeepSeek-V3 / R1 and OpenAI models. Providing an API Key unlocks cloud deep reasoning; leaves blank to run 100% on-device.',
    '模型服务商与预设': 'AI Provider & Preset',
    'DeepSeek 官方 API (推荐)': 'DeepSeek Official API (Recommended)',
    'OpenAI 官方 API': 'OpenAI Official API',
    '通义千问 (阿里云百炼 DashScope)': 'Alibaba Qwen (DashScope API)',
    '智谱清言 (智谱 BigModel 开放平台)': 'Zhipu GLM (BigModel API)',
    '月之暗面 (Kimi / Moonshot API)': 'Moonshot Kimi (Moonshot API)',
    '硅基流动 (SiliconFlow 开放平台)': 'SiliconFlow Cloud API',
    '自定义兼容接口 (OpenAI 格式)': 'Custom OpenAI-Compatible API',
    'API 密钥 (API Key)': 'API Key (Optional)',
    '粘贴你的 sk- 开头密钥': 'Paste your sk- API Key here',
    '粘贴你的 API 密钥': 'Paste your API Key here',
    '接口地址 (Base URL)': 'Base URL',
    '模型名称 (Model)': 'Model Name',
    '⚡ 保存并测试大模型连通性': '⚡ Save & Test Connection',
    '清除 API Key': 'Remove API Key',
    '本地规则': 'Local rules',
    '使用本地引擎': 'Local Causal Mode',
    '未接入 (使用本地引擎)': 'Local Causal Mode'
  };

  // Inverted map for returning to Chinese
  const fullEnToZhMap = {};
  for (const [zh, en] of Object.entries(fullI18nMap)) {
    fullEnToZhMap[en] = zh;
  }

  function translateDom(targetLang) {
    const isEn = (targetLang === 'en');
    const map = isEn ? fullI18nMap : fullEnToZhMap;

    // Walk all text nodes in body except script and style
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT;
        // Skip language segmented buttons themselves so they keep emoji
        if (parent.closest('.lang-seg-control, .sticky-row, .report-card .metric-row, .ai-advice-box, .record-detail')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue.trim();
      if (!raw) continue;
      if (map[raw]) {
        node.nodeValue = node.nodeValue.replace(raw, map[raw]);
      } else {
        // Substring replacements for composite labels like "较昨日 ↑8", "睡眠恢复 充足良好 (7.5h)", etc.
        if (isEn) {
          if (raw.includes('较昨日')) node.nodeValue = node.nodeValue.replace('较昨日', 'vs Yesterday');
          if (raw.includes('对比昨日')) node.nodeValue = node.nodeValue.replace('对比昨日', 'vs Yesterday');
          if (raw.includes('睡眠恢复')) node.nodeValue = node.nodeValue.replace('睡眠恢复', 'Sleep Recovery');
          if (raw.includes('Sleep Rebound')) node.nodeValue = node.nodeValue.replace('Sleep Rebound', 'Sleep Recovery');
          if (raw.includes('睡眠恢复')) node.nodeValue = node.nodeValue.replace('睡眠恢复', 'Sleep Rebound');
          if (raw.includes('充足良好')) node.nodeValue = node.nodeValue.replace('充足良好', 'Optimal');
          if (raw.includes('压力水平')) node.nodeValue = node.nodeValue.replace('压力水平', 'Stress Level');
          if (raw.includes('偏低平稳')) node.nodeValue = node.nodeValue.replace('偏低平稳', 'Low & Stable');
          if (raw.includes('偏低平稳')) node.nodeValue = node.nodeValue.replace('偏低平稳', 'Low & Calm');
          if (raw.includes('偏低')) node.nodeValue = node.nodeValue.replace('偏低', 'Low');
          if (raw.includes('良好')) node.nodeValue = node.nodeValue.replace('良好', 'Good');
          if (raw.includes('次/分')) node.nodeValue = node.nodeValue.replace('次/分', 'rpm');
          if (raw.includes('整体恢复状态优秀')) node.nodeValue = node.nodeValue.replace('整体恢复状态优秀。下午适合高效学习或深度专注，晚上保持稳定节律。', 'Excellent overall recovery. Ideal for deep work and high focus in the afternoon; keep regular tempo tonight.');
        } else {
          if (raw.includes('vs Yesterday')) node.nodeValue = node.nodeValue.replace('vs Yesterday', '较昨日');
          if (raw.includes('Sleep Recovery')) node.nodeValue = node.nodeValue.replace('Sleep Recovery', '睡眠恢复');
          if (raw.includes('Sleep Rebound')) node.nodeValue = node.nodeValue.replace('Sleep Rebound', '睡眠恢复');
          if (raw.includes('Optimal')) node.nodeValue = node.nodeValue.replace('Optimal', '充足良好');
          if (raw.includes('Stress Level')) node.nodeValue = node.nodeValue.replace('Stress Level', '压力水平');
          if (raw.includes('Low & Calm')) node.nodeValue = node.nodeValue.replace('Low & Calm', '偏低平稳');
          if (raw.includes('Low & Stable')) node.nodeValue = node.nodeValue.replace('Low & Stable', '偏低平稳');
          if (raw.includes('Excellent overall recovery')) node.nodeValue = node.nodeValue.replace('Excellent overall recovery. Ideal for deep work and high focus in the afternoon; keep regular tempo tonight.', '整体恢复状态优秀。下午适合高效学习或深度专注，晚上保持稳定节律。');
        }
      }
    }

    // Translate placeholders
    document.querySelectorAll('input, textarea').forEach(el => {
      const ph = el.getAttribute('placeholder');
      if (!ph) return;
      if (map[ph]) el.setAttribute('placeholder', map[ph]);
    });
  }

  function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('pulsecam_lang', lang);
    try { setupPrivacyTools(); } catch(_) {}
    try { setupRealSettings(); } catch(_) {}
    try { makeAssistantHonest(); } catch(_) {}
    translateDom(lang);
    const d = i18nDict[lang] || i18nDict.zh;

    // 1. Update Lang Buttons
    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
      btn.textContent = lang === 'zh' ? 'EN' : '中文';
    });
    const flPill = document.querySelector('.float-lang-pill .fl-text');
    if (flPill) flPill.textContent = lang === 'zh' ? 'English (EN)' : '中文 (ZH)';

    // 2. Nav Labels
    document.querySelectorAll('.card-nav').forEach(nav => {
      const tabs = nav.querySelectorAll('.nav-tab .nav-label');
      if (tabs.length === 4) {
        tabs[0].textContent = d.nav[0];
        tabs[1].textContent = d.nav[1];
        tabs[2].textContent = d.nav[2];
        tabs[3].textContent = d.nav[3];
      }
    });

    // 3. Overview Page
    const dhLabel = document.querySelector('.dh-label');
    if (dhLabel) dhLabel.textContent = d.recoveryHero;
    const dhStab = document.querySelector('.dh-stability-label');
    if (dhStab) dhStab.textContent = d.stability;
    const dmmLbls = document.querySelectorAll('.dh-mini-metrics .dmm-lbl');
    if (dmmLbls.length >= 3) {
      dmmLbls[1].textContent = d.rhr;
      dmmLbls[2].textContent = d.sleep;
    }

    const stDo = document.querySelector('.sticky.do .st-head');
    if (stDo) stDo.innerHTML = '<svg class="icon"><use href="#i-leaf"/></svg>' + d.fitToday;
    const stDont = document.querySelector('.sticky.dont .st-head');
    if (stDont) stDont.innerHTML = '<svg class="icon"><use href="#i-alert"/></svg>' + d.cautionToday;

    const repLabel = document.querySelector('.report-card .card-label');
    if (repLabel) repLabel.innerHTML = '<svg class="icon"><use href="#i-sparkle"/></svg>' + d.reportTitle;
    const rtTitle = document.querySelector('.rt-title');
    if (rtTitle) rtTitle.textContent = d.overallScore;
    const rtTrend = document.querySelector('.rt-trend');
    if (rtTrend) rtTrend.innerHTML = '<svg class="icon" style="font-size:11px"><use href="#i-pulse"/></svg>' + d.compYesterday;


    const aiAdviceEl = document.querySelector('.ai-advice-box');
    if (aiAdviceEl && (aiAdviceEl.textContent.includes('下午适合') || aiAdviceEl.textContent.includes('Afternoon'))) {
      aiAdviceEl.innerHTML = '<svg class="icon"><use href="#i-sparkle"/></svg>' + d.aiAdvice;
    }

    const trTitle = document.querySelector('.tr-title');
    if (trTitle) trTitle.innerHTML = '<svg class="icon"><use href="#i-alert"/></svg>' + d.riskForecast;
    const trNote = document.querySelector('.tr-note');
    if (trNote) trNote.textContent = d.riskNote;

    const twinLabel = document.querySelector('.twin-card .card-label');
    if (twinLabel) twinLabel.innerHTML = '<svg class="icon"><use href="#i-sync"/></svg>' + d.realTrend;
    const twinSpans = document.querySelectorAll('.twin-legend span');
    if (twinSpans.length >= 3) {
      twinSpans[0].innerHTML = '<span class="tdot blue"></span>' + d.legendRec;
      twinSpans[1].innerHTML = '<span class="tdot green"></span>' + d.legendSleep;
      twinSpans[2].innerHTML = '<span class="tdot purple"></span>' + d.legendStress;
    }

    // Calendar Weekdays
    const calWk = document.querySelector('.cal-weekdays');
    if (calWk) {
      calWk.innerHTML = d.days.map(day => '<span>' + day + '</span>').join('');
    }

    // 4. Measure Page
    const mTitle = document.querySelector('.pg-measure .card-body > div:first-child');
    if (mTitle) mTitle.textContent = d.measureTitle;
    const pills = document.querySelectorAll('#scenarioPills .scenario-pill');
    pills.forEach(p => {
      const raw = p.getAttribute('data-scenario') || '日常';
      p.textContent = d.scenarios[raw] || raw;
    });
    const scenarioInput = document.querySelector('.manual-checkin input[name="scenario"]');
    if (scenarioInput) {
      const code = scenarioInput.dataset.code || '日常';
      scenarioInput.value = d.scenarios[code] || code;
    }

    const btnFace = document.getElementById('btnModeFace');
    if (btnFace) btnFace.textContent = d.modeFace;
    const btnFinger = document.getElementById('btnModeFinger');
    if (btnFinger) btnFinger.textContent = d.modeFinger;

    const idleStatus = document.getElementById('idleCamStatus');
    if (idleStatus) idleStatus.innerHTML = '<span class="rec-dot"></span>' + d.camFps;
    const lensNote = document.getElementById('idleScenarioNote');
    if (lensNote) {
      lensNote.textContent = d.lensNote;
    }
    const lensSub = document.querySelector('.lens-sub');
    if (lensSub) lensSub.textContent = d.lensSub;

    const btnStart = document.getElementById('btnStartMeasure');
    if (btnStart) btnStart.textContent = d.startMeasure;
    const btnManual = document.getElementById('btnIdleManual');
    if (btnManual) btnManual.textContent = d.idleManual;
    const privLabels = document.querySelectorAll('.privacy-label span');
    privLabels.forEach(s => s.textContent = d.privacyLocal);

    const bioLight = document.getElementById('bioLightFeedback');
    if (bioLight) bioLight.textContent = d.measuringHudLight;
    const bioPose = document.getElementById('bioPoseFeedback');
    if (bioPose) bioPose.textContent = d.measuringHudFace;

    const btnCancel = document.getElementById('btnCancelMeasure');
    if (btnCancel) btnCancel.textContent = d.measuringCancel;
    const btnPhoto = document.getElementById('btnPhotoFallback');
    if (btnPhoto) btnPhoto.textContent = d.measuringPhoto;

    const rcLabel = document.querySelector('.result-card .rc-label');
    if (rcLabel) rcLabel.textContent = d.resDoneTitle;
    const cbLabels = document.querySelectorAll('.compare-bar .cb-label');
    if (cbLabels.length >= 3) {
      cbLabels[0].textContent = d.resCur;
      cbLabels[1].textContent = d.resBase;
      cbLabels[2].textContent = d.resNorm;
    }

    const btcTitle = document.querySelector('.btc-title');
    if (btcTitle) btcTitle.textContent = d.breathPodTitle;
    const btcDesc = document.querySelector('.btc-desc');
    if (btcDesc) btcDesc.textContent = d.breathPodDesc;
    const btnOpenBreath = document.getElementById('btnOpenBreathModal');
    if (btnOpenBreath) btnOpenBreath.textContent = d.btnStartBreath;

    const btnSaveDone = document.getElementById('btnSaveDoneRecord');
    if (btnSaveDone && !btnSaveDone.disabled) btnSaveDone.textContent = d.btnSaveRecord;
    const btnRestart = document.getElementById('btnRestartMeasure');
    if (btnRestart) btnRestart.textContent = d.btnRemonitor;
    const btnTune = document.getElementById('btnToggleManual');
    if (btnTune) btnTune.textContent = d.btnTuneManual;

    // 5. AI Advisor Page
    const chTitle = document.querySelector('.chat-header-area .ch-title');
    if (chTitle) chTitle.textContent = d.advisorTitle;
    const chSub = document.querySelector('.chat-header-area .ch-sub');
    if (chSub) chSub.innerHTML = '<svg class="icon" style="font-size:11px"><use href="#i-shield"/></svg>' + d.advisorSub;
    const chatInput = document.querySelector('.chat-input');
    if (chatInput) chatInput.placeholder = d.inputPlaceholder;
    const voiceBtn = document.querySelector('.voice-hold-btn');
    if (voiceBtn && !voiceBtn.textContent.includes('正在')) {
      voiceBtn.innerHTML = '<svg class="icon"><use href="#i-mic"/></svg>' + d.voiceHold;
    }
    const chatPriv = document.querySelector('.chat-privacy');
    if (chatPriv) chatPriv.innerHTML = '<svg class="icon" style="font-size:10px"><use href="#i-shield"/></svg>' + d.privacyNote;

    // 6. Settings Page
    const sTitle = document.querySelector('.pg-settings .card-body > div:first-child');
    if (sTitle && (sTitle.textContent.includes('设置') || sTitle.textContent.includes('Settings'))) {
      sTitle.textContent = d.settingsTitle;
    }
    const aiPanelH2 = document.querySelector('.ai-config-panel h2 span:first-child');
    if (aiPanelH2) aiPanelH2.textContent = d.aiConfigHeader;
    const btnTestAi = document.getElementById('btnTestAiConnection');
    if (btnTestAi && !btnTestAi.disabled) btnTestAi.textContent = d.btnTestAi;
    window.pulseLogUpdateScanLanguage?.();
    window.pulseLogUpdateAILanguage?.();
    setupRealSettings();
    refreshDashboard().catch(() => {});
  }

  function setupI18n() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.lang-toggle-btn') || e.target.closest('.float-lang-pill');
      if (!btn) return;
      e.preventDefault();
      const nextLang = currentLang === 'zh' ? 'en' : 'zh';
      applyLanguage(nextLang);
    });
    applyLanguage(currentLang);
  }

  document.querySelectorAll('.card-nav .nav-tab').forEach(tab => tab.addEventListener('click', () => setActivePage([...tab.parentElement.children].indexOf(tab))));
  syncClock(); setInterval(syncClock, 30000); removeDemoMeasurements(); buildCheckinForm(); import('/scan-engine.js').then(() => window.PulseCamScan?.mount()).catch(console.error); setupCalendarNavigation(); makeAssistantHonest(); setupRealSettings(); setupPrivacyTools(); setupI18n(); setupPhoneQR(); setActivePage(0);
  safeRefreshAll();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeRefreshAll);
  }
  window.addEventListener('resize', () => {
    const overviewActive = document.querySelectorAll('.phone-card')[0]?.classList.contains('is-active');
    if (overviewActive) safeRefreshAll();
  });
  window.addEventListener('load', safeRefreshAll);
})();

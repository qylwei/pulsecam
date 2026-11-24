function endpoint(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return null;
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;

    let p = url.pathname.replace(/\/+$/, '');
    if (p.endsWith('/chat/completions')) return `${url.origin}${p}`;
    if (!p || p === '/') {
      return `${url.origin}/v1/chat/completions`;
    }
    return `${url.origin}${p}/chat/completions`;
  } catch (_) { return null; }
}

function valid(data) {
  return data && typeof data.answer === 'string' && data.answer.trim().length > 0 && data.answer.length <= 2000 &&
    Array.isArray(data.evidence) && data.evidence.length <= 3 &&
    data.evidence.every(item => item && typeof item.label === 'string' && typeof item.value === 'string' &&
      ['manual', 'measured', 'derived'].includes(item.source)) &&
    Array.isArray(data.actions) && data.actions.length <= 3 &&
    data.actions.every(item => item && ['breathing', 'timer', 'none'].includes(item.type) && typeof item.title === 'string') &&
    Array.isArray(data.missing) && data.missing.every(item => item && typeof item.key === 'string' && typeof item.label === 'string') &&
    typeof data.escalate === 'boolean';
}

async function askLLM({ facts, message, history = [], lang = 'zh', config = {} }) {
  const start = Date.now();
  const deadline = start + 12000;
  const url = endpoint(config.baseUrl);
  if (!url || !config.apiKey) return { ok: false, data: null, meta: { latencyMs: 0, fallbackReason: 'bad_key' } };
  const cleanHistory = Array.isArray(history) ? history.slice(-6).filter(item =>
    ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string')
    .map(item => ({ role: item.role, content: item.content.slice(0, 500) })) : [];
  let fallbackReason = 'network';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { fallbackReason = 'timeout'; break; }
      const isEn = lang === 'en';
      const langInstruction = isEn
        ? 'You MUST reply strictly in English. Do not use Chinese characters.'
        : '你必须完全使用简体中文回答，严禁混入任何英文单词。';
      const requestBody = {
        model: config.model,
        messages: [
          { role: 'system', content: `You are a lifestyle wellness advisor. ${langInstruction} Reply in ${lang} as one JSON object: {"answer":"plain text","evidence":[],"actions":[],"missing":[],"escalate":false}. Evidence objects, if any, must be {"label":"text","value":"exact saved value with unit","source":"manual or measured or derived"}. Actions must be {"type":"breathing or timer or none","title":"text"}. Missing objects must be {"key":"field","label":"text"}. Never claim an unmeasured vital exists. If there are no saved records, give general guidance, explicitly say you lack personal data, and leave evidence empty. Do not diagnose or make medical claims; never mention medication, dosage, or treatment. If the user reports a symptom (headache, dizziness, stomach ache, palpitations, etc.), do not guess the cause: give at most two low-risk self-care steps, ask one short clarifying question, and name the red flags that need urgent care. Keep answer under about 160 Chinese characters or 100 English words, in 2-3 short sentences. Do not use markdown lists. Do not write any digits unless they are exactly present among the numeric values in facts; in particular, no invented times, durations, heart rates or HRV. All five keys are required.` },
          { role: 'system', content: JSON.stringify(facts) },
          ...cleanHistory,
          { role: 'user', content: message }
        ]
      };
      if (!/reasoner|r1/i.test(config.model || '')) {
        requestBody.response_format = { type: 'json_object' };
        requestBody.temperature = 0.2;
        requestBody.max_tokens = 400;
      } else {
        requestBody.max_tokens = 600;
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(remaining),
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        fallbackReason = response.status === 429 ? 'rate_limited' : [401, 403].includes(response.status) ? 'bad_key' : 'network';
        if ((response.status === 429 || response.status >= 500) && !attempt) {
          await new Promise(resolve => setTimeout(resolve, 400));
          continue;
        }
        break;
      }
      const raw = await response.json();
      let data;
      let content = raw?.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) content = jsonMatch[0];
      try { data = JSON.parse(content); } catch (_) {}
      if (!valid(data) || data.escalate || (!facts.today.date && data.evidence.length)) {
        fallbackReason = 'bad_output'; break;
      }
      const fields = [
        [facts.today.sleepHours, 'h'], [facts.today.stress, '/5'], [facts.today.fatigue, '/5'],
        [facts.today.mood, '/5'], [facts.today.recoveryScore, ''],
        [facts.vitals.heartRate, 'bpm'], [facts.vitals.hrv, 'ms'], [facts.vitals.respiration, '/min']
      ].filter(([field]) => field.value != null);
      const real = fields.map(([field]) => String(field.value));
      const numbers = data.answer.match(/\d+(?:\.\d+)?/g) || [];
      if (numbers.some(number => !real.includes(number)) ||
          data.evidence.some(item => !fields.some(([field, unit]) =>
            item.source === field.source &&
            [String(field.value), `${field.value}${unit}`, `${field.value} ${unit}`].includes(item.value)))) {
        fallbackReason = 'bad_output';
        break;
      }
      return { ok: true, data, meta: { latencyMs: Date.now() - start, fallbackReason: null } };
    } catch (error) {
      fallbackReason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network';
      if (fallbackReason === 'timeout' || attempt) break;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
  return { ok: false, data: null, meta: { latencyMs: Date.now() - start, fallbackReason } };
}
module.exports = { askLLM };

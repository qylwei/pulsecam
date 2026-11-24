const labels = {
  zh: {
    welcome: '你好。可以聊睡眠、压力和今天的记录；没有测量的指标不会被推断。',
    local: '本地规则', cloud: '云端模型', missing: '缺少数据：', fallback: '云端不可用，已用本地建议',
    timeout: '云端响应超时，已用本地建议', rate_limited: '云端请求受限，已用本地建议',
    bad_key: '密钥无效或已过期，已用本地建议', bad_output: '云端回答未通过数据校验，已用本地建议',
    network: '云端连接失败，已用本地建议',
    error: '暂时无法连接服务，请稍后再试。', voice: '按住说话',
    listening: '正在聆听，再次点击结束', placeholder: '输入生活节律问题…',
    urgent: '建议尽快就医', thinking: '正在整理…',
    privacy: '云端提问时发送问题与近期记录摘要 · 非医疗建议',
    quick: ['为什么今天累？', '今天适合运动吗？', '今晚几点睡？'],
    srcManual: '手填', srcMeasured: '实测', srcDerived: '推算'
  },
  en: {
    welcome: 'Hi. Ask about sleep, stress or saved records. Unmeasured readings will not be inferred.',
    local: 'Local rules', cloud: 'Cloud model', missing: 'Not measured: ', fallback: 'Cloud unavailable; using local advice',
    timeout: 'Cloud timed out; using local advice', rate_limited: 'Cloud rate-limited; using local advice',
    bad_key: 'Invalid or expired key; using local advice', bad_output: 'Cloud answer failed data checks; using local advice',
    network: 'Cloud connection failed; using local advice',
    error: 'The service is unavailable. Please try again.', voice: 'Speak',
    listening: 'Listening; click again to stop', placeholder: 'Ask about your daily routine…',
    urgent: 'Seek medical care now', thinking: 'Thinking…',
    privacy: 'Cloud questions send your question and recent record summary · not medical advice',
    quick: ['Why am I tired today?', 'Is it okay to work out?', 'What time should I sleep?'],
    srcManual: 'manual', srcMeasured: 'measured', srcDerived: 'derived'
  }
};
const lang = () => localStorage.getItem('pulsecam_lang') === 'en' ? 'en' : 'zh';
const text = key => labels[lang()][key];
let mounted = false;
let chat;
let input;
let voice;
let sendBtn;
let quickWrap = null;
const history = [];

function sourceLabel(source) {
  if (source === 'measured') return text('srcMeasured');
  if (source === 'derived') return text('srcDerived');
  return text('srcManual');
}

function injectStyles() {
  if (document.getElementById('pc-ai-style')) return;
  const style = document.createElement('style');
  style.id = 'pc-ai-style';
  style.textContent = `
.chat-quick{display:flex;gap:8px;flex-wrap:wrap;padding:0 16px 10px}
.chat-quick button{border:1px solid var(--line,#E4E0D7);background:var(--card,#fff);color:var(--ink-soft,#58564E);border-radius:999px;padding:7px 12px;font:12px/1.2 inherit;cursor:pointer}
.chat-quick button:hover{border-color:var(--sage,#7C9A82);color:var(--sage-d,#4F6E56)}
.chat-missing{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.chat-missing button{border:1px dashed var(--line,#E4E0D7);background:transparent;color:var(--ink-mute,#9C978B);border-radius:8px;padding:5px 9px;font:11px/1.3 inherit;cursor:pointer}
.chat-missing button:hover{color:var(--sage-d,#4F6E56);border-color:var(--sage,#7C9A82)}
.chat-bubble.urgent{border-color:var(--coral,#D98D82)!important;background:var(--coral-l,#FBEEEB)!important}
.chat-escalate{font:600 11px/1.4 inherit;color:var(--coral-d,#B15D50);margin-bottom:6px;letter-spacing:.02em}
.chat-bubble.is-typing .chat-content{opacity:.5}
`;
  document.head.append(style);
}

function bubble(role, answer, data) {
  const el = document.createElement('div');
  el.className = `chat-bubble ${role}`;
  if (role === 'ai') {
    const avatar = document.createElement('span');
    avatar.className = 'ai-avatar';
    avatar.textContent = '✦';
    el.append(avatar);
  }
  const content = document.createElement('div');
  content.className = 'chat-content';
  if (data?.escalate) {
    const badge = document.createElement('div');
    badge.className = 'chat-escalate';
    badge.textContent = text('urgent');
    content.append(badge);
  }
  const body = document.createElement('div');
  body.textContent = answer;
  content.append(body);
  if (data) {
    if (data.evidence?.length) {
      const chips = document.createElement('div');
      chips.className = 'chat-insight-chips';
      for (const item of data.evidence) {
        const chip = document.createElement('span');
        chip.className = 'chat-insight-chip';
        chip.textContent = `${item.label} ${item.value}${item.trend ? ` · ${item.trend}` : ''} · ${sourceLabel(item.source)}`;
        chips.append(chip);
      }
      content.append(chips);
    }
    if (data.actions?.length) {
      const actions = document.createElement('div');
      actions.className = 'chat-actions';
      for (const action of data.actions) {
        if (action.type !== 'breathing' && action.type !== 'timer') continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = action.title;
        button.addEventListener('click', () => window.PulseCamBreathing?.open());
        actions.append(button);
      }
      content.append(actions);
    }
    if (data.missing?.length) {
      const missing = document.createElement('div');
      missing.className = 'chat-missing';
      for (const item of data.missing) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${text('missing')}${item.label}`;
        if (item.hint) button.title = item.hint;
        button.addEventListener('click', () => goRecord(item.key));
        missing.append(button);
      }
      content.append(missing);
    }
    const source = document.createElement('div');
    source.className = 'cb-time';
    source.textContent = `${data.engine === 'local' ? text('local') : `${data.engine || text('cloud')} · ${(Number(data.latencyMs || 0) / 1000).toFixed(1)}s`}${data.fallbackReason ? ` · ${text(data.fallbackReason) || text('fallback')}` : ''}`;
    content.append(source);
  }
  el.append(content);
  chat.append(el);
  scrollToBottom();
  return el;
}

function scrollToBottom() {
  const scroller = chat.closest('.card-body');
  if (scroller) requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
}

function clearQuick() {
  if (quickWrap) { quickWrap.remove(); quickWrap = null; }
}

function quickPrompts() {
  if (quickWrap || history.length) return;
  quickWrap = document.createElement('div');
  quickWrap.className = 'chat-quick';
  for (const prompt of text('quick')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = prompt;
    button.addEventListener('click', () => { input.value = prompt; send(); });
    quickWrap.append(button);
  }
  chat.insertAdjacentElement('afterend', quickWrap);
}

function goRecord(kind) {
  const tabs = document.querySelector('.card-nav')?.querySelectorAll('.nav-tab');
  tabs?.[1]?.click();
  setTimeout(() => {
    if (kind === 'heartRate' || kind === 'hrv') document.getElementById('btnStartMeasure')?.click();
    else document.getElementById('btnIdleManual')?.click();
  }, 320);
}

async function send() {
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  clearQuick();
  bubble('user', question);
  const pending = bubble('ai', text('thinking'));
  pending.classList.add('is-typing');
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  try {
    let userId = localStorage.getItem('pulselog-user-id');
    if (!userId) {
      userId = (await (await fetch('/api/auth/anonymous', { method: 'POST' })).json()).id;
      localStorage.setItem('pulselog-user-id', userId);
    }
    const response = await fetch('/api/ai/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(15000) : undefined,
      body: JSON.stringify({ userId, message: question, lang: lang(), history: history.slice(-6) })
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || text('error'));
    pending.remove();
    bubble('ai', data.answer, data);
    history.push({ role: 'user', content: question }, { role: 'assistant', content: data.answer });
    if (history.length > 6) history.splice(0, history.length - 6);
  } catch (error) {
    pending.remove();
    bubble('ai', error.message || text('error'), { engine: 'local', fallbackReason: 'network' });
  } finally {
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

function setupVoice() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech || !voice) {
    if (voice) voice.hidden = true;
    return;
  }
  let recognition;
  voice.addEventListener('click', () => {
    if (recognition) { recognition.stop(); return; }
    recognition = new Speech();
    recognition.lang = lang() === 'en' ? 'en-US' : 'zh-CN';
    recognition.onresult = event => {
      input.value += (input.value ? ' ' : '') + event.results[0][0].transcript;
      input.focus();
    };
    recognition.onend = () => { recognition = null; voice.textContent = text('voice'); };
    recognition.onerror = () => { recognition = null; voice.textContent = text('voice'); };
    voice.textContent = text('listening');
    recognition.start();
  });
}

function mount() {
  if (mounted) return;
  chat = document.querySelector('.pg-ai .chat-list');
  input = document.querySelector('.pg-ai .chat-input');
  voice = document.querySelector('.pg-ai .voice-hold-btn');
  sendBtn = document.querySelector('.pg-ai .chat-send-btn');
  if (!chat || !input) return;
  injectStyles();
  chat.replaceChildren();
  bubble('ai', text('welcome'));
  quickPrompts();
  sendBtn?.addEventListener('click', send);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') send(); });
  setupVoice();
  mounted = true;
  updateLocale();
}

function updateLocale() {
  if (!mounted) return;
  input.placeholder = text('placeholder');
  if (voice) voice.textContent = text('voice');
  const footer = document.querySelector('.pg-ai .chat-privacy');
  if (footer) {
    const icon = footer.querySelector('svg');
    footer.replaceChildren(...(icon ? [icon] : []), document.createTextNode(text('privacy')));
  }
  // 语言切换时如果还没开始对话，重绘欢迎语和快捷问题
  if (!history.length) {
    chat.replaceChildren();
    bubble('ai', text('welcome'));
    clearQuick();
    quickPrompts();
  }
}

window.PulseCamAI = { mount };
window.pulseLogUpdateAILanguage = updateLocale;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();

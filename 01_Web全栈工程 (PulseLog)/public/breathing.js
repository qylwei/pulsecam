const protocols = {
  regular: { inhale: 4, hold: 0, exhale: 6, minutes: 5 },
  bedtime: { inhale: 4, hold: 7, exhale: 8, minutes: 3 }
};
const strings = {
  zh: {
    title: '呼吸放松练习', description: '自然呼吸，不要用力或憋气。',
    caution: '若感到头晕、胸闷或气短，请立即停止并恢复自然呼吸。孕期、有心肺疾病、未控制的高血压或惊恐障碍，请先咨询医生；不要长时间屏息。',
    agree: '我已了解停止条件', regular: '吸气 4 秒 · 呼气 6 秒',
    bedtime: '入睡前可选：4-7-8', start: '开始练习', inhale: '吸气', exhale: '呼气',
    hold: '停顿', pause: '暂停', resume: '继续', end: '结束练习', done: '练习结束',
    rate: '现在的主观放松程度', save: '保存感受', saved: '已记录本次感受', close: '关闭'
  },
  en: {
    title: 'Breathing break', description: 'Breathe comfortably; do not force or hold your breath for long.',
    caution: 'Stop if you feel dizzy, chest discomfort or shortness of breath, and breathe normally. If pregnant or living with a heart or lung condition, uncontrolled high blood pressure or panic disorder, consult a clinician first. Avoid prolonged breath-holding.',
    agree: 'I understand when to stop', regular: 'Inhale 4 sec · exhale 6 sec',
    bedtime: 'Optional at bedtime: 4-7-8', start: 'Start', inhale: 'Inhale',
    exhale: 'Exhale', hold: 'Pause', pause: 'Pause', resume: 'Resume',
    end: 'End', done: 'Exercise finished', rate: 'How relaxed do you feel?',
    save: 'Save feeling', saved: 'Your rating was saved', close: 'Close'
  }
};
const locale = () => localStorage.getItem('pulsecam_lang') === 'en' ? 'en' : 'zh';
const t = key => strings[locale()][key];
let modal;
let timer;
let remaining;
let elapsed;
let paused;
let protocol;
let kind;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function close() {
  stop();
  modal?.remove();
  modal = null;
}

function finish() {
  stop();
  modal.querySelector('.bm-card').innerHTML = `
    <h2>${t('done')}</h2>
    <p>${t('rate')}</p>
    <div class="breath-ratings" role="group" aria-label="${t('rate')}">
      ${[1, 2, 3, 4, 5].map(value => `<label><input type="radio" name="breathRating" value="${value}"> ${value}</label>`).join('')}
    </div>
    <button type="button" class="breath-save">${t('save')}</button>
    <p class="breath-status" role="status"></p>
    <button type="button" class="breath-close">${t('close')}</button>`;
  modal.querySelector('.breath-close').addEventListener('click', close);
  modal.querySelector('.breath-save').addEventListener('click', () => {
    const rating = Number(modal.querySelector('input[name="breathRating"]:checked')?.value);
    if (!rating) return;
    let sessions;
    try { sessions = JSON.parse(localStorage.getItem('pulsecam_breath_sessions') || '[]'); } catch (_) { sessions = []; }
    if (!Array.isArray(sessions)) sessions = [];
    sessions.push({ at: new Date().toISOString(), protocol: kind, minutes: Math.round(elapsed / 60 * 10) / 10, rating });
    localStorage.setItem('pulsecam_breath_sessions', JSON.stringify(sessions.slice(-50)));
    modal.querySelector('.breath-status').textContent = t('saved');
    modal.querySelector('.breath-save').disabled = true;
  });
}

function tick() {
  if (paused) return;
  remaining--;
  elapsed++;
  if (remaining <= 0) { finish(); return; }
  const total = protocol.inhale + protocol.hold + protocol.exhale;
  const phase = elapsed % total;
  const state = phase < protocol.inhale ? 'inhale'
    : phase < protocol.inhale + protocol.hold ? 'hold' : 'exhale';
  modal.querySelector('.bm-phase').textContent = t(state);
  modal.querySelector('.bm-timer').textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  modal.querySelector('.bm-circle-inner').style.transform = state === 'inhale' ? 'scale(1.25)' : 'scale(0.8)';
}

function start() {
  kind = modal.querySelector('.breath-protocol').value;
  protocol = protocols[kind];
  remaining = protocol.minutes * 60;
  elapsed = 0;
  paused = false;
  modal.querySelector('.bm-card').innerHTML = `
    <h2>${t('title')}</h2>
    <div class="bm-circle-wrap"><div class="bm-circle-inner"></div><div class="bm-center-text">
      <span class="bm-phase">${t('inhale')}</span><span class="bm-timer"></span>
    </div></div>
    <button type="button" class="breath-pause">${t('pause')}</button>
    <button type="button" class="breath-end">${t('end')}</button>`;
  modal.querySelector('.breath-pause').addEventListener('click', event => {
    paused = !paused;
    event.currentTarget.textContent = t(paused ? 'resume' : 'pause');
  });
  modal.querySelector('.breath-end').addEventListener('click', finish);
  tick();
  timer = setInterval(tick, 1000);
}

function open() {
  close();
  modal = document.createElement('div');
  modal.className = 'breath-modal';
  modal.innerHTML = `
    <div class="bm-card" role="dialog" aria-modal="true" aria-label="${t('title')}">
      <button type="button" class="breath-close" aria-label="${t('close')}">×</button>
      <h2>${t('title')}</h2>
      <p>${t('description')}</p>
      <p class="breath-caution">${t('caution')}</p>
      <select class="breath-protocol" aria-label="${t('title')}">
        <option value="regular">${t('regular')}</option>
        <option value="bedtime">${t('bedtime')}</option>
      </select>
      <label class="breath-consent"><input type="checkbox"> ${t('agree')}</label>
      <button type="button" class="breath-start" disabled>${t('start')}</button>
    </div>`;
  document.body.append(modal);
  modal.querySelector('.breath-close').addEventListener('click', close);
  modal.querySelector('.breath-consent input').addEventListener('change', event => {
    modal.querySelector('.breath-start').disabled = !event.target.checked;
  });
  modal.querySelector('.breath-start').addEventListener('click', start);
}

window.PulseCamBreathing = { open, close };

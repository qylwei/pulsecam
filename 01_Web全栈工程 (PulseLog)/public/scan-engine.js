/**
 * PulseCam · 扫脸引擎 v2
 *
 * 5 秒自检：人脸/唯一性/距离/居中度/姿态/光照/反光/清晰度/稳定度 → 质量分
 * 可选 15 秒心率，或 60 秒短时 HRV：面部 RGB → POS → 带通 → 自相关。
 *
 * 设计原则：
 * 1) 5 秒只检查质量；15 秒只估算心率；60 秒且质量合格才估算短时 HRV。
 * 2) 低置信度就拒绝出数，而不是给一个看起来像真的数字。
 * 3) 视频帧不落地、不上传；只在内存里取均值。
 */
import { estimatePulse, uncertaintyFor } from '/pulse.js';

const GATE_SECONDS = 5;
const HR_SECONDS = 15;
const DEEP_SECONDS = 60;
const DETECT_INTERVAL = 110; // ms，人脸检测约 9fps，足够做门控
const CROP = 48; // 质量分析用的缩略图尺寸
const ROI = 32; // 心率采样用的缩略图尺寸

const TEXT = {
  zh: {
    start: '开始扫脸',
    manual: '手动填写今日记录',
    intro: '面向前置摄像头，画面只在本机处理。',
    privacy: '扫脸做光线/姿态/稳定性自检；可选 15 秒心率参考测量，不测 HRV。',
    phaseGate: '自检中',
    phaseHr: '心率测量中',
    camera: '正在打开摄像头…',
    loading: '正在加载人脸检测模型…',
    noFace: '未检测到面部，请正对镜头',
    multiple: '画面中只能有一个人',
    far: '请靠近一点，让面部更大',
    near: '请稍微远离镜头',
    center: '请把面部移到画面中央',
    dark: '光线偏暗，请面向光源',
    bright: '画面过曝，请避开强逆光',
    glare: '镜片或额头反光，稍微调整角度',
    pose: '请正对镜头，不要侧脸或歪头',
    blur: '画面有点糊，请拿稳或擦一下镜头',
    motion: '检测到晃动，请保持静止',
    steady: '已锁定 · 保持静止',
    quality: '质量',
    light: '光线',
    poseLabel: '姿态',
    steadyLabel: '稳定',
    ok: '正常',
    bad: '待调整',
    gateDone: '自检完成',
    gateDoneText: '光线、姿态与稳定性已通过，可以开始测量。',
    checksTitle: '本次自检',
    startHr: '测量心率（15 秒）',
    startDeep: '60 秒深测（短时 HRV）',
    deepNote: '短时程参考（60 秒），未经真人对照验证。',
    skipHr: '直接填写今日记录',
    retry: '重新自检',
    hrDone: '心率参考结果',
    hrBand: '±{n} bpm · 置信度 {c}%',
    hrNote: '摄像头 rPPG 参考值，非医疗用途。5 秒/15 秒窗口不足以计算 HRV，故本次不提供。',
    deepResultNote: '摄像头短时程参考值，尚未完成真人设备对照；不用于医疗判断。',
    hrFail: '信号质量不足，未能得出可靠心率',
    hrFailText: '请保持静止、改善光线后重试；也可以直接手动记录。',
    hrManual: '填写今日记录',
    hrRetry: '重新测量',
    hrWait: '保持静止，正在积累信号…',
    hrLive: '实时估算',
    unavailable: '摄像头不可用，请检查权限或使用手动记录。',
    denied: '相机权限被拒绝，请在浏览器地址栏的权限设置里允许摄像头。',
    busy: '摄像头被其他程序占用，请先关闭占用它的应用。',
    insecure: '当前不是安全上下文（https 或 localhost），浏览器不允许调用摄像头。',
    modelFail: '人脸检测模型加载失败，可重试或用手动记录。',
  },
  en: {
    start: 'Start Face Scan',
    manual: 'Manual Daily Record',
    intro: 'Align your face with the front camera. Video stays on this device.',
    privacy: 'Scan checks light, pose and steadiness. Optional 15s heart-rate estimate; no HRV.',
    phaseGate: 'Checking',
    phaseHr: 'Measuring HR',
    camera: 'Requesting camera…',
    loading: 'Loading face detector…',
    noFace: 'No face detected — face the camera',
    multiple: 'Only one face at a time',
    far: 'Move closer to the camera',
    near: 'Move a little further away',
    center: 'Center your face in the frame',
    dark: 'Too dark — face a light source',
    bright: 'Overexposed — avoid strong backlight',
    glare: 'Glasses or forehead glare — tilt slightly',
    pose: 'Face the camera, keep your head level',
    blur: 'Image is soft — hold still or clean the lens',
    motion: 'Movement detected — hold still',
    steady: 'Locked · hold still',
    quality: 'Quality',
    light: 'Light',
    poseLabel: 'Pose',
    steadyLabel: 'Steady',
    ok: 'OK',
    bad: 'Adjust',
    gateDone: 'Scan complete',
    gateDoneText: 'Light, pose and steadiness passed. You can start the measurement.',
    checksTitle: 'This scan',
    startHr: 'Measure heart rate (15s)',
    startDeep: 'Deep scan (60s short-window HRV)',
    deepNote: 'Short-window reference (60s), not yet validated against a reference device.',
    skipHr: 'Fill in today’s record',
    retry: 'Scan again',
    hrDone: 'Heart-rate estimate',
    hrBand: '±{n} bpm · confidence {c}%',
    hrNote: 'Camera rPPG estimate, not for medical use. A 5–15s window cannot produce HRV, so none is shown.',
    deepResultNote: 'Short-window camera estimate, not yet compared with a reference device. Not for medical decisions.',
    hrFail: 'Signal too weak for a reliable heart rate',
    hrFailText: 'Hold still and improve the light, then retry — or record manually.',
    hrManual: 'Fill in today’s record',
    hrRetry: 'Measure again',
    hrWait: 'Hold still, collecting signal…',
    hrLive: 'Live estimate',
    unavailable: 'Camera unavailable. Check permissions or use manual entry.',
    denied: 'Camera permission denied. Allow it in the browser’s site settings.',
    busy: 'Camera is in use by another app. Close it and retry.',
    insecure: 'Camera needs a secure context (https or localhost).',
    modelFail: 'Face detector failed to load. Retry or record manually.',
  },
};

const lang = () => (localStorage.getItem('pulsecam_lang') === 'en' ? 'en' : 'zh');
const text = key => TEXT[lang()][key] ?? key;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let mounted = false;
let phase = 'idle';
let seq = 0;
let stream = null;
let detector = null;
let rafId = 0;
let vfcId = 0;
let sampleRafId = 0;
let liveTimer = 0;

let idleEl = null;
let scanEl = null;
let doneEl = null;
let video = null;
let overlay = null;
let overlayCtx = null;
let cropCanvas = null;
let cropCtx = null;
let roiCanvas = null;
let roiCtx = null;

let scoreEl = null;
let barEl = null;
let hintEl = null;
let secondsEl = null;
let metaLight = null;
let metaPose = null;
let metaSteady = null;
let progressEl = null;
let phaseLabel = null;
let cancelBtn = null;

let hrLiveEl = null;
let hrValueEl = null;
let hrHintEl = null;
let bvpCanvas = null;

let gateResultEl = null;
let hrResultEl = null;
let finalScoreEl = null;
let finalTextEl = null;
let checksEl = null;
let hrFinalEl = null;
let hrBandEl = null;
let hrNoteEl = null;

let lastDetect = 0;
let lastBox = null;
let lastMetrics = null;
let lastLuma = null;
let gateHold = 0;
let gateLast = 0;
let hrSamples = [];
let hrStart = 0;
let lastFaceAt = 0;
let lastHr = null;
let measurementMode = 'quick';

function injectStyles() {
  if (document.getElementById('pc-scan-style')) return;
  const style = document.createElement('style');
  style.id = 'pc-scan-style';
  style.textContent = `
.pc-scan-cam{height:300px!important}
.pc-scan-tag{position:absolute;top:10px;left:12px;z-index:3;display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:99px;background:rgba(0,0,0,.45);color:#E8F1E9;font-size:11px;letter-spacing:.04em}
.pc-scan-dot{width:6px;height:6px;border-radius:50%;background:var(--coral);animation:pcPulse 1.2s infinite}
@keyframes pcPulse{0%,100%{opacity:1}50%{opacity:.3}}
.pc-quality{padding:12px 14px;border-radius:14px;background:var(--card);border:1px solid var(--line-soft)}
.pc-quality-head{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--ink-soft);margin-bottom:8px;gap:10px}
.pc-quality-head b{font:600 16px/1 ui-monospace,SFMono-Regular,monospace;color:var(--ink)}
.pc-quality-bar{height:6px;border-radius:99px;background:var(--fog);overflow:hidden}
.pc-quality-bar i{display:block;height:100%;width:0;background:var(--sage);transition:width .16s linear,background .2s}
.pc-quality-meta{display:flex;gap:14px;margin-top:7px;font-size:10.5px;color:var(--ink-mute)}
.pc-hr-live{padding:12px 14px;border-radius:14px;background:var(--card);border:1px solid var(--line-soft);text-align:center}
.pc-hr-num b{font:300 34px/1.1 -apple-system,BlinkMacSystemFont,sans-serif;color:var(--ink)}
.pc-hr-num span{font-size:11px;color:var(--ink-mute);margin-left:4px}
.pc-hr-hint{font-size:10.5px;color:var(--ink-mute);margin-top:4px}
.pc-hr-live canvas{width:100%;height:44px;display:block;margin-top:8px}
.pc-checks{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
.pc-check{display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:10px;background:var(--card);border:1px solid var(--line-soft);font-size:11.5px;color:var(--ink-soft)}
.pc-check b{color:var(--sage-d);font-weight:600}
.pc-check.bad b{color:var(--coral-d)}
.pc-big{color:var(--ink);text-align:center;margin:6px 0}
.pc-big b{display:block;font:300 46px/1 -apple-system,BlinkMacSystemFont,sans-serif}
.pc-big span{display:block;font:500 11px/1.8 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.1em;color:var(--ink-mute);margin-top:4px}
.pc-hr-big{font:300 44px/1.1 -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;color:var(--ink)}
.pc-hr-big b{font-weight:300}
.pc-hr-big span{font-size:13px;color:var(--ink-mute);margin-left:4px}
.pc-note{font-size:11px;line-height:1.6;color:var(--ink-mute);text-align:center;margin:8px 0 4px}
.pc-actions{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.pc-actions .btn-idle-manual,.pc-actions .btn-restart-measure{width:100%}
`;
  document.head.append(style);
}

function buildScanning(root) {
  root.innerHTML = `
    <div class="camera-preview pc-scan-cam">
      <video autoplay muted playsinline></video>
      <canvas class="face-scan-overlay"></canvas>
      <div class="pc-scan-tag"><span class="pc-scan-dot"></span><span data-pc="phaseLabel"></span></div>
    </div>
    <div class="pc-quality">
      <div class="pc-quality-head"><span data-pc="hint"></span><b data-pc="score">--</b></div>
      <div class="pc-quality-bar"><i data-pc="bar"></i></div>
      <div class="pc-quality-meta">
        <span data-pc="metaLight"></span>
        <span data-pc="metaPose"></span>
        <span data-pc="metaSteady"></span>
      </div>
    </div>
    <div class="measure-progress-card">
      <div class="mp-bar-bg"><div class="mp-bar-fill" data-pc="progress"></div></div>
      <div class="mp-meta"><span data-pc="seconds"></span><span data-pc="qualityLabel"></span></div>
    </div>
    <div class="pc-hr-live" data-pc="hrLive" style="display:none">
      <div class="pc-hr-num"><b data-pc="hrValue">--</b><span>bpm</span></div>
      <div class="pc-hr-hint" data-pc="hrHint"></div>
      <canvas data-pc="bvp"></canvas>
    </div>
    <button class="btn-cancel-measure" type="button" data-pc="cancel"></button>
  `;
}

function buildDone(root) {
  root.innerHTML = `
    <div data-pc="gateResult">
      <div class="result-card">
        <div class="rc-label" data-pc="gateTitle"></div>
        <div class="pc-big"><b data-pc="scoreBig">--</b><span data-pc="qualityCaption"></span></div>
        <div class="done-status-text" data-pc="gateText"></div>
      </div>
      <div class="pc-checks" data-pc="checks"></div>
      <div class="pc-actions">
        <button class="btn-start-measure" type="button" data-pc="startHr"></button>
        <button class="btn-idle-manual" type="button" data-pc="startDeep"></button>
        <button class="btn-idle-manual" type="button" data-pc="skipHr"></button>
        <button class="btn-restart-measure" type="button" data-pc="retryGate"></button>
      </div>
    </div>
    <div data-pc="hrResult" style="display:none">
      <div class="result-card">
        <div class="rc-label" data-pc="hrTitle"></div>
        <div class="pc-hr-big"><b data-pc="hrFinal">--</b><span>bpm</span></div>
        <div class="done-status-text" data-pc="hrBand"></div>
        <div class="done-status-text" data-pc="deepHrv"></div>
      </div>
      <div class="pc-note" data-pc="hrNote"></div>
      <div class="pc-actions">
        <button class="btn-start-measure" type="button" data-pc="hrManual"></button>
        <button class="btn-restart-measure" type="button" data-pc="hrRetry"></button>
      </div>
    </div>
  `;
}

const q = (root, key) => root.querySelector(`[data-pc="${key}"]`);

function mount() {
  if (mounted) return;
  idleEl = document.getElementById('measureIdle');
  scanEl = document.getElementById('measureMeasuring');
  doneEl = document.getElementById('measureDone');
  if (!idleEl || !scanEl || !doneEl) return;

  injectStyles();
  buildScanning(scanEl);
  buildDone(doneEl);

  video = scanEl.querySelector('video');
  overlay = scanEl.querySelector('canvas');
  overlayCtx = overlay.getContext('2d');
  scoreEl = q(scanEl, 'score');
  barEl = q(scanEl, 'bar');
  hintEl = q(scanEl, 'hint');
  secondsEl = q(scanEl, 'seconds');
  metaLight = q(scanEl, 'metaLight');
  metaPose = q(scanEl, 'metaPose');
  metaSteady = q(scanEl, 'metaSteady');
  progressEl = q(scanEl, 'progress');
  phaseLabel = q(scanEl, 'phaseLabel');
  cancelBtn = q(scanEl, 'cancel');
  hrLiveEl = q(scanEl, 'hrLive');
  hrValueEl = q(scanEl, 'hrValue');
  hrHintEl = q(scanEl, 'hrHint');
  bvpCanvas = q(scanEl, 'bvp');

  gateResultEl = q(doneEl, 'gateResult');
  hrResultEl = q(doneEl, 'hrResult');
  finalScoreEl = q(doneEl, 'scoreBig');
  finalTextEl = q(doneEl, 'gateText');
  checksEl = q(doneEl, 'checks');
  hrFinalEl = q(doneEl, 'hrFinal');
  hrBandEl = q(doneEl, 'hrBand');
  hrNoteEl = q(doneEl, 'hrNote');

  cropCanvas = document.createElement('canvas');
  cropCanvas.width = CROP;
  cropCanvas.height = CROP;
  cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
  roiCanvas = document.createElement('canvas');
  roiCanvas.width = ROI;
  roiCanvas.height = ROI;
  roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });

  cancelBtn.addEventListener('click', () => setPhase('idle'));
  q(doneEl, 'startHr').addEventListener('click', startHr);
  q(doneEl, 'startDeep').addEventListener('click', () => startHr('deep'));
  q(doneEl, 'skipHr').addEventListener('click', () => showManual());
  q(doneEl, 'retryGate').addEventListener('click', startGate);
  q(doneEl, 'hrManual').addEventListener('click', () => showManual());
  q(doneEl, 'hrRetry').addEventListener('click', () => startHr(measurementMode));

  const startBtn = document.getElementById('btnStartMeasure');
  const manualBtn = document.getElementById('btnIdleManual');
  if (startBtn) startBtn.addEventListener('click', startGate);
  if (manualBtn) manualBtn.addEventListener('click', () => showManual());

  window.pulseLogStopCamera = () => {
    if (phase === 'gate' || phase === 'hr') setPhase('idle');
    const form = document.querySelector('.manual-checkin');
    form?.querySelector('input[name="heartRate"]')?.remove();
    if (form) { delete form.dataset.scanQuality; delete form.dataset.scanHrv; }
    lastHr = null;
  };
  window.pulseLogUpdateScanLanguage = updateLocale;
  window.switchScenario = button => {
    if (!button) return;
    const target = document.querySelectorAll('#scenarioPills .scenario-pill');
    target.forEach(pill => pill.classList.remove('active'));
    button.classList.add('active');
    const input = document.querySelector('.manual-checkin input[name="scenario"]');
    if (input) {
      input.dataset.code = button.dataset.scenario || '日常';
      input.value = button.textContent.trim();
    }
  };

  mounted = true;
  updateLocale();
  setPhase('idle');

  // 空闲时预热模型，避免点“开始扫脸”后干等
  setTimeout(() => ensureDetector().catch(() => {}), 1500);
}

function updateLocale() {
  const startBtn = document.getElementById('btnStartMeasure');
  const manualBtn = document.getElementById('btnIdleManual');
  if (startBtn) startBtn.textContent = text('start');
  if (manualBtn) manualBtn.textContent = text('manual');
  const sub = document.querySelector('.pg-measure .lens-sub');
  if (sub) sub.textContent = text('intro');
  const privacy = document.querySelector('.pg-measure .privacy-label span');
  if (privacy) privacy.textContent = text('privacy');

  if (scanEl) {
    if (phaseLabel) phaseLabel.textContent = phase === 'hr' ? text('phaseHr') : text('phaseGate');
    if (cancelBtn) cancelBtn.textContent = lang() === 'en' ? 'Cancel' : '取消';
    q(scanEl, 'qualityLabel').textContent = `${text('quality')} · ${text('light')} / ${text('poseLabel')} / ${text('steadyLabel')}`;
    if (hrHintEl && phase === 'hr') hrHintEl.textContent = text('hrWait');
  }
  if (doneEl) {
    q(doneEl, 'gateTitle').textContent = text('gateDone');
    q(doneEl, 'qualityCaption').textContent = text('quality');
    q(doneEl, 'gateText').textContent = text('gateDoneText');
    q(doneEl, 'startHr').textContent = text('startHr');
    q(doneEl, 'startDeep').textContent = text('startDeep');
    q(doneEl, 'skipHr').textContent = text('skipHr');
    q(doneEl, 'retryGate').textContent = text('retry');
    q(doneEl, 'hrTitle').textContent = text('hrDone');
    q(doneEl, 'hrManual').textContent = text('hrManual');
    q(doneEl, 'hrRetry').textContent = text('hrRetry');
    q(doneEl, 'hrNote').textContent = text(measurementMode === 'deep' ? 'deepResultNote' : 'hrNote');
  }
  renderChecks(lastMetrics);
}

function setPhase(next) {
  if ((phase === 'gate' || phase === 'hr') && next !== phase) stopCamera();
  phase = next;
  if (idleEl) idleEl.style.display = next === 'idle' ? 'flex' : 'none';
  if (scanEl) scanEl.style.display = next === 'gate' || next === 'hr' ? 'flex' : 'none';
  if (doneEl) doneEl.style.display = next === 'gateDone' || next === 'hrDone' ? 'flex' : 'none';
  if (gateResultEl) gateResultEl.style.display = next === 'hrDone' ? 'none' : 'block';
  if (hrResultEl) hrResultEl.style.display = next === 'hrDone' ? 'block' : 'none';
  if (hrLiveEl) hrLiveEl.style.display = next === 'hr' ? 'block' : 'none';
  if (phaseLabel) phaseLabel.textContent = next === 'hr' ? text('phaseHr') : text('phaseGate');
  if (next === 'idle') {
    lastBox = null;
    lastMetrics = null;
    lastLuma = null;
    if (barEl) barEl.style.width = '0%';
  }
}

function showManual() {
  if (phase === 'hrDone' && lastHr) attachHr();
  setPhase('idle');
  const form = document.querySelector('.manual-checkin');
  if (!form) return;
  form.classList.add('show');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function attachHr() {
  const form = document.querySelector('.manual-checkin');
  if (!form) return;
  let input = form.querySelector('input[name="heartRate"]');
  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'heartRate';
    form.append(input);
  }
  input.value = lastHr ? String(Math.round(lastHr.bpm)) : '';
  if (lastHr) form.dataset.scanQuality = String(lastHr.confidence);
  if (lastHr?.hrv != null) form.dataset.scanHrv = String(Math.round(lastHr.hrv.rmssd));
}

async function ensureDetector() {
  if (detector) return detector;
  const mod = await import('/face-scan.js');
  detector = await mod.loadFaceDetector();
  return detector;
}

function cameraErrorText(error) {
  const name = error && error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? text('denied')
      : text('insecure');
  }
  if (name === 'NotReadableError' || name === 'AbortError') return text('busy');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return text('unavailable');
  return text('unavailable');
}

function fail(message) {
  setPhase('idle');
  const box = document.createElement('div');
  box.className = 'face-scan-error';
  box.setAttribute('role', 'alert');
  box.textContent = message;
  const old = idleEl.querySelector('.face-scan-error');
  if (old) old.remove();
  idleEl.prepend(box);
}

async function openCamera() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new DOMException('unsupported', 'NotSupportedError');
  }
  const media = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
  try {
    video.srcObject = media;
    await video.play();
  } catch (error) {
    media.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    throw error;
  }
  return media;
}

function stopCamera() {
  seq++;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (vfcId && video && typeof video.cancelVideoFrameCallback === 'function') {
    try { video.cancelVideoFrameCallback(vfcId); } catch (_) {}
  }
  vfcId = 0;
  if (sampleRafId) cancelAnimationFrame(sampleRafId);
  sampleRafId = 0;
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = 0;
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  if (video) video.srcObject = null;
  if (overlayCtx) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  lastDetect = 0;
  lastBox = null;
  lastLuma = null;
}

async function startGate() {
  if (phase === 'gate' || phase === 'hr') return;
  lastHr = null;
  const form = document.querySelector('.manual-checkin');
  form?.querySelector('input[name="heartRate"]')?.remove();
  if (form) { delete form.dataset.scanQuality; delete form.dataset.scanHrv; }
  setPhase('gate');
  const token = ++seq;
  gateHold = 0;
  gateLast = 0;
  lastBox = null;
  lastMetrics = null;
  lastLuma = null;
  if (hintEl) hintEl.textContent = text('camera');
  if (progressEl) progressEl.style.width = '0%';
  if (secondsEl) secondsEl.textContent = `0 / ${GATE_SECONDS} ${lang() === 'en' ? 's' : '秒'}`;
  if (hrLiveEl) hrLiveEl.style.display = 'none';

  const stale = idleEl && idleEl.querySelector('.face-scan-error');
  if (stale) stale.remove();

  try {
    stream = await openCamera();
    if (token !== seq) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
      if (video) video.srcObject = null;
      return;
    }
    if (hintEl) hintEl.textContent = text('loading');
    detector = await ensureDetector();
    if (token !== seq) return;
    lastDetect = 0;
    rafId = requestAnimationFrame(detectLoop);
  } catch (error) {
    if (token !== seq) return;
    const isModel = !(error && error.name);
    fail(isModel ? text('modelFail') : cameraErrorText(error));
  }
}

function startHr(mode = 'quick') {
  if (phase === 'hr') return;
  lastHr = null;
  const form = document.querySelector('.manual-checkin');
  form?.querySelector('input[name="heartRate"]')?.remove();
  if (form) { delete form.dataset.scanQuality; delete form.dataset.scanHrv; }
  measurementMode = mode === 'deep' ? 'deep' : 'quick';
  const duration = measurementMode === 'deep' ? DEEP_SECONDS : HR_SECONDS;
  setPhase('hr');
  const token = ++seq;
  hrSamples = [];
  hrStart = 0;
  lastFaceAt = performance.now();
  lastDetect = 0;
  lastBox = null;
  if (hrValueEl) hrValueEl.textContent = '--';
  if (hrHintEl) hrHintEl.textContent = text('hrWait');
  if (progressEl) progressEl.style.width = '0%';
  if (secondsEl) secondsEl.textContent = `0 / ${duration} ${lang() === 'en' ? 's' : '秒'}`;

  openCamera()
    .then(media => {
      if (token !== seq) {
        media.getTracks().forEach(track => track.stop());
        return;
      }
      stream = media;
      hrStart = performance.now();
      lastFaceAt = hrStart;
      rafId = requestAnimationFrame(detectLoop);
      startSampling();
      liveTimer = setInterval(updateLive, 650);
    })
    .catch(error => {
      if (token !== seq) return;
      fail(cameraErrorText(error));
    });
}

function startSampling() {
  if (!video) return;
  if (typeof video.requestVideoFrameCallback === 'function') {
    const step = () => {
      if (phase !== 'hr') return;
      vfcId = video.requestVideoFrameCallback(step);
      pushSample();
    };
    vfcId = video.requestVideoFrameCallback(step);
  } else {
    const step = () => {
      if (phase !== 'hr') return;
      sampleRafId = requestAnimationFrame(step);
      pushSample();
    };
    sampleRafId = requestAnimationFrame(step);
  }
}

function pushSample() {
  if (!lastBox || !video || video.readyState < 2) return;
  const t = performance.now() / 1000;
  const values = sampleRois(lastBox);
  if (!values) return;
  hrSamples.push({ t, r: values.r, g: values.g, b: values.b });
  if (hrSamples.length > 30 * DEEP_SECONDS * 2) hrSamples.shift();
}

/** 把额头 + 双颊三块区域的 RGB 均值取出来（不保存图像）。 */
function sampleRois(box) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const sx = clamp(box.x, 0, vw - 2);
  const sy = clamp(box.y, 0, vh - 2);
  const sw = clamp(box.w, 2, vw - sx);
  const sh = clamp(box.h, 2, vh - sy);
  roiCtx.drawImage(video, sx, sy, sw, sh, 0, 0, ROI, ROI);
  const data = roiCtx.getImageData(0, 0, ROI, ROI).data;

  const regions = [
    [9, 3, 23, 8], // 额头
    [5, 17, 12, 24], // 左颊
    [20, 17, 27, 24], // 右颊
  ];
  let R = 0;
  let G = 0;
  let B = 0;
  let n = 0;
  for (const [x0, y0, x1, y1] of regions) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * ROI + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r + g + b > 735) continue; // 镜片/高光像素不参与
        R += r;
        G += g;
        B += b;
        n++;
      }
    }
  }
  if (!n) return null;
  return { r: R / n, g: G / n, b: B / n };
}

function detectLoop(now) {
  if (phase !== 'gate' && phase !== 'hr') return;
  rafId = requestAnimationFrame(detectLoop);
  if (now - lastDetect < DETECT_INTERVAL || video.readyState < 2 || !video.videoWidth) return;
  lastDetect = now;

  let detections = [];
  try {
    detections = detector.detectForVideo(video, now).detections || [];
  } catch (_) {
    return;
  }
  const face = detections.length === 1 ? detections[0] : null;
  const metrics = face ? measureFace(face) : null;
  lastMetrics = metrics;

  if (phase === 'hr') {
    if (face && metrics) {
      lastFaceAt = now;
      lastBox = metrics.valid ? metrics.box : null;
    } else if (now - lastFaceAt > 1200) {
      abortHr();
      return;
    }
  } else {
    lastMetrics = metrics;
  }

  drawOverlay(face, metrics);

  if (phase === 'gate') {
    tickGate(now, detections.length, metrics);
  } else {
    tickHr(now, face, metrics, detections.length);
  }
}

function measureFace(face) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const box = face.boundingBox;
  const sx = clamp(box.originX, 0, vw - 2);
  const sy = clamp(box.originY, 0, vh - 2);
  const sw = clamp(box.width, 2, vw - sx);
  const sh = clamp(box.height, 2, vh - sy);

  cropCtx.drawImage(video, sx, sy, sw, sh, 0, 0, CROP, CROP);
  const data = cropCtx.getImageData(0, 0, CROP, CROP).data;
  const luma = new Float32Array(CROP * CROP);
  let bright = 0;
  let sat = 0;
  let dark = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    luma[p] = v;
    bright += v;
    if (v > 245) sat++;
    if (v < 25) dark++;
  }
  const pixels = CROP * CROP;
  const brightness = bright / pixels;
  const satRatio = sat / pixels;
  const darkRatio = dark / pixels;

  // 拉普拉斯方差：越小越糊
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  for (let y = 1; y < CROP - 1; y++) {
    for (let x = 1; x < CROP - 1; x++) {
      const i = y * CROP + x;
      const lap = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - CROP] - luma[i + CROP];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
    }
  }
  const lapMean = lapSum / Math.max(1, lapCount);
  const sharpness = lapSqSum / Math.max(1, lapCount) - lapMean * lapMean;

  // 姿态：用 6 个关键点的比例（单位无关）
  let roll = 0;
  let yaw = 0;
  let poseOk = true;
  const kp = face.keypoints;
  if (Array.isArray(kp) && kp.length >= 3) {
    const eyeDist = Math.hypot(kp[1].x - kp[0].x, kp[1].y - kp[0].y) || 1;
    roll = (Math.atan2(kp[1].y - kp[0].y, kp[1].x - kp[0].x) * 180) / Math.PI;
    yaw = (kp[2].x - (kp[0].x + kp[1].x) / 2) / eyeDist;
    poseOk = Math.abs(roll) < 12 && Math.abs(yaw) < 0.3;
  }

  const cx = (box.originX + box.width / 2) / vw;
  const cy = (box.originY + box.height / 2) / vh;
  const size = box.width / vw;

  // 运动：人脸框位移 + 画面残差
  let motion = 0;
  if (lastMetrics) {
    const dc = Math.hypot(cx - lastMetrics.cx, cy - lastMetrics.cy);
    let diff = 0;
    if (lastLuma) {
      for (let i = 0; i < luma.length; i++) diff += Math.abs(luma[i] - lastLuma[i]);
      diff = diff / luma.length / 255;
    }
    motion = Math.max(dc, diff * 0.6);
  }
  lastLuma = luma;

  const penalties = [];
  const add = (key, amount) => penalties.push({ key, amount });
  if (brightness < 55) add('dark', 40);
  else if (brightness < 75) add('dark', 22);
  if (brightness > 205) add('bright', 30);
  if (satRatio > 0.06) add('glare', 22);
  if (darkRatio > 0.3) add('dark', 14);
  if (sharpness < 10) add('blur', 16);
  if (size < 0.16) add('far', 32);
  else if (size < 0.2) add('far', 14);
  if (size > 0.58) add('near', 14);
  if (Math.abs(cx - 0.5) > 0.17 || Math.abs(cy - 0.48) > 0.19) add('center', 18);
  if (!poseOk) add('pose', 26);
  if (motion > 0.02) add('motion', 34);
  else if (motion > 0.012) add('motion', 18);

  const penalty = penalties.reduce((sum, p) => sum + p.amount, 0);
  const score = clamp(100 - penalty, 0, 100);
  const top = penalties.slice().sort((a, b) => b.amount - a.amount)[0];
  // 是否放行只看硬条件：距离、亮度、姿态、晃动。
  // 质量分用于展示和"扣分原因"，不把几个轻微扣分叠加成"不合格"。
  const valid = size >= 0.16 && size <= 0.6 && brightness >= 50 && brightness <= 215 && poseOk && motion <= 0.03;

  return {
    box: { x: sx, y: sy, w: sw, h: sh },
    cx,
    cy,
    size,
    brightness,
    satRatio,
    darkRatio,
    sharpness,
    motion,
    roll,
    yaw,
    poseOk,
    score,
    valid,
    hint: top ? top.key : 'steady',
  };
}

function drawOverlay(face, metrics) {
  if (!overlayCtx || !video) return;
  const rect = overlay.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }
  overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  overlayCtx.clearRect(0, 0, rect.width, rect.height);
  if (!face) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.max(rect.width / vw, rect.height / vh);
  const offsetX = (rect.width - vw * scale) / 2;
  const offsetY = (rect.height - vh * scale) / 2;
  const mapX = x => rect.width - (x * scale + offsetX); // 预览是镜像的
  const mapY = y => y * scale + offsetY;
  const box = face.boundingBox;
  const x = mapX(box.originX + box.width);
  const y = mapY(box.originY);
  const bw = box.width * scale;
  const bh = box.height * scale;
  const good = Boolean(metrics && metrics.valid);

  overlayCtx.strokeStyle = good ? '#A8DFA9' : '#F4BC70';
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeRect(x, y, bw, bh);

  // 三块采样区，直观看得出"测的是哪里"
  overlayCtx.strokeStyle = good ? 'rgba(168,223,169,0.75)' : 'rgba(244,188,112,0.75)';
  overlayCtx.lineWidth = 1;
  const regions = [
    [0.28, 0.09, 0.72, 0.25],
    [0.16, 0.53, 0.38, 0.75],
    [0.62, 0.53, 0.84, 0.75],
  ];
  for (const [x0, y0, x1, y1] of regions) {
    const rx = mapX(box.originX + box.width * x1);
    const ry = mapY(box.originY + box.height * y0);
    overlayCtx.strokeRect(rx, ry, box.width * (x1 - x0) * scale, box.height * (y1 - y0) * scale);
  }
}

function tickGate(now, faceCount, metrics) {
  const dt = gateLast ? Math.min(0.4, (now - gateLast) / 1000) : 0;
  gateLast = now;
  const ok = Boolean(metrics && metrics.valid);
  if (ok) gateHold = Math.min(GATE_SECONDS, gateHold + dt);
  else gateHold = Math.max(0, gateHold - dt * 2);

  if (progressEl) progressEl.style.width = `${(gateHold / GATE_SECONDS) * 100}%`;
  if (secondsEl) {
    secondsEl.textContent = `${Math.min(GATE_SECONDS, Math.floor(gateHold))} / ${GATE_SECONDS} ${lang() === 'en' ? 's' : '秒'}`;
  }

  if (scoreEl) scoreEl.textContent = metrics ? Math.round(metrics.score) : '--';
  if (barEl) {
    barEl.style.width = `${metrics ? metrics.score : 0}%`;
    barEl.style.background = !metrics || metrics.score < 60 ? 'var(--coral)' : metrics.score < 78 ? 'var(--gold)' : 'var(--sage)';
  }
  if (hintEl) {
    hintEl.textContent = faceCount > 1 ? text('multiple') : metrics ? text(metrics.hint) : text('noFace');
  }
  if (metaLight) metaLight.textContent = `${text('light')} · ${metrics ? (metrics.brightness < 70 || metrics.brightness > 200 ? text('bad') : text('ok')) : '--'}`;
  if (metaPose) metaPose.textContent = `${text('poseLabel')} · ${metrics ? (metrics.poseOk ? text('ok') : text('bad')) : '--'}`;
  if (metaSteady) metaSteady.textContent = `${text('steadyLabel')} · ${metrics ? (metrics.motion > 0.012 ? text('bad') : text('ok')) : '--'}`;

  if (gateHold >= GATE_SECONDS) finishGate(metrics);
}

function tickHr(now, face, metrics, faceCount) {
  const duration = measurementMode === 'deep' ? DEEP_SECONDS : HR_SECONDS;
  const elapsed = hrStart ? Math.min(duration, (now - hrStart) / 1000) : 0;
  if (progressEl) progressEl.style.width = `${(elapsed / duration) * 100}%`;
  if (secondsEl) secondsEl.textContent = `${Math.floor(elapsed)} / ${duration} ${lang() === 'en' ? 's' : '秒'}`;
  if (hintEl) hintEl.textContent = !face ? (faceCount > 1 ? text('multiple') : text('noFace')) : text('hrWait');

  if (hrStart && now - hrStart >= duration * 1000) finishHr();
}

function finishGate(metrics) {
  stopCamera();
  if (finalScoreEl) finalScoreEl.textContent = metrics ? Math.round(metrics.score) : '--';
  renderChecks(metrics);
  setPhase('gateDone');
}

function renderChecks(metrics) {
  if (!checksEl) return;
  const label = {
    light: text('light'),
    poseLabel: text('poseLabel'),
    steadyLabel: text('steadyLabel'),
    distance: lang() === 'en' ? 'Distance' : '距离',
  };
  const rows = [
    ['light', metrics ? metrics.brightness >= 50 && metrics.brightness <= 215 : false],
    ['poseLabel', metrics ? metrics.poseOk : false],
    ['steadyLabel', metrics ? metrics.motion <= 0.03 : false],
    ['distance', metrics ? metrics.size >= 0.16 && metrics.size <= 0.6 : false],
  ];
  checksEl.innerHTML = rows
    .map(([key, ok]) => `<div class="pc-check ${ok ? '' : 'bad'}"><b>${ok ? '✓' : '—'}</b><span>${label[key]}</span></div>`)
    .join('');
}

function updateLive() {
  if (phase !== 'hr' || !hrSamples.length) return;
  const est = estimatePulse(hrSamples, { minDuration: 6 });
  if (!est.ok) return;
  if (hrValueEl) hrValueEl.textContent = est.confidence >= 0.5 ? String(Math.round(est.bpm)) : '--';
  if (hrHintEl) {
    hrHintEl.textContent =
      est.confidence >= 0.5
        ? `${text('hrLive')} · ${Math.round(est.duration)}s · ${Math.round(est.confidence * 100)}%`
        : text('hrWait');
  }
  if (est.confidence >= 0.45) drawBvp(est);
}

function drawBvp(est) {
  if (!bvpCanvas) return;
  const w = bvpCanvas.clientWidth || 280;
  const h = 44;
  const dpr = window.devicePixelRatio || 1;
  if (bvpCanvas.width !== Math.round(w * dpr)) {
    bvpCanvas.width = Math.round(w * dpr);
    bvpCanvas.height = Math.round(h * dpr);
  }
  const ctx = bvpCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const data = est.h;
  if (!data || data.length < 8) return;
  const span = Math.min(data.length, Math.round(est.fs * 5));
  const start = data.length - span;
  let min = Infinity;
  let max = -Infinity;
  for (let i = start; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const amp = max - min || 1;
  ctx.beginPath();
  for (let i = 0; i < span; i++) {
    const x = (i / Math.max(1, span - 1)) * w;
    const y = h - 4 - ((data[start + i] - min) / amp) * (h - 8);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#7C9A82';
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function finishHr() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = 0;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (vfcId && video && typeof video.cancelVideoFrameCallback === 'function') {
    try { video.cancelVideoFrameCallback(vfcId); } catch (_) {}
  }
  vfcId = 0;
  if (sampleRafId) cancelAnimationFrame(sampleRafId);
  sampleRafId = 0;

  const deep = measurementMode === 'deep';
  const est = estimatePulse(hrSamples, { minDuration: deep ? 55 : 10, hrv: deep });
  const ok = est.ok && est.confidence >= 0.55 && est.beats >= (deep ? 30 : 8) && (!deep || est.hrv);
  stopCamera();

  if (!ok) {
    showHrFailure();
    return;
  }
  lastHr = { bpm: est.bpm, confidence: est.confidence, hrv: deep ? est.hrv : null, at: Date.now() };
  if (!deep) {
    let series;
    try { series = JSON.parse(localStorage.getItem('pulsecam_hr_series') || '[]'); } catch (_) { series = []; }
    if (!Array.isArray(series)) series = [];
    series.push({ bpm: Math.round(est.bpm), confidence: est.confidence, at: Date.now() });
    localStorage.setItem('pulsecam_hr_series', JSON.stringify(series.slice(-3)));
    if (series.length === 3) {
      const values = series.slice(-3).map(item => item.bpm).sort((a, b) => a - b);
      const range = values[2] - values[0];
      q(doneEl, 'deepHrv').textContent = lang() === 'en'
        ? `3-scan median ${values[1]} bpm · range ${range}${range > 8 ? ' · Unstable: scan again' : ''}`
        : `3 次中位 ${values[1]} bpm · 极差 ${range}${range > 8 ? ' · 不稳定，建议重测' : ''}`;
    } else q(doneEl, 'deepHrv').textContent = '';
  } else {
    q(doneEl, 'deepHrv').textContent = `${text('deepNote')} RMSSD ${Math.round(est.hrv.rmssd)} ms · SDNN ${Math.round(est.hrv.sdnn)} ms`;
  }
  if (hrFinalEl) hrFinalEl.textContent = String(Math.round(est.bpm));
  if (hrBandEl) {
    const band = uncertaintyFor(est.confidence) ?? 8;
    hrBandEl.textContent = text('hrBand')
      .replace('{n}', String(band))
      .replace('{c}', String(Math.round(est.confidence * 100)));
  }
  if (hrNoteEl) hrNoteEl.textContent = text(deep ? 'deepResultNote' : 'hrNote');
  setPhase('hrDone');
}

function showHrFailure() {
  lastHr = null;
  const form = document.querySelector('.manual-checkin');
  if (form) {
    form.querySelector('input[name="heartRate"]')?.remove();
    delete form.dataset.scanQuality;
    delete form.dataset.scanHrv;
  }
  if (hrFinalEl) hrFinalEl.textContent = '--';
  if (hrBandEl) hrBandEl.textContent = `${text('hrFail')}。${text('hrFailText')}`;
  q(doneEl, 'deepHrv').textContent = '';
  setPhase('hrDone');
}

function abortHr() {
  stopCamera();
  showHrFailure();
}

window.PulseCamScan = { mount };

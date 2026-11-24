/**
 * PulseCam · 短窗脉搏信号处理（纯函数，无 DOM、无依赖）
 *
 * 用途：把摄像头逐帧采到的面部 RGB 均值序列，估计成心率与置信度。
 * 口径：15 秒只估算心率；60 秒信号足够时才尝试短时 HRV。
 *
 * 输入样本：{ t: 秒, r, g, b }（t 建议用 video.currentTime 或 mediaTime）
 * 输出：{ ok, bpm, confidence, duration, perfusion, h, fs, beats, reason }
 */

export const DEFAULT_FS = 30;
export const BAND_LO = 0.7;   // Hz ≈ 42 bpm
export const BAND_HI = 3.0;   // Hz = 180 bpm

const clamp01 = v => Math.max(0, Math.min(1, v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function mean(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return s / (x.length || 1);
}

function std(x) {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    const d = x[i] - m;
    s += d * d;
  }
  return Math.sqrt(s / (x.length || 1));
}

/** 把不等间隔的采样按时间线性重采样到固定 fs。间隔断档过大则拒绝。 */
export function resampleUniform(samples, fs = DEFAULT_FS) {
  if (!Array.isArray(samples) || samples.length < 8) return null;
  const sorted = samples
    .filter(s => s && Number.isFinite(s.t) && Number.isFinite(s.r) && Number.isFinite(s.g) && Number.isFinite(s.b))
    .sort((a, b) => a.t - b.t);
  if (sorted.length < 8) return null;

  const t0 = sorted[0].t;
  const t1 = sorted[sorted.length - 1].t;
  const duration = t1 - t0;
  if (!(duration > 2)) return null;

  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i].t - sorted[i - 1].t);
  if (maxGap > 0.5) return null; // 摄像头被暂停/切后台，插值会凭空造数据

  const n = Math.floor(duration * fs) + 1;
  const out = {
    t: new Float64Array(n),
    r: new Float64Array(n),
    g: new Float64Array(n),
    b: new Float64Array(n),
    fs,
    duration,
  };

  let j = 0;
  for (let i = 0; i < n; i++) {
    const ti = t0 + i / fs;
    while (j < sorted.length - 2 && sorted[j + 1].t < ti) j++;
    const a = sorted[j];
    const b = sorted[j + 1] || a;
    const dt = b.t - a.t;
    const w = dt > 1e-6 ? clamp((ti - a.t) / dt, 0, 1) : 0;
    out.t[i] = ti;
    out.r[i] = a.r + (b.r - a.r) * w;
    out.g[i] = a.g + (b.g - a.g) * w;
    out.b[i] = a.b + (b.b - a.b) * w;
  }
  return out;
}

/**
 * POS（plane-orthogonal-to-skin）投影，见 Wang et al. 2017。
 * 把三通道投影到与肤色方向正交的平面，抑制光照/运动造成的共模变化。
 * 比"只看绿通道"在短窗和光照变化下稳得多。
 */
export function posProject(rgb) {
  const { r, g, b } = rgb;
  const n = r.length;
  if (!n) return null;

  const mr = mean(r);
  const mg = mean(g);
  const mb = mean(b);
  if (!(mr > 1) || !(mg > 1) || !(mb > 1)) return null;

  const s1 = new Float64Array(n);
  const s2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const rn = r[i] / mr;
    const gn = g[i] / mg;
    const bn = b[i] / mb;
    s1[i] = gn - bn;
    s2[i] = gn + bn - 2 * rn;
  }

  const a1 = std(s1);
  const a2 = std(s2);
  const alpha = a2 > 1e-9 ? a1 / a2 : 0;

  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = s1[i] + alpha * s2[i];
  return h;
}

/** 滑动均值去基线漂移（呼吸、自动曝光缓慢变化）。 */
export function detrend(x, winSamples) {
  const n = x.length;
  if (n < 3) return Float64Array.from(x);
  const w = Math.max(3, Math.min(n, Math.round(winSamples)));
  const half = Math.floor(w / 2);

  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + x[i];

  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    const m = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    y[i] = x[i] - m;
  }
  return y;
}

/** RBJ 二阶带通 + 正反两遍（零相位）。 */
export function bandpass(x, fs, lo = BAND_LO, hi = BAND_HI) {
  const fc = Math.sqrt(lo * hi);
  const q = Math.max(0.35, fc / Math.max(0.1, hi - lo));
  const w0 = (2 * Math.PI * fc) / fs;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * cw) / a0;
  const a2 = (1 - alpha) / a0;

  const onceDir = (src, dst) => {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < src.length; i++) {
      const v = b0 * src[i] + b2 * x2 - a1 * y1 - a2 * y2;
      dst[i] = v;
      x2 = x1;
      x1 = src[i];
      y2 = y1;
      y1 = v;
    }
  };

  const fwd = new Float64Array(x.length);
  onceDir(x, fwd);
  const rev = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) rev[i] = fwd[x.length - 1 - i];
  const back = new Float64Array(x.length);
  onceDir(rev, back);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = back[x.length - 1 - i];
  return out;
}

/**
 * 归一化自相关找主周期。
 * 返回 { bpm, confidence, lag, peak, second }。
 * confidence 同时看"峰有多高"和"峰比次峰明显多少"，避免把噪声当心率。
 */
export function autocorrHR(x, fs, minBpm = 42, maxBpm = 180) {
  const n = x.length;
  if (n < fs * 3) return null;

  const z = new Float64Array(n);
  const m = mean(x);
  const s = std(x) || 1e-9;
  for (let i = 0; i < n; i++) z[i] = (x[i] - m) / s;

  const minLag = Math.max(2, Math.floor((fs * 60) / maxBpm));
  const maxLag = Math.min(n - 3, Math.ceil((fs * 60) / minBpm));
  if (maxLag <= minLag + 2) return null;

  const corr = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0;
    let ea = 0;
    let eb = 0;
    for (let i = 0; i < n - lag; i++) {
      const a = z[i];
      const b = z[i + lag];
      num += a * b;
      ea += a * a;
      eb += b * b;
    }
    const den = Math.sqrt(ea * eb) || 1e-9;
    corr[lag] = num / den;
  }

  let best = -Infinity;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (corr[lag] > best) {
      best = corr[lag];
      bestLag = lag;
    }
  }
  if (bestLag < 0 || best < 0.12) return null;

  // 自相关在周期的整数倍上都会出峰，容易把 110bpm 报成 55bpm（八度错误）。
  // 用"正弦拟合纯度"在候选周期里挑基频：真周期上有能量，倍周期上没有。
  const corrAt = l => {
    const i = Math.floor(l);
    const f = l - i;
    return (corr[i] ?? 0) * (1 - f) + (corr[i + 1] ?? 0) * f;
  };
  let chosenLag = bestLag;
  let chosenPurity = sinePurity(x, fs, fs / bestLag);
  for (const divisor of [2, 3]) {
    const cand = bestLag / divisor;
    if (cand < minLag - 0.5) continue;
    // A rounded autocorrelation lag can be >1 bpm off; on a 60s window that
    // makes a true sine look almost absent. Search locally before comparing.
    const centerBpm = fs * 60 / cand;
    let purity = 0;
    let refinedBpm = centerBpm;
    for (let bpm = centerBpm - 2.5; bpm <= Math.min(maxBpm, centerBpm + 2.5); bpm += 0.25) {
      if (bpm < minBpm) continue;
      const current = sinePurity(x, fs, bpm / 60);
      if (current > purity) { purity = current; refinedBpm = bpm; }
    }
    // 低周期几乎没有周期性（purity 很低）时，自相关更容易被低频噪声推到 2 倍周期上，
    // 这时优先取更高的基频；否则仍要求两处自相关接近，避免把有强二次谐波的 55bpm 报成 110bpm。
    const weakAtCurrent = chosenPurity < 0.15 && purity > 0.25;
    if (purity > chosenPurity + 0.1 && (weakAtCurrent || corrAt(cand) > best * 0.65)) {
      chosenLag = fs * 60 / refinedBpm;
      chosenPurity = purity;
    }
  }
  bestLag = chosenLag;

  // 在选定周期附近取整，再做抛物线插值，突破 1/fs 的量化误差
  const lo = Math.max(minLag, Math.floor(bestLag) - 2);
  const hi = Math.min(maxLag, Math.ceil(bestLag) + 2);
  let peakLag = Math.round(bestLag);
  for (let lag = lo; lag <= hi; lag++) {
    if (corr[lag] > corr[peakLag]) peakLag = lag;
  }
  best = corr[peakLag];

  const guard = Math.max(2, Math.round(peakLag * 0.15));
  let second = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    // 排除基频本身及其谐波/分谐波：那是同一个心率，不是竞争心率
    if (Math.abs(lag - peakLag) <= guard) continue;
    if (Math.abs(lag - peakLag * 2) <= guard) continue;
    if (Math.abs(lag - peakLag / 2) <= guard) continue;
    if (corr[lag] > second) second = corr[lag];
  }
  if (!Number.isFinite(second)) second = 0;

  const y0 = corr[peakLag - 1] ?? best;
  const y1 = best;
  const y2 = corr[peakLag + 1] ?? best;
  const denom = y0 - 2 * y1 + y2;
  const delta = Math.abs(denom) > 1e-9 ? (0.5 * (y0 - y2)) / denom : 0;
  const lag = peakLag + clamp(delta, -0.5, 0.5);
  const bpm = (60 * fs) / lag;

  const strength = clamp01((best - 0.15) / 0.5);
  const clarity = clamp01((best - second + 0.05) / 0.25);
  const confidence = clamp01(strength * 0.65 + clarity * 0.35);

  return { bpm, confidence, lag, peak: best, second };
}

/** 正弦最小二乘拟合：这段信号在 f 上的周期性有多"纯"，0~1。用来压掉噪声里的假峰。 */
function sinePurity(x, fs, f) {
  const n = x.length;
  let ss = 0;
  let cc = 0;
  let s2 = 0;
  let c2 = 0;
  let sc = 0;
  for (let i = 0; i < n; i++) {
    const w = (2 * Math.PI * f * i) / fs;
    const s = Math.sin(w);
    const c = Math.cos(w);
    ss += x[i] * s;
    cc += x[i] * c;
    s2 += s * s;
    c2 += c * c;
    sc += s * c;
  }
  const det = s2 * c2 - sc * sc;
  if (Math.abs(det) < 1e-9) return 0;
  const a = (ss * c2 - cc * sc) / det;
  const b = (cc * s2 - ss * sc) / det;
  const explained = a * ss + b * cc;

  const m = mean(x);
  let tss = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - m;
    tss += d * d;
  }
  return tss > 0 ? clamp01(explained / tss) : 0;
}

/**
 * 主入口：RGB 序列 → 心率。
 * opts: { fs, minDuration, minBpm, maxBpm }
 */
export function estimatePulse(samples, opts = {}) {
  const fs = opts.fs || DEFAULT_FS;
  const minDuration = opts.minDuration ?? 5;
  const minBpm = opts.minBpm ?? 42;
  const maxBpm = opts.maxBpm ?? 180;

  const rgb = resampleUniform(samples, fs);
  if (!rgb) return { ok: false, reason: 'too-short' };
  if (rgb.duration + 1e-6 < minDuration) return { ok: false, reason: 'too-short' };

  const h0 = posProject(rgb);
  if (!h0) return { ok: false, reason: 'no-signal' };

  // 去漂移窗取 1.2 秒，短窗下再长会把心率本身也减掉
  const det = detrend(h0, fs * 1.2);
  const bp = bandpass(det, fs, BAND_LO, BAND_HI);

  // 两端各切 0.6 秒，避开零相位滤波的边界瞬态
  const trim = Math.min(Math.floor(fs * 0.6), Math.floor(bp.length / 4));
  const core = bp.subarray(trim, bp.length - trim);
  if (std(core) < 1e-8) return { ok: false, reason: 'no-signal', duration: rgb.duration };

  const res = autocorrHR(core, fs, minBpm, maxBpm);
  if (!res) return { ok: false, reason: 'no-peak', duration: rgb.duration };

  // 自相关峰 + 正弦拟合纯度，两个证据都成立才给高置信度
  const purity = sinePurity(core, fs, res.bpm / 60);
  const purityScore = clamp01((purity - 0.08) / 0.5);
  const confidence = clamp01(res.confidence * 0.6 + purityScore * 0.4);
  const hrv = opts.hrv && rgb.duration >= 55 ? estimateHrv(core, fs) : { hrv: null, ibi: [] };

  const green = rgb.g;
  const gm = mean(green) || 1;
  const perfusion = (std(green) / gm) * 100;

  return {
    ok: true,
    bpm: res.bpm,
    confidence,
    purity,
    duration: rgb.duration,
    perfusion,
    h: core,
    fs,
    beats: (rgb.duration * res.bpm) / 60,
    peak: res.peak,
    hrv: hrv.hrv,
    ibi: hrv.ibi,
  };
}

export function estimateHrv(signal, fs) {
  if (!signal || signal.length < fs * 45) return { hrv: null, ibi: [] };
  const rms = Math.sqrt(signal.reduce((sum, value) => sum + value * value, 0) / signal.length);
  if (!(rms > 1e-8)) return { hrv: null, ibi: [] };
  const threshold = rms * 0.35;
  const minimumGap = Math.ceil(fs * 0.4);
  const peaks = [];
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] < threshold || signal[i] <= signal[i - 1] || signal[i] < signal[i + 1]) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < minimumGap) {
      if (signal[i] > signal[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
    } else peaks.push(i);
  }
  const refined = peaks.map(peak => {
    const left = signal[peak - 1], middle = signal[peak], right = signal[peak + 1];
    const curvature = left - 2 * middle + right;
    return peak + (Math.abs(curvature) > 1e-12 ? clamp(0.5 * (left - right) / curvature, -0.5, 0.5) : 0);
  });
  const ibi = refined.slice(1).map((peak, index) => (peak - refined[index]) * 1000 / fs)
    .filter(value => value >= 400 && value <= 1500);
  if (ibi.length < 29 || ibi.length < (peaks.length - 1) * 0.85) return { hrv: null, ibi };
  const avg = ibi.reduce((sum, value) => sum + value, 0) / ibi.length;
  const differences = ibi.slice(1).map((value, index) => value - ibi[index]);
  const rmssd = Math.sqrt(differences.reduce((sum, value) => sum + value * value, 0) / differences.length);
  const sdnn = Math.sqrt(ibi.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (ibi.length - 1));
  const pnn50 = differences.filter(value => Math.abs(value) > 50).length / differences.length * 100;
  if (!Number.isFinite(rmssd) || !Number.isFinite(sdnn)) return { hrv: null, ibi };
  return { hrv: { rmssd, sdnn, pnn50 }, ibi };
}

/** 置信度 → 展示用误差带（bpm）。 */
export function uncertaintyFor(confidence) {
  if (confidence >= 0.75) return 3;
  if (confidence >= 0.6) return 5;
  if (confidence >= 0.45) return 8;
  return null; // 不建议展示数字
}

export const __internal = { mean, std, clamp01 };

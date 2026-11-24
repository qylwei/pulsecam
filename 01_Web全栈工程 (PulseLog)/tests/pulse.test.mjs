import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePulse } from '../public/pulse.js';
import { results, synthetic } from '../scripts/validate-hr.mjs';

test('synthetic heart rates have MAE below 3 bpm without octave errors', () => {
  const rows = results();
  const accepted = rows.filter(row => !row.rejected);
  assert.ok(accepted.length >= 12, 'most synthetic windows should pass the quality gate');
  assert.ok(accepted.every(row => row.mae < 3), JSON.stringify(rows));
  assert.ok(accepted.reduce((sum, row) => sum + row.mae, 0) / accepted.length < 3);
});

test('quick scan never reports HRV, deep scan returns finite short-window metrics', () => {
  for (const bpm of [72, 90]) {
    const quick = estimatePulse(synthetic(bpm, 0.15, 15), { minDuration: 10, hrv: true });
    assert.equal(quick.hrv, null);
    const deep = estimatePulse(synthetic(bpm, 0.15), { minDuration: 55, hrv: true });
    assert.ok(deep.hrv, JSON.stringify({ bpm, deep }));
    assert.ok(Number.isFinite(deep.hrv.rmssd) && deep.hrv.rmssd < 100);
    assert.ok(Number.isFinite(deep.hrv.sdnn));
  }
});

test('near-zero POS output is rejected instead of fabricating a heart rate', () => {
  const signal = Array.from({ length: 1801 }, (_, i) => ({ t: i / 30, r: 100, g: 112, b: 90 }));
  assert.equal(estimatePulse(signal, { hrv: true }).ok, false);
});

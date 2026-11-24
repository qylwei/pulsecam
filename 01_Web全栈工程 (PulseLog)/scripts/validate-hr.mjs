import { pathToFileURL } from 'node:url';
import { estimatePulse } from '../public/pulse.js';

export function synthetic(bpm, noise = 0, seconds = 60) {
  return Array.from({ length: seconds * 30 + 1 }, (_, i) => {
    const wave = Math.sin(2 * Math.PI * bpm * i / 1800);
    const perturbation = noise * (Math.sin(i * 2.176) + 0.6 * Math.sin(i * 1.713));
    return {
      t: i / 30,
      r: 100 + 0.2 * wave + 0.3 * perturbation,
      g: 112 + 2 * wave + perturbation,
      b: 90 + 0.5 * wave + 0.4 * perturbation
    };
  });
}

export function results() {
  return [48, 72, 90, 110, 150].flatMap(bpm =>
    [0, 0.15, 0.3].map(noise => {
      const result = estimatePulse(synthetic(bpm, noise), { minDuration: 55, hrv: true });
      const accepted = result.ok && result.confidence >= 0.55 && result.beats >= 30 && result.hrv != null;
      return { bpm, noise, estimate: accepted ? result.bpm : null, mae: accepted ? Math.abs(result.bpm - bpm) : null, rejected: !accepted };
    }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Synthetic RGB only; not a real-camera or clinical validation.');
  console.log('bpm\tnoise\tMAE (bpm)\trejected');
  for (const row of results()) {
    console.log(`${row.bpm}\t${row.noise}\t${row.mae == null ? '-' : row.mae.toFixed(2)}\t${row.rejected ? 'yes' : 'no'}`);
  }
}

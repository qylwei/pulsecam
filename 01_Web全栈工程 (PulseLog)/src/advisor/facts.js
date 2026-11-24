const field = (record, key, source) => ({
  value: record?.[key] ?? null,
  source: record?.[key] == null ? null : record.provenance?.[key] || source
});

const localDateKey = iso => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

function buildFacts(records) {
  const todayKey = localDateKey(new Date().toISOString());
  const latest = records[0] || null;
  const latestKey = latest ? localDateKey(latest.recordedAt) : null;
  // 只有“今天”的记录才算 today；否则只能作为历史记录引用，不能冒充今日数据。
  const isToday = Boolean(latest && latestKey && latestKey === todayKey);
  const today = isToday ? latest : null;
  const recent = records.slice(0, 7);
  const average = key => {
    const values = recent.map(item => item[key]).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const heartRates = records.map(item => item.heartRate).filter(Number.isFinite).slice(0, 10).sort((a, b) => a - b);
  const mid = Math.floor(heartRates.length / 2);
  return {
    today: {
      date: isToday ? todayKey : null,
      scenario: today?.scenario || null,
      recoveryScore: field(today, 'recoveryScore', 'derived'),
      sleepHours: field(today, 'sleepHours', 'manual'),
      fatigue: field(today, 'fatigue', 'manual'),
      stress: field(today, 'stress', 'manual'),
      mood: field(today, 'mood', 'manual'),
      factors: today?.scoreBreakdown?.factors || []
    },
    lastRecord: latest && !isToday ? {
      date: latestKey,
      sleepHours: latest.sleepHours,
      stress: latest.stress,
      recoveryScore: latest.recoveryScore
    } : null,
    vitals: {
      heartRate: field(today, 'heartRate', 'measured'),
      hrv: field(today, 'hrv', 'measured'),
      respiration: field(today, 'respiration', 'measured')
    },
    history7: recent.map(item => ({
      date: item.recordedAt.slice(0, 10), sleepHours: item.sleepHours, stress: item.stress,
      recoveryScore: item.recoveryScore, heartRate: item.heartRate
    })),
    stats: {
      sleepAvg7: average('sleepHours'), stressAvg7: average('stress'),
      recoveryAvg7: average('recoveryScore'),
      hrBaseline: heartRates.length ? (heartRates[mid] + heartRates[Math.floor((heartRates.length - 1) / 2)]) / 2 : null
    },
    availability: {
      sleep: today?.sleepHours != null, hr: today?.heartRate != null,
      hrv: today?.hrv != null, respiration: today?.respiration != null
    }
  };
}

module.exports = { buildFacts, localDateKey };

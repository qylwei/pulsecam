function answerLocal(facts, message, lang = 'zh') {
  const en = lang === 'en';
  const q = message.toLowerCase();
  const isHrv = /hrv|变异性|rmssd|sdnn/i.test(q);
  const headache = /头痛|头疼|headache/i.test(q);
  const symptom = /头痛|头疼|头晕|恶心|胃疼|胃痛|肚子疼|腹痛|心慌|乏力|酸痛|不舒服|疼|痛|headache|dizzy|nausea|stomach|ache|pain/i.test(q);
  const sleep = /睡|失眠|作息|困|bed|sleep|night/i.test(q);
  const stress = /压力|焦虑|紧张|疲劳|累|stress|tired|anxious/i.test(q);
  const exercise = /运动|健身|锻炼|跑|exercise|workout|run/i.test(q);
  const hr = /心率|心跳|脉搏|heart rate|pulse/i.test(q);
  const recovery = /恢复|状态|分数|score|recovery/i.test(q);

  const sleepToday = facts.today.sleepHours.value;
  const stressToday = facts.today.stress.value;
  const fatigueToday = facts.today.fatigue.value;
  const scoreToday = facts.today.recoveryScore.value;
  const hrToday = facts.vitals.heartRate.value;
  const hrvToday = facts.vitals.hrv.value;

  const evidence = [];
  const missing = [];
  if (!facts.today.date) missing.push({
    key: 'checkin', label: en ? 'Daily check-in' : '今日记录',
    hint: en ? 'Save a daily check-in for personalized advice.' : '完成今日记录后可获得有依据的建议。'
  });
  if (sleepToday != null) {
    const avg = facts.stats.sleepAvg7;
    const delta = avg != null ? Math.round((sleepToday - avg) * 10) / 10 : null;
    const showTrend = delta != null && facts.history7.length >= 2 && Math.abs(delta) >= 0.1;
    evidence.push({
      label: en ? 'Sleep' : '睡眠', value: `${sleepToday}h`,
      trend: showTrend ? `${delta >= 0 ? '+' : ''}${delta}${en ? 'h vs 7d' : 'h（较 7 天）'}` : null, source: 'manual'
    });
  }
  if (stressToday != null) evidence.push({ label: en ? 'Stress' : '压力自评', value: `${stressToday}/5`, trend: null, source: 'manual' });
  if (fatigueToday != null) evidence.push({ label: en ? 'Fatigue' : '疲劳自评', value: `${fatigueToday}/5`, trend: null, source: 'manual' });
  if (isHrv && hrvToday == null) missing.push({
    key: 'hrv', label: 'HRV', hint: en ? 'Try a stable deep scan before discussing HRV.' : '完成稳定的深测后再讨论 HRV。'
  });
  else if (isHrv && hrvToday != null) evidence.push({ label: en ? 'Short-window HRV' : '短时 HRV', value: `${hrvToday}ms`, trend: null, source: 'measured' });
  if (hr && hrToday == null) missing.push({
    key: 'heartRate', label: en ? 'Heart rate' : '心率', hint: en ? 'Try a heart-rate scan.' : '完成心率快检。'
  });
  else if (hr && hrToday != null) evidence.push({ label: en ? 'Heart rate' : '心率', value: `${hrToday}bpm`, trend: null, source: 'measured' });

  let answer;
  if (!facts.today.date) {
    if (symptom) {
      answer = en
        ? 'I have no record for today, so I cannot compare with your sleep or stress. Rest in a quiet, dim place, drink water and cut screen time; if symptoms are severe or getting worse, seek medical care.'
        : '今天还没有记录，我也没有你的睡眠和压力数据可以对照。先到安静、光线柔和的地方休息，补水，减少盯屏；如果症状明显或越来越重，请及时就医。';
    } else if (facts.lastRecord) {
      answer = en
        ? `No record for today. Your last saved record is from ${facts.lastRecord.date}. Add today’s check-in and I can base advice on today.`
        : `今天还没有记录。你最近一次记录是 ${facts.lastRecord.date}。补一条今天的记录，我才能结合今天的状态给建议。`;
    } else {
      answer = en
        ? 'There is no saved record yet. What would you like to focus on: sleep, stress, or activity?'
        : '还没有保存记录。可以先记录睡眠和感受；你更想聊睡眠、压力还是活动？';
    }
    evidence.length = 0;
  } else if (isHrv && hrvToday == null) {
    answer = en
      ? 'No HRV was measured. A brief face check or short heart-rate scan cannot provide interpretable HRV. Consider your saved sleep, stress and mood instead.'
      : '本次没有 HRV 测量。短时扫脸或心率快检不足以计算可解释的 HRV；可以先结合已记录的睡眠、压力和心情看状态。';
  } else if (isHrv) {
    answer = en
      ? `Short-window HRV is ${hrvToday}ms (60s window). Treat it as a trend reference, not the 5-minute clinical measure. Keep a regular bedtime tonight.`
      : `本次短时 HRV 为 ${hrvToday}ms（60 秒窗口）。它只能作为趋势参考，不能等同 5 分钟临床口径；今晚优先保持规律睡眠。`;
  } else if (symptom) {
    const causes = [];
    if (sleepToday != null && sleepToday < 6.5) {
      causes.push(en ? `you slept ${sleepToday}h, and short sleep can worsen discomfort` : `昨晚睡眠 ${sleepToday}h，睡眠不足会加重不适`);
    }
    if (stressToday != null && stressToday >= 4) {
      causes.push(en ? `stress self-rating is ${stressToday}/5` : `压力自评 ${stressToday}/5，偏高`);
    }
    const redFlag = headache
      ? (en ? ' If it is sudden and severe, or comes with vomiting, blurred vision, limb weakness or fever with a stiff neck, seek care immediately.'
        : '若突然剧烈，或伴呕吐、视物模糊、肢体无力、发热颈硬，请立即就医。')
      : '';
    answer = en
      ? `I cannot judge the cause here.${causes.length ? ` Note: ${causes.join('; ')}.` : ''} Rest somewhere quiet, hydrate, and cut screen time; if it does not ease within a couple of hours or gets worse, see a clinician.${redFlag} Is it a dull ache or throbbing?`
      : `这里不能判断原因。${causes.length ? `可参考：${causes.join('；')}。` : ''}先安静休息、补水、减少盯屏；一两个小时后仍不缓解或加重，建议就医。${redFlag}是胀痛还是跳痛？`;
  } else if (hr && hrToday == null) {
    answer = en
      ? 'Heart rate has not been measured. Complete a scan before discussing a reading; are you feeling unwell right now?'
      : '目前没有心率测量结果。完成快检后才能讨论读数；你现在有不适吗？';
  } else if (hr) {
    const base = facts.stats.hrBaseline;
    const delta = base != null ? Math.round(hrToday - base) : null;
    answer = en
      ? `Your measured heart rate is ${hrToday}bpm${delta != null ? ` (${delta >= 0 ? '+' : ''}${delta} vs your recent baseline)` : ''}. A single reading is not a diagnosis; if it stays high at rest or comes with chest pain or breathlessness, seek care.`
      : `本次测得心率 ${hrToday}bpm${delta != null ? `（较近期基线 ${delta >= 0 ? '+' : ''}${delta}）` : ''}。单次读数不能说明问题；若静息持续偏高，或伴胸痛、气短，请就医。`;
  } else if (sleep) {
    if (sleepToday != null) {
      const avg = facts.stats.sleepAvg7;
      const delta = avg != null ? Math.round((sleepToday - avg) * 10) / 10 : null;
      const showDelta = delta != null && facts.history7.length >= 2 && Math.abs(delta) >= 0.1;
      answer = en
        ? `You slept ${sleepToday}h${showDelta ? ` (${delta >= 0 ? '+' : ''}${delta}h vs your 7-day average)` : ''}. Keep a fixed wake time and dim screens an hour before bed. What time do you usually go to bed?`
        : `昨晚睡了 ${sleepToday}h${showDelta ? `（比近 7 天平均${delta >= 0 ? '多' : '少'} ${Math.abs(delta)}h）` : ''}。先固定起床时间，睡前一小时调暗屏幕；你平时几点上床？`;
    } else {
      answer = en
        ? 'No sleep record for today yet. Add it and I can compare with your recent pattern. What time did you go to bed last night?'
        : '今天还没有睡眠记录。补一条后我才能和近期规律对比；你昨晚几点睡的？';
    }
  } else if (stress) {
    if (stressToday != null) {
      const tail = fatigueToday != null ? (en ? ` (fatigue ${fatigueToday}/5)` : `（疲劳 ${fatigueToday}/5）`) : '';
      answer = stressToday >= 4
        ? (en ? `Stress self-rating is ${stressToday}/5, high${tail}. Try three minutes of 4-6 breathing, then split today’s tasks into two blocks. Which part of the day is hardest?`
          : `压力自评 ${stressToday}/5，偏高${tail}。先做三分钟 4-6 呼吸，再把今天的任务拆成两段；哪个时段最紧？`)
        : (en ? `Stress self-rating is ${stressToday}/5, fairly steady${tail}. Keep the current pace and take one short walk this afternoon.`
          : `压力自评 ${stressToday}/5，比较平稳${tail}。保持现在的节奏，下午安排一次短走动。`);
    } else {
      answer = en
        ? 'No stress rating for today yet. Add a check-in and I can compare with your week. What has been the main pressure today?'
        : '今天还没有压力自评。补一条记录后我才能和这一周对比；今天主要的压力来自哪里？';
    }
  } else if (exercise) {
    if (scoreToday != null) {
      answer = scoreToday >= 80
        ? (en ? `Recovery score is ${scoreToday}, so moderate-intensity training fits today. Keep it to 45–60 minutes and stretch afterwards.`
          : `恢复分 ${scoreToday}，今天适合中等强度训练，控制在 45–60 分钟，结束后拉伸。`)
        : scoreToday >= 60
          ? (en ? `Recovery score is ${scoreToday}; choose light to moderate activity such as a brisk walk or yoga, and avoid training to failure.`
            : `恢复分 ${scoreToday}，建议轻到中等强度，比如快走或瑜伽，别练到力竭。`)
          : (en ? `Recovery score is ${scoreToday}; make today active recovery — walk or stretch, no intense intervals.`
            : `恢复分 ${scoreToday}，今天以主动恢复为主：散步或拉伸，不做高强度间歇。`);
    } else {
      answer = en
        ? 'I need a check-in to judge today’s recovery. How do you feel — more like resting or moving a little?'
        : '需要一条今日记录才能判断恢复程度。你现在更想休息，还是稍微活动一下？';
    }
  } else if (recovery && scoreToday != null) {
    const negative = (facts.today.factors || []).filter(item => item.points < 0).sort((a, b) => a.points - b.points)[0];
    answer = en
      ? `Today’s recovery score is ${scoreToday}${negative ? `; the largest deduction is “${negative.label}” (${negative.points})` : ''}. Prioritise sleep tonight and re-check the trend tomorrow.`
      : `今日恢复分 ${scoreToday}${negative ? `，主要扣分来自「${negative.label}」（${negative.points}）` : ''}。今晚优先把睡眠补回来，明天再看趋势。`;
  } else {
    answer = en
      ? 'I can help interpret saved records and suggest small, reversible steps. Which would you like to discuss: sleep, stress, or activity?'
      : '我可以结合已保存的记录聊节律和低风险的小调整。你想先聊睡眠、压力还是活动？';
  }

  const actions = isHrv ? [] : [{
    id: 'breath-46', type: 'breathing',
    title: en ? 'Breathing break' : '呼吸放松练习',
    durationSec: 180
  }];
  return {
    answer, evidence: evidence.slice(0, 3), actions, missing, escalate: false,
    engine: 'local', latencyMs: 0, fallbackReason: null
  };
}
module.exports = { answerLocal };

const emergencyPatterns = [
  /胸(口)?疼|胸痛|心前区/,
  /喘不上气|呼吸困难|憋气|窒息/,
  /晕厥|昏厥|昏倒|意识不清|意识模糊/,
  /单侧.*(无力|麻木)|半身|口角歪斜|言语不清|说话不清|视物重影/,
  /(头痛|头疼).{0,10}(突然|炸裂|最严重|从没这么)/,
  /剧烈头痛|剧烈头疼/,
  /(头痛|头疼).{0,15}(喷射性呕吐|视物模糊|看不清|肢体无力|抽搐|颈(项)?强直|脖子硬)/,
  /(发热|高烧|发烧).{0,10}(脖子硬|颈(项)?强直|意识|抽搐)/,
  /头部?外伤|撞到头|摔到头/,
  /(怀孕|孕期|孕晚期|产后).{0,15}(头痛|视力模糊|抽搐|大出血)/,
  /自杀|自伤|想死|不想活|结束生命/,
  /心悸.{0,8}(不停|持续|晕|冒汗)/,
  /持续高热|高烧.{0,6}(不退|几天)/
];

const medicalPatterns = [
  /确诊|诊断|药物|用药|停药|剂量|治疗方案|补剂剂量/,
  /止痛药|退烧药|抗生素|安眠药|吃什么药|用什么药|开点药/,
  /diagnos|prescri|medication|dosage/i
];

function screen(message, lang = 'zh') {
  const urgent = emergencyPatterns.some(pattern => pattern.test(message));
  const medical = medicalPatterns.some(pattern => pattern.test(message));
  if (!urgent && !medical) return { blocked: false };
  return {
    blocked: true,
    response: {
      answer: lang === 'en'
        ? (urgent
          ? 'This needs in-person assessment now. Call your local emergency number or go to the nearest emergency department. If symptoms worsen suddenly, do not wait. If you may harm yourself, contact local crisis support or someone you trust immediately.'
          : 'I cannot assess conditions or give medication instructions. Please consult a qualified clinician.')
        : (urgent
          ? '你描述的情况需要立即当面评估，不适合在这里判断。请拨打当地急救电话或尽快前往急诊；如果症状突然加重，不要等。若有自伤念头，请立即联系当地心理援助热线或身边可信的人。'
          : '这里不能判断疾病，也不能提供用药或剂量建议，请咨询专业医生。'),
      evidence: [], actions: [], missing: [], escalate: urgent,
      engine: 'local', latencyMs: 0, fallbackReason: null
    }
  };
}
module.exports = { screen };

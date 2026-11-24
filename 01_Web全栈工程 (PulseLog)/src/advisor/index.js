const { buildFacts } = require('./facts');
const { screen } = require('./safety');
const { answerLocal } = require('./rules');
const { askLLM } = require('./llm');

async function respond({ records = [], message, history = [], lang = 'zh', config = {} }) {
  const start = Date.now();
  const screened = screen(message, lang);
  if (screened.blocked) return screened.response;
  const facts = buildFacts(records);
  const local = answerLocal(facts, message, lang);
  // 症状类问题固定走本地安全规则：措辞可控、红旗齐全，不让模型自由发挥。
  const symptom = /头痛|头疼|头晕|恶心|胃疼|胃痛|肚子疼|腹痛|心慌|乏力|酸痛|不舒服|疼|痛|headache|dizzy|nausea|stomach|ache|pain/i.test(message);
  if (!config.apiKey || symptom || (!facts.availability.hrv && /hrv|心率变异|rmssd|sdnn/i.test(message))) {
    return { ...local, latencyMs: Date.now() - start };
  }
  const llm = await askLLM({ facts, message, history, lang, config });
  if (!llm.ok) return { ...local, latencyMs: Date.now() - start, fallbackReason: llm.meta.fallbackReason };
  const noRecords = !records.length;
  return {
    ...llm.data,
    answer: noRecords
      ? `${lang === 'en' ? 'No saved records yet. ' : '还没有保存记录。'}${llm.data.answer}`
      : llm.data.answer,
    evidence: noRecords ? [] : llm.data.evidence,
    missing: noRecords ? local.missing : llm.data.missing,
    engine: config.provider || 'cloud', latencyMs: llm.meta.latencyMs, fallbackReason: null
  };
}
module.exports = { respond };

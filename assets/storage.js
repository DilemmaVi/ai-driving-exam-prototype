// assets/storage.js
// LocalStorage helpers + schema

export const LS_KEYS = {
  EXAM_DATE: 'qa.examDate',
  PROGRESS: 'qa.progress',      // { answered: { [id]: { selected:number, correct:boolean, ts:number } }, doneCount:number }
  FAVORITES: 'qa.favorites',    // string[]
  NOTES: 'qa.notes',            // { [id]: string }
  WRONG: 'qa.wrong',            // string[]  (wrong question ids)
  WRONG_STREAK: 'qa.wrongStreak',// { [id]: number } 连续答对次数
  DAILY: 'qa.daily',            // { byDate: { [YYYY-MM-DD]: { done:number, correct:number } } }
  KNOWLEDGE: 'qa.knowledgeMastery', // { [knowledgeId]: { mastery:number, attempts:number, correct:number, lastTs:number } }
  DIAGNOSIS: 'qa.diagnosis', // { status, queue, cursor, answers, startedAt, finishedAt }
  SETTINGS: 'qa.settings', // { diagnosisShowAnalysis:boolean, smartLockN:number }
  WRONG_REASON: 'qa.wrongReason', // { [questionId]: 'memory'|'understand'|'careless'|'trap' }
  REVIEW: 'qa.review', // { [questionId]: nextTs:number, intervalDays:number }
  EXAM_HISTORY: 'qa.examHistory', // [{ id, startedAt, finishedAt, durationSec, examType, total, correct, score, wrongIds, byKnowledge, wrongReasonStat, queue, answers }]
  LEARNER_PROFILE: 'qa.learnerProfile', // { total, correct, streakCorrect, streakWrong, reasonStat, byKnowledge, byHour }
  LEARNING_EVENTS: 'qa.learningEvents' // [{ ts, event, payload }]
};

const SETTINGS_DEFAULT = {
  diagnosisShowAnalysis: true,
  smartLockN: 10,
  plan: {
    maxNewPerDay: 160,
    maxReviewPerDay: 120,
    maxTotalPerDay: 200,
    foundationDays: 14,
    balancedDays: 7,
    sprintDays: 3
  }
};

function safeJsonParse(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getExamDate() {
  return localStorage.getItem(LS_KEYS.EXAM_DATE) || '';
}

export function setExamDate(dateStr) {
  if (!dateStr) {
    localStorage.removeItem(LS_KEYS.EXAM_DATE);
    return;
  }
  localStorage.setItem(LS_KEYS.EXAM_DATE, dateStr);
}

export function getProgress() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.PROGRESS), { answered: {}, doneCount: 0 });
}

export function setProgress(progress) {
  localStorage.setItem(LS_KEYS.PROGRESS, JSON.stringify(progress));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function getWrongList() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.WRONG), []);
}

export function setWrongList(ids) {
  localStorage.setItem(LS_KEYS.WRONG, JSON.stringify(Array.from(new Set(ids))));
}

export function addWrong(questionId) {
  const list = new Set(getWrongList());
  list.add(questionId);
  setWrongList(Array.from(list));
  return Array.from(list);
}

export function getWrongStreak() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.WRONG_STREAK), {});
}

export function setWrongStreak(map) {
  localStorage.setItem(LS_KEYS.WRONG_STREAK, JSON.stringify(map || {}));
}

export function removeWrong(questionId) {
  const list = new Set(getWrongList());
  list.delete(questionId);
  setWrongList(Array.from(list));

  // 同时清除 streak
  const streak = getWrongStreak();
  if (streak && Object.prototype.hasOwnProperty.call(streak, questionId)) {
    delete streak[questionId];
    setWrongStreak(streak);
  }

  return Array.from(list);
}

export function getDaily() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.DAILY), { byDate: {} });
}

export function setDaily(daily) {
  localStorage.setItem(LS_KEYS.DAILY, JSON.stringify(daily));
}

export function addDailyRecord(correct) {
  const daily = getDaily();
  const d = todayStr();
  daily.byDate = daily.byDate || {};
  const cur = daily.byDate[d] || { done: 0, correct: 0 };
  cur.done += 1;
  if (correct) cur.correct += 1;
  daily.byDate[d] = cur;
  setDaily(daily);
  return daily;
}

export function upsertAnswer(questionId, selected, correct, opts = {}) {
  const progress = getProgress();
  const existed = !!progress.answered?.[questionId];
  progress.answered = progress.answered || {};
  progress.answered[questionId] = { selected, correct, ts: Date.now() };
  if (!existed) {
    progress.doneCount = (progress.doneCount || 0) + 1;
    addDailyRecord(correct);
  }
  setProgress(progress);

  // 错题闭环：答错 -> 加入错题并 streak=0；答对 -> 若在错题本内则 streak+1，达到阈值自动移出
  const threshold = Number(opts.wrongClearThreshold || 2);

  if (!correct) {
    addWrong(questionId);
    const streak = getWrongStreak();
    streak[questionId] = 0;
    setWrongStreak(streak);
  } else {
    const wrongSet = new Set(getWrongList());
    if (wrongSet.has(questionId)) {
      const streak = getWrongStreak();
      const next = (streak[questionId] || 0) + 1;
      streak[questionId] = next;
      setWrongStreak(streak);
      if (next >= threshold) {
        removeWrong(questionId);
      }
    }
  }

  return progress;
}

export function getFavorites() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.FAVORITES), []);
}

export function toggleFavorite(questionId) {
  const fav = new Set(getFavorites());
  if (fav.has(questionId)) fav.delete(questionId);
  else fav.add(questionId);
  const arr = Array.from(fav);
  localStorage.setItem(LS_KEYS.FAVORITES, JSON.stringify(arr));
  return arr;
}

export function isFavorite(questionId) {
  return new Set(getFavorites()).has(questionId);
}

export function getNotes() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.NOTES), {});
}

export function getNote(questionId) {
  const notes = getNotes();
  return notes[questionId] || '';
}

export function setNote(questionId, text) {
  const notes = getNotes();
  notes[questionId] = (text || '').slice(0, 2000);
  localStorage.setItem(LS_KEYS.NOTES, JSON.stringify(notes));
}

export function getKnowledgeMastery() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.KNOWLEDGE), {});
}

export function setKnowledgeMastery(map) {
  localStorage.setItem(LS_KEYS.KNOWLEDGE, JSON.stringify(map || {}));
}

export function updateKnowledgeMastery(knowledgeId, correct, meta = {}) {
  if (!knowledgeId) return;
  const km = getKnowledgeMastery();
  const cur = km[knowledgeId] || { mastery: 0.5, attempts: 0, correct: 0, lastTs: 0 };

  const freq = Number(meta.frequency || 3);
  const diff = Number(meta.difficulty || 3);

  // 简单可控：高频/高难的权重更大
  const gain = 0.10 + 0.02 * (freq - 3) + 0.01 * (diff - 3); // 约 0.06 ~ 0.16
  const loss = 0.18 + 0.03 * (freq - 3) + 0.02 * (diff - 3); // 约 0.10 ~ 0.28

  let mastery = Number(cur.mastery ?? 0.5);
  mastery = Math.max(0.02, Math.min(0.98, mastery));

  cur.attempts += 1;
  if (correct) {
    cur.correct += 1;
    mastery = mastery + (1 - mastery) * Math.max(0.05, Math.min(0.25, gain));
  } else {
    mastery = mastery - mastery * Math.max(0.08, Math.min(0.35, loss));
  }

  cur.mastery = Math.max(0, Math.min(1, mastery));
  cur.lastTs = Date.now();
  km[knowledgeId] = cur;
  setKnowledgeMastery(km);
  return km;
}

export function getDiagnosis() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.DIAGNOSIS), {
    status: 'idle',
    queue: [],
    cursor: 0,
    answers: {},
    startedAt: 0,
    finishedAt: 0,
    durationSec: 2700,
    total: 100,
    examType: 'standard',
    savedExamId: ''
  });
}

export function setDiagnosis(d) {
  localStorage.setItem(LS_KEYS.DIAGNOSIS, JSON.stringify(d || {}));
}

export function getSettings() {
  const parsed = safeJsonParse(localStorage.getItem(LS_KEYS.SETTINGS), {});
  const obj = parsed && typeof parsed === 'object' ? parsed : {};
  const plan = obj.plan && typeof obj.plan === 'object' ? obj.plan : {};
  return {
    ...SETTINGS_DEFAULT,
    ...obj,
    diagnosisShowAnalysis: obj.diagnosisShowAnalysis !== false,
    smartLockN: Number(obj.smartLockN || SETTINGS_DEFAULT.smartLockN),
    plan: {
      ...SETTINGS_DEFAULT.plan,
      ...plan
    }
  };
}

export function setSettings(s) {
  localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(s || {}));
}

export function getWrongReason() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.WRONG_REASON), {});
}

export function setWrongReason(map) {
  localStorage.setItem(LS_KEYS.WRONG_REASON, JSON.stringify(map || {}));
}

export function setWrongReasonForQuestion(questionId, reason) {
  const map = getWrongReason();
  map[questionId] = reason;
  setWrongReason(map);
  return map;
}

export function getReview() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.REVIEW), {});
}

export function setReview(map) {
  localStorage.setItem(LS_KEYS.REVIEW, JSON.stringify(map || {}));
}

export function scheduleReview(questionId, correct) {
  const r = getReview();
  const cur = r[questionId] || { nextTs: 0, intervalDays: 0 };
  let interval = Number(cur.intervalDays || 0);

  if (correct) {
    // 简单间隔：1 -> 3 -> 7 -> 14
    if (interval <= 0) interval = 1;
    else if (interval <= 1) interval = 3;
    else if (interval <= 3) interval = 7;
    else interval = 14;
  } else {
    interval = 1;
  }

  cur.intervalDays = interval;
  cur.nextTs = Date.now() + interval * 24 * 3600 * 1000;
  r[questionId] = cur;
  setReview(r);
  return r;
}

export function clearDiagnosis() {
  localStorage.removeItem(LS_KEYS.DIAGNOSIS);
}

export function getExamHistory() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.EXAM_HISTORY), []);
}

export function setExamHistory(list) {
  localStorage.setItem(LS_KEYS.EXAM_HISTORY, JSON.stringify(Array.isArray(list) ? list : []));
}

export function saveExamResult(record) {
  if (!record || !record.id) return getExamHistory();
  const list = getExamHistory();
  const idx = list.findIndex(x => x.id === record.id);
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);
  setExamHistory(list.slice(0, 50));
  return list;
}

export function getLearnerProfile() {
  const raw = safeJsonParse(localStorage.getItem(LS_KEYS.LEARNER_PROFILE), {});
  const byHour = (raw.byHour && typeof raw.byHour === 'object') ? raw.byHour : {};
  const byKnowledge = (raw.byKnowledge && typeof raw.byKnowledge === 'object') ? raw.byKnowledge : {};
  const reasonStat = (raw.reasonStat && typeof raw.reasonStat === 'object')
    ? raw.reasonStat
    : { memory: 0, understand: 0, careless: 0, trap: 0 };
  return {
    version: 1,
    total: Number(raw.total || 0),
    correct: Number(raw.correct || 0),
    streakCorrect: Number(raw.streakCorrect || 0),
    streakWrong: Number(raw.streakWrong || 0),
    lastAnswerAt: Number(raw.lastAnswerAt || 0),
    byHour,
    byKnowledge,
    reasonStat: {
      memory: Number(reasonStat.memory || 0),
      understand: Number(reasonStat.understand || 0),
      careless: Number(reasonStat.careless || 0),
      trap: Number(reasonStat.trap || 0)
    }
  };
}

export function setLearnerProfile(profile) {
  localStorage.setItem(LS_KEYS.LEARNER_PROFILE, JSON.stringify(profile || {}));
}

export function updateLearnerProfileOnAnswer(meta = {}) {
  const p = getLearnerProfile();
  const ts = Number(meta.ts || Date.now());
  const hour = new Date(ts).getHours();
  const kid = String(meta.knowledgeId || 'law.basic');
  const correct = !!meta.correct;

  p.total += 1;
  if (correct) p.correct += 1;
  p.streakCorrect = correct ? (p.streakCorrect + 1) : 0;
  p.streakWrong = correct ? 0 : (p.streakWrong + 1);
  p.lastAnswerAt = ts;

  p.byHour[hour] = Number(p.byHour[hour] || 0) + 1;

  const ks = p.byKnowledge[kid] || { attempts: 0, correct: 0, lastTs: 0 };
  ks.attempts = Number(ks.attempts || 0) + 1;
  if (correct) ks.correct = Number(ks.correct || 0) + 1;
  ks.lastTs = ts;
  p.byKnowledge[kid] = ks;

  setLearnerProfile(p);
  return p;
}

export function updateLearnerProfileWrongReason(reason) {
  const p = getLearnerProfile();
  if (!Object.prototype.hasOwnProperty.call(p.reasonStat, reason)) return p;
  p.reasonStat[reason] = Number(p.reasonStat[reason] || 0) + 1;
  setLearnerProfile(p);
  return p;
}

export function getLearningEvents() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.LEARNING_EVENTS), []);
}

export function trackLearningEvent(event, payload = {}) {
  const list = getLearningEvents();
  list.unshift({
    ts: Date.now(),
    event: String(event || 'unknown'),
    payload: payload && typeof payload === 'object' ? payload : {}
  });
  const next = list.slice(0, 500);
  localStorage.setItem(LS_KEYS.LEARNING_EVENTS, JSON.stringify(next));
  return next;
}

export function clearAllData() {
  Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
}

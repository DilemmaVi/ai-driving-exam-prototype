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
  WRONG_REASON: 'qa.wrongReason' // { [questionId]: 'memory'|'understand'|'careless'|'trap' }
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
    durationSec: 2700
  });
}

export function setDiagnosis(d) {
  localStorage.setItem(LS_KEYS.DIAGNOSIS, JSON.stringify(d || {}));
}

export function getSettings() {
  return safeJsonParse(localStorage.getItem(LS_KEYS.SETTINGS), {
    diagnosisShowAnalysis: true,
    smartLockN: 5
  });
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

export function clearDiagnosis() {
  localStorage.removeItem(LS_KEYS.DIAGNOSIS);
}

export function clearAllData() {
  Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
}

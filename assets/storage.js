// assets/storage.js
// LocalStorage helpers + schema

export const LS_KEYS = {
  EXAM_DATE: 'qa.examDate',
  PROGRESS: 'qa.progress',      // { answered: { [id]: { selected:number, correct:boolean, ts:number } }, doneCount:number }
  FAVORITES: 'qa.favorites',    // string[]
  NOTES: 'qa.notes',            // { [id]: string }
  WRONG: 'qa.wrong',            // string[]  (wrong question ids)
  DAILY: 'qa.daily'             // { byDate: { [YYYY-MM-DD]: { done:number, correct:number } } }
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

export function removeWrong(questionId) {
  const list = new Set(getWrongList());
  list.delete(questionId);
  setWrongList(Array.from(list));
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

export function upsertAnswer(questionId, selected, correct) {
  const progress = getProgress();
  const existed = !!progress.answered?.[questionId];
  progress.answered = progress.answered || {};
  progress.answered[questionId] = { selected, correct, ts: Date.now() };
  if (!existed) {
    progress.doneCount = (progress.doneCount || 0) + 1;
    addDailyRecord(correct);
  }
  setProgress(progress);

  if (!correct) addWrong(questionId);

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

export function clearAllData() {
  Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
}

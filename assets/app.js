// assets/app.js
import {
  getExamDate,
  setExamDate,
  getProgress,
  upsertAnswer,
  addWrong,
  isFavorite,
  toggleFavorite,
  getNote,
  setNote,
  getWrongList,
  removeWrong,
  getDaily,
  updateKnowledgeMastery,
  getKnowledgeMastery,
  getDiagnosis,
  setDiagnosis,
  clearDiagnosis,
  getSettings,
  setSettings,
  setWrongReasonForQuestion,
  getWrongReason,
  scheduleReview,
  getReview,
  getExamHistory,
  saveExamResult,
  getLearnerProfile,
  updateLearnerProfileOnAnswer,
  updateLearnerProfileWrongReason,
  trackLearningEvent,
  getLearningEvents
} from './storage.js';

let QUESTIONS = [];
let currentIndex = 0;
let currentPageId = 'home';
let pureSmartMode = false;

function cleanMarkedText(s) {
  return String(s || '').replace(/[【】]/g, '').replace(/[｛｝]/g, '').trim();
}

function normalizeQuestionImage(raw) {
  const candidates = [
    raw?.imgUrl,
    raw?.img_url,
    raw?.image,
    raw?.imageUrl,
    raw?.pic,
    raw?.picture
  ];
  for (const c of candidates) {
    const v = String(c || '').trim();
    if (v) return v;
  }
  return '';
}

function resolveQuestionImageUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw)) {
    return raw.startsWith('//') ? `https:${raw}` : raw;
  }
  if (/^data:image\//i.test(raw)) return raw;

  const path = raw.replace(/^\.?\//, '');
  return `https://file.yxjky.com/${path}`;
}

function renderQuestionMediaHtml(q, cls = 'mt-3', mode = 'side') {
  const url = resolveQuestionImageUrl(q?.imgUrl || '');
  if (!url) return '';
  const side = mode === 'side';
  const boxCls = side
    ? 'rounded-lg border border-gray-200 bg-gray-50 p-2 md:p-3'
    : 'rounded-lg border border-gray-200 bg-gray-50 p-2 md:p-3';
  const imgCls = side
    ? 'mx-auto w-full h-auto max-h-56 md:max-h-72 object-contain rounded'
    : 'mx-auto w-auto max-w-full max-h-72 md:max-h-96 object-contain rounded';
  return `
    <div class="${cls}">
      <div class="${boxCls}">
        <img src="${url}" alt="题目配图" class="${imgCls}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('div').classList.add('hidden')" />
      </div>
    </div>
  `;
}

const KNOWLEDGE_RULES = [
  { kid: 'law.signals', kws: ['信号灯', '红灯', '绿灯', '黄灯', '让行', '优先通行', '会车'] },
  { kid: 'law.lanes', kws: ['车道', '变道', '超车', '并线', '导向车道', '掉头', '转弯'] },
  { kid: 'law.parking', kws: ['停车', '临停', '禁停', '泊车', '驻车'] },
  { kid: 'safe.bad_weather', kws: ['雨天', '雾天', '冰雪', '泥泞', '湿滑', '夜间', '能见度'] },
  { kid: 'safe.emergency', kws: ['爆胎', '失火', '故障', '紧急', '事故', '侧滑', '制动失效'] },
  { kid: 'safe.fatigue_drink', kws: ['疲劳', '酒后', '饮酒', '醉酒', '药物', '分心', '手机'] },
  { kid: 'lights', kws: ['远光灯', '近光灯', '灯光', '示廓灯', '雾灯', '双闪'] },
  { kid: 'highway', kws: ['高速公路', '收费站', '匝道', '应急车道'] },
  { kid: 'signs_markings', kws: ['标志', '标线', '导流线', '禁止标志', '指示标志'] },
  { kid: 'police_command', kws: ['交警', '手势', '警察指挥'] },
  { kid: 'safe.civilized', kws: ['安全带', '礼让', '文明', '人行横道', '校车'] }
];

function inferKnowledgeIdFromText(text) {
  const t = String(text || '');
  for (const rule of KNOWLEDGE_RULES) {
    if (rule.kws.some(k => t.includes(k))) return rule.kid;
  }
  return 'law.basic';
}

function normalizeAnswer(type, rawAnswer) {
  if (type === 'multi') {
    const arr = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
    const nums = arr
      .map(x => Number(x))
      .filter(x => Number.isFinite(x) && x >= 0);
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  }
  const n = Number(rawAnswer);
  return Number.isFinite(n) ? n : 0;
}

function normalizeQuestionId(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return '';
  if (id.startsWith('qa-')) return id;
  if (id.startsWith('sb-')) return `qa-${id.slice(3)}`;
  return `qa-${id}`;
}

function getAnswerIndexes(answer) {
  if (Array.isArray(answer)) return answer.slice().map(Number).filter(Number.isFinite);
  const n = Number(answer);
  return Number.isFinite(n) ? [n] : [];
}

function isSameAnswerSet(a, b) {
  const aa = Array.from(new Set(getAnswerIndexes(a))).sort((x, y) => x - y);
  const bb = Array.from(new Set(getAnswerIndexes(b))).sort((x, y) => x - y);
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

function normalizeQuestion(raw) {
  const q = raw || {};
  const typeRaw = String(q.type || '').toLowerCase();
  const answerRaw = q.answer;
  const inferredTypeByAnswer = Array.isArray(answerRaw) && answerRaw.length > 1 ? 'multi' : '';
  const type = (typeRaw === 'tf' || typeRaw === 'single' || typeRaw === 'multi')
    ? typeRaw
    : (inferredTypeByAnswer || (Array.isArray(q.options) && q.options.length === 2 ? 'tf' : 'single'));
  const opts = Array.isArray(q.options) ? q.options.map(cleanMarkedText) : [];
  const answer = normalizeAnswer(type, answerRaw);
  const stem = cleanMarkedText(q.stem || '');
  const analysis = cleanMarkedText(q.analysis || '暂无解析');
  const optionText = opts.join(' ');
  // 性能优先：知识点归类只用题干+选项，不扫长解析文本
  const inferredKid = inferKnowledgeIdFromText(`${stem} ${optionText}`);
  const inputKid = q.knowledgeId || 'law.basic';
  const knowledgeId = inputKid === 'law.basic' ? inferredKid : inputKid;
  const imgUrl = normalizeQuestionImage(q);
  return {
    id: normalizeQuestionId(q.id),
    type,
    knowledgeId,
    frequency: Number(q.frequency || 3),
    difficulty: Number(q.difficulty || 3),
    stem,
    imgUrl,
    options: opts,
    answer,
    analysis,
    tags: Array.isArray(q.tags) ? q.tags.map(cleanMarkedText).filter(Boolean) : ['驾驶证', '科目一']
  };
}

async function loadQuestions() {
  try {
    const res = await fetch('./data/questions.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    QUESTIONS = Array.isArray(data)
      ? data.map(normalizeQuestion).filter(q => q.id && q.stem && Array.isArray(q.options) && q.options.length > 1)
      : [];
    if (!QUESTIONS.length) throw new Error('题库为空');
    window.__questionsLoadError = '';
  } catch (err) {
    QUESTIONS = [];
    const msg = String(err?.message || err || 'unknown');
    window.__questionsLoadError = msg;
    console.error('[questions] load failed:', msg);
  }
}

function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

function updatePureSmartChrome() {
  const sidebar = qs('#app-sidebar');
  const headerActions = qs('#header-actions');
  const returnBtn = qs('#smart-guide-return');
  if (sidebar) sidebar.classList.toggle('hidden', pureSmartMode);
  if (headerActions) headerActions.classList.toggle('hidden', pureSmartMode);
  if (returnBtn) {
    const show = pureSmartMode && currentPageId !== 'smart-guide';
    returnBtn.classList.toggle('hidden', !show);
  }
}

function setPureSmartMode(enabled) {
  pureSmartMode = !!enabled;
  updatePureSmartChrome();
}

function showQuestionLoadHint() {
  const err = window.__questionsLoadError || '';
  const proto = window.location?.protocol || '';
  const ext = proto === 'file:'
    ? '当前是 file:// 打开，浏览器会拦截 fetch。请用 `python3 -m http.server 5173` 后访问 http://127.0.0.1:5173/'
    : '';
  const text = `题库未加载成功${err ? `：${err}` : ''}${ext ? `。${ext}` : ''}`;
  const stem = qs('#q-stem');
  if (stem) stem.textContent = text;
  const diag = qs('#diagnosis-box');
  if (diag) diag.innerHTML = `<div class=\"card\"><p class=\"text-error\">${text}</p></div>`;
}

function questionTypeText(type, long = false) {
  if (type === 'tf') return long ? '判断题' : '判断';
  if (type === 'multi') return long ? '多选题' : '多选';
  return long ? '单选题' : '单选';
}

function showPage(pageId, title) {
  currentPageId = pageId;
  qsa('.page-content').forEach(p => p.classList.add('hidden'));
  qs('#' + pageId)?.classList.remove('hidden');
  if (title) qs('#page-title').textContent = title;
  qsa('.nav-item').forEach(n => n.classList.remove('active'));
  qs(`.nav-item[data-target="${pageId}"]`)?.classList.add('active');
  updatePureSmartChrome();
  refreshSmartGuideEntryButton();

  // 进入诊断页时刷新诊断状态
  if (pageId === 'diagnosis') {
    renderDiagnosisHome();
  }
  if (pageId === 'exam') {
    renderExamPage();
  }
  if (pageId === 'smart-guide') {
    renderSmartGuideFlow();
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

const SMART_LOCK_OPTIONS = [5, 10, 20, 30, 40, 50];
const ANSWER_AUTO_NEXT_DELAY_MS = 1300;
function normalizeSmartLockN(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 10;
  let best = SMART_LOCK_OPTIONS[0];
  let gap = Math.abs(n - best);
  for (const x of SMART_LOCK_OPTIONS) {
    const g = Math.abs(n - x);
    if (g < gap) {
      best = x;
      gap = g;
    }
  }
  return best;
}

function isAnswerAutoNextEnabled(settings = getSettings()) {
  return settings.answerAutoNext === true || settings.diagnosisAutoNext === true;
}

function setAnswerAutoNext(enabled) {
  const s = getSettings();
  const next = !!enabled;
  s.answerAutoNext = next;
  // 向后兼容旧字段，避免历史数据与新逻辑不一致
  s.diagnosisAutoNext = next;
  setSettings(s);
  return next;
}

function maybeScheduleAutoNext(opts = {}) {
  if (!isAnswerAutoNextEnabled(getSettings())) return false;
  if (typeof opts.renderLocked === 'function') opts.renderLocked();
  const expectedQuestionId = String(opts.expectedQuestionId || '');
  setTimeout(() => {
    if (typeof opts.canAdvance === 'function' && !opts.canAdvance(expectedQuestionId)) return;
    if (typeof opts.goNext === 'function') opts.goNext();
  }, ANSWER_AUTO_NEXT_DELAY_MS);
  return true;
}

function getPlanConfig() {
  const s = getSettings();
  const p = s.plan || {};
  const toInt = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  };

  const maxNewPerDay = clamp(toInt(p.maxNewPerDay, 160), 20, 400);
  const maxReviewPerDay = clamp(toInt(p.maxReviewPerDay, 120), 0, 300);
  const maxTotalBase = toInt(p.maxTotalPerDay, 200);
  const maxTotalPerDay = clamp(Math.max(maxTotalBase, maxNewPerDay, 20), 20, 500);

  const foundationDaysRaw = clamp(toInt(p.foundationDays, 14), 8, 120);
  const balancedDaysRaw = clamp(toInt(p.balancedDays, 7), 3, 90);
  const sprintDaysRaw = clamp(toInt(p.sprintDays, 3), 0, 30);

  const foundationDays = Math.max(foundationDaysRaw, balancedDaysRaw + 1);
  const balancedDays = Math.min(balancedDaysRaw, foundationDays - 1);
  const sprintDays = Math.min(sprintDaysRaw, balancedDays - 1);

  return {
    maxNewPerDay,
    maxReviewPerDay,
    maxTotalPerDay,
    foundationDays,
    balancedDays,
    sprintDays
  };
}

function getDueReviewCount() {
  const review = getReview();
  const now = Date.now();
  return Object.keys(review || {}).filter(id => Number(review[id]?.nextTs || 0) <= now).length;
}

function getRecentAccuracy(lastDays = 3) {
  const daily = getDaily();
  const byDate = daily.byDate || {};
  let done = 0;
  let correct = 0;
  const t = todayStr();
  for (let i = 0; i < lastDays; i += 1) {
    const key = addDays(t, -i);
    const rec = byDate[key] || { done: 0, correct: 0 };
    done += Number(rec.done || 0);
    correct += Number(rec.correct || 0);
  }
  const acc = done ? Math.round((correct / done) * 100) : 75;
  return { done, correct, acc };
}

function getDaysLeft(examDate) {
  if (!examDate) return 0;
  const today = new Date(todayStr() + 'T00:00:00');
  const exam = new Date(examDate + 'T00:00:00');
  return Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / (1000 * 3600 * 24)));
}

function refreshSmartGuideEntryButton() {
  const btn = qs('#enter-smart-guide');
  const badge = qs('#smart-guide-urgent-badge');
  if (!btn) return;

  const examDate = getExamDate();
  const daysLeft = examDate ? getDaysLeft(examDate) : null;
  const isUrgent = Number.isFinite(daysLeft) && daysLeft !== null && daysLeft <= 7;

  btn.classList.toggle('bg-error', isUrgent);
  btn.classList.toggle('hover:bg-error/90', isUrgent);
  btn.classList.toggle('shadow-error/30', isUrgent);
  btn.classList.toggle('ring-error/25', isUrgent);
  btn.classList.toggle('bg-primary', !isUrgent);
  btn.classList.toggle('hover:bg-primary/90', !isUrgent);
  btn.classList.toggle('shadow-primary/30', !isUrgent);
  btn.classList.toggle('ring-primary/20', !isUrgent);
  if (badge) badge.classList.toggle('hidden', !isUrgent);
  btn.title = isUrgent && daysLeft !== null
    ? `距离考试 ${daysLeft} 天，建议进入 AI 托管冲刺`
    : '进入 AI 托管学习';
}

function getDynamicDailyPlan(total, done, examDate) {
  const remain = Math.max(total - done, 0);
  const daysLeft = getDaysLeft(examDate);
  const dueReview = getDueReviewCount();
  const recent = getRecentAccuracy(3);
  const cfg = getPlanConfig();
  const maxNewPerDay = cfg.maxNewPerDay;
  const maxReviewPerDay = cfg.maxReviewPerDay;
  const maxTotalPerDay = cfg.maxTotalPerDay;
  const hasExamDate = Boolean(examDate);

  const stage = (() => {
    if (!hasExamDate) return { key: 'steady', label: '常规稳态', newRatio: 0.65, reviewRatio: 0.35, newMult: 1.0 };
    if (daysLeft > cfg.foundationDays) return { key: 'foundation', label: `基础夯实期（>${cfg.foundationDays}天）`, newRatio: 0.75, reviewRatio: 0.25, newMult: 1.05 };
    if (daysLeft > cfg.balancedDays) return { key: 'balanced', label: `平衡提升期（${cfg.balancedDays + 1}-${cfg.foundationDays}天）`, newRatio: 0.6, reviewRatio: 0.4, newMult: 1.0 };
    if (daysLeft > cfg.sprintDays) return { key: 'sprint', label: `考前冲刺期（${cfg.sprintDays + 1}-${cfg.balancedDays}天）`, newRatio: 0.45, reviewRatio: 0.55, newMult: 0.92 };
    return { key: 'final', label: `临考稳分期（<=${cfg.sprintDays}天）`, newRatio: 0.25, reviewRatio: 0.75, newMult: 0.78 };
  })();

  const requiredPerDay = hasExamDate && remain > 0
    ? Math.ceil(remain / Math.max(daysLeft, 1))
    : 0;
  const impossible = hasExamDate && remain > 0 && requiredPerDay > maxNewPerDay;

  let baseNew = 0;
  if (hasExamDate) {
    baseNew = requiredPerDay;
  } else {
    // 未设置考试日期：给一个稳妥默认目标
    baseNew = remain ? Math.ceil(Math.min(remain, 60)) : 20;
  }

  let factor = 1.0;
  if (recent.acc < 70) factor = 0.85;
  else if (recent.acc > 85) factor = 1.15;

  let newTarget = Math.ceil(baseNew * factor * stage.newMult);
  if (hasExamDate && remain > 0 && !impossible) {
    // 可达成时，确保新题节奏不低于按时完成所需速度
    newTarget = Math.max(newTarget, requiredPerDay);
  }
  newTarget = clamp(newTarget, stage.key === 'final' ? 6 : 10, maxNewPerDay);

  let reviewTarget = dueReview;
  if (hasExamDate) {
    const desiredTotal = stage.newRatio > 0 ? Math.ceil(newTarget / stage.newRatio) : newTarget + dueReview;
    const desiredReview = Math.max(0, Math.ceil(desiredTotal * stage.reviewRatio));
    reviewTarget = Math.max(dueReview, desiredReview);
  }
  reviewTarget = clamp(reviewTarget, 0, maxReviewPerDay);
  let totalTarget = clamp(newTarget + reviewTarget, 20, maxTotalPerDay);

  // 若总目标触顶，优先保留复习任务，压缩新题
  if (newTarget + reviewTarget > totalTarget) {
    newTarget = Math.max(0, totalTarget - reviewTarget);
  }

  return {
    totalTarget,
    newTarget,
    reviewTarget,
    dueReview,
    remain,
    daysLeft,
    recentAcc: recent.acc,
    stageKey: stage.key,
    stageLabel: stage.label,
    newRatio: stage.newRatio,
    reviewRatio: stage.reviewRatio,
    risk: impossible,
    requiredPerDay,
    maxNewPerDay
  };
}

function calcDailyTarget(total, done, examDate) {
  return getDynamicDailyPlan(total, done, examDate).totalTarget;
}

function getGlobalCTAState() {
  const d = getDiagnosis();
  const progress = getProgress();

  if (d.status === 'running') {
    return { text: `继续诊断（${d.cursor || 0}/${d.queue?.length || DIAG_TOTAL}）`, action: 'diagnosis_continue' };
  }

  // 未诊断或诊断未开始：引导诊断
  if (d.status === 'idle' || !d.queue?.length) {
    return { text: '启动 AI 100题诊断（推荐）', action: 'diagnosis_start' };
  }

  // 已诊断：进入智能加速
  if (d.status === 'done') {
    return { text: '开始 AI 加速练习', action: 'practice_smart' };
  }

  // fallback
  if ((progress.doneCount || 0) === 0) {
    return { text: '启动 AI 100题诊断（推荐）', action: 'diagnosis_start' };
  }
  return { text: '开始 AI 加速练习', action: 'practice_smart' };
}

function renderGlobalCTA() {
  const btn = qs('#global-cta');
  if (!btn) return;
  const st = getGlobalCTAState();
  btn.textContent = st.text;
  btn.dataset.action = st.action;
}

function bindGlobalCTA() {
  const btn = qs('#global-cta');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'diagnosis_start') {
      showPage('diagnosis', '智能诊断');
      startDiagnosis(true);
      return;
    }
    if (action === 'diagnosis_continue') {
      showPage('diagnosis', '智能诊断');
      startDiagnosis(false);
      return;
    }
    if (action === 'practice_smart') {
      practiceMode = 'smart';
      currentIndex = pickSmartIndex();
      showPage('practice', '练题');
      renderQuestion();
      return;
    }
  });
}

function openSettingsModal() {
  const modal = qs('#settings-modal');
  if (!modal) return;
  const settings = getSettings();
  const cfg = getPlanConfig();

  const smart = qs('#settings-smart-lock-n');
  if (smart) smart.value = String(normalizeSmartLockN(settings.smartLockN || 10));
  const maxNew = qs('#settings-max-new');
  if (maxNew) maxNew.value = String(cfg.maxNewPerDay);
  const maxReview = qs('#settings-max-review');
  if (maxReview) maxReview.value = String(cfg.maxReviewPerDay);
  const maxTotal = qs('#settings-max-total');
  if (maxTotal) maxTotal.value = String(cfg.maxTotalPerDay);
  const foundation = qs('#settings-foundation-days');
  if (foundation) foundation.value = String(cfg.foundationDays);
  const balanced = qs('#settings-balanced-days');
  if (balanced) balanced.value = String(cfg.balancedDays);
  const sprint = qs('#settings-sprint-days');
  if (sprint) sprint.value = String(cfg.sprintDays);
  const err = qs('#settings-error');
  if (err) err.textContent = '';

  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  qs('#settings-modal')?.classList.add('hidden');
}

function bindSettingsModal() {
  const modal = qs('#settings-modal');
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = '1';

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSettingsModal();
  });
  qs('#settings-cancel')?.addEventListener('click', closeSettingsModal);
  qs('#settings-reset')?.addEventListener('click', () => {
    const s = getSettings();
    s.smartLockN = 10;
    s.plan = {
      maxNewPerDay: 160,
      maxReviewPerDay: 120,
      maxTotalPerDay: 200,
      foundationDays: 14,
      balancedDays: 7,
      sprintDays: 3
    };
    setSettings(s);
    openSettingsModal();
    renderPlanSummary();
    if (!qs('#plan')?.classList.contains('hidden')) renderPlanPage();
  });

  qs('#settings-save')?.addEventListener('click', () => {
    const err = qs('#settings-error');
    const smartLockN = Number(qs('#settings-smart-lock-n')?.value || 10);
    const maxNewPerDay = Number(qs('#settings-max-new')?.value || 160);
    const maxReviewPerDay = Number(qs('#settings-max-review')?.value || 120);
    const maxTotalPerDay = Number(qs('#settings-max-total')?.value || 200);
    const foundationDays = Number(qs('#settings-foundation-days')?.value || 14);
    const balancedDays = Number(qs('#settings-balanced-days')?.value || 7);
    const sprintDays = Number(qs('#settings-sprint-days')?.value || 3);

    const validNum = [maxNewPerDay, maxReviewPerDay, maxTotalPerDay, foundationDays, balancedDays, sprintDays]
      .every(n => Number.isFinite(n) && n >= 0);
    if (!validNum) {
      if (err) err.textContent = '请填写有效数字。';
      return;
    }
    if (!(foundationDays > balancedDays && balancedDays > sprintDays)) {
      if (err) err.textContent = '阶段阈值需满足：基础天数 > 平衡天数 > 冲刺天数。';
      return;
    }
    if (maxTotalPerDay < maxNewPerDay) {
      if (err) err.textContent = '每日总题上限不能小于每日新题上限。';
      return;
    }

    const s = getSettings();
    s.smartLockN = normalizeSmartLockN(smartLockN);
    s.plan = {
      maxNewPerDay: clamp(Math.round(maxNewPerDay), 20, 400),
      maxReviewPerDay: clamp(Math.round(maxReviewPerDay), 0, 300),
      maxTotalPerDay: clamp(Math.round(maxTotalPerDay), 20, 500),
      foundationDays: clamp(Math.round(foundationDays), 8, 120),
      balancedDays: clamp(Math.round(balancedDays), 3, 90),
      sprintDays: clamp(Math.round(sprintDays), 0, 30)
    };
    setSettings(s);

    const smartSel = qs('#smart-lock-n');
    if (smartSel) smartSel.value = String(normalizeSmartLockN(s.smartLockN || 10));

    renderPlanSummary();
    if (!qs('#plan')?.classList.contains('hidden')) renderPlanPage();
    closeSettingsModal();
  });
}

function renderPlanSummary() {
  const examDate = getExamDate();
  const progress = getProgress();
  const total = QUESTIONS.length || 0;
  const done = progress.doneCount || 0;

  const plan = getDynamicDailyPlan(total, done, examDate);
  const daily = getDaily();
  const today = todayStr();
  const todayRec = daily.byDate?.[today] || { done: 0, correct: 0 };
  const todayDone = todayRec.done || 0;
  const todayAcc = todayDone ? Math.round((todayRec.correct / todayDone) * 100) : 0;

  const planEl = qs('#plan-summary');
  if (!planEl) return;

  const pct = plan.totalTarget ? Math.min(100, Math.round((todayDone / plan.totalTarget) * 100)) : 0;
  const basis = examDate
    ? `${plan.stageLabel} · 剩余 ${plan.remain} 题 / ${Math.max(plan.daysLeft, 1)} 天 · 近3天正确率 ${plan.recentAcc}%`
    : `未设置考试日期 · 近3天正确率 ${plan.recentAcc}%`;
  const riskLine = plan.risk
    ? `<p class="text-sm text-error mt-2">按当前剩余量可能无法按时完成，至少需 ${plan.requiredPerDay} 新题/天（当前上限 ${plan.maxNewPerDay}）。</p>`
    : '';
  const ratioLine = `分配建议：新题 ${Math.round(plan.newRatio * 100)}% / 复习 ${Math.round(plan.reviewRatio * 100)}%`;

  planEl.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <p class="text-neutral">今日目标</p>
        <p class="text-2xl font-bold mt-1">${todayDone}/${plan.totalTarget} 题</p>
        <p class="text-sm text-neutral mt-1">建议构成：新题 ${plan.newTarget} + 复习 ${plan.reviewTarget}（到期 ${plan.dueReview}）</p>
        <p class="text-sm text-neutral mt-1">${ratioLine}</p>
        <p class="text-sm text-neutral mt-1">今日正确率：${todayAcc}% · 总进度：${done}/${total}</p>
        ${riskLine}
      </div>
      <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <i class="fa fa-bullseye text-primary text-2xl"></i>
      </div>
    </div>
    <div class="mt-4">
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width: ${pct}%"></div>
      </div>
      <p class="text-sm text-neutral mt-2">依据：${basis}</p>
    </div>
  `;
}

const KNOWLEDGE_DICT = {
  'law.basic': '交通法规基础',
  'law.signals': '信号灯与优先通行',
  'law.lanes': '车道与通行规则',
  'law.parking': '停车与临停规定',
  'safe.civilized': '安全文明驾驶',
  'safe.bad_weather': '恶劣天气/特殊路况',
  'safe.emergency': '紧急情况与事故处理',
  'safe.fatigue_drink': '疲劳/分心/酒驾等风险行为',
  'lights': '灯光使用',
  'highway': '高速公路规则',
  'signs_markings': '标志标线',
  'police_command': '交警手势与指挥'
};

let practiceMode = 'all'; // all | wrong | smart | knowledge | review
let orderPracticeScope = 'unanswered'; // unanswered | all
let wrongQueue = [];
let knowledgeQueue = [];
let knowledgeTitle = '';
let reviewQueue = [];
const practiceDraftAnswers = {};
const diagnosisDraftAnswers = {};
let practiceCurrentAnswer = null; // 仅用于练题页当前题即时反馈，不回显历史作答

function clearPracticeCurrentAnswer() {
  practiceCurrentAnswer = null;
}

function syncPracticeModeButtons() {
  qsa('[data-practice-mode]').forEach(btn => {
    const mode = btn.getAttribute('data-practice-mode');
    if (mode === practiceMode) {
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');
    } else {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
    }
  });
  const smartCtl = qs('#smart-lock-control');
  if (smartCtl) smartCtl.classList.toggle('hidden', practiceMode !== 'smart');
  const orderCtl = qs('#order-scope-control');
  if (orderCtl) orderCtl.classList.toggle('hidden', practiceMode !== 'all');
  const orderSel = qs('#order-scope');
  if (orderSel && orderSel.value !== orderPracticeScope) orderSel.value = orderPracticeScope;
  const autoNext = qs('#practice-auto-next');
  if (autoNext) autoNext.checked = isAnswerAutoNextEnabled(getSettings());
}

function getCurrentQuestion() {
  if (practiceMode === 'wrong') return wrongQueue[currentIndex];
  if (practiceMode === 'knowledge') return knowledgeQueue[currentIndex];
  if (practiceMode === 'review') return reviewQueue[currentIndex];
  return QUESTIONS[currentIndex];
}

function getCurrentTotal() {
  if (practiceMode === 'wrong') return wrongQueue.length;
  if (practiceMode === 'knowledge') return knowledgeQueue.length;
  if (practiceMode === 'review') return reviewQueue.length;
  return QUESTIONS.length;
}

function findOrderUnansweredNeighbor(direction, fromIndex, progress = getProgress()) {
  if (practiceMode !== 'all' || orderPracticeScope !== 'unanswered') return -1;
  const start = Number(fromIndex);
  if (!Number.isFinite(start)) return -1;
  if (direction > 0) {
    for (let i = start + 1; i < QUESTIONS.length; i += 1) {
      if (!progress.answered?.[QUESTIONS[i]?.id]) return i;
    }
    return -1;
  }
  for (let i = start - 1; i >= 0; i -= 1) {
    if (!progress.answered?.[QUESTIONS[i]?.id]) return i;
  }
  return -1;
}

function goPracticeNextQuestion() {
  if (practiceMode === 'review') {
    clearPracticeCurrentAnswer();
    startReviewPractice();
    return;
  }
  if (practiceMode === 'smart') {
    clearPracticeCurrentAnswer();
    currentIndex = pickSmartIndex();
    renderQuestion();
    return;
  }
  if (practiceMode === 'all' && orderPracticeScope === 'unanswered') {
    const nextUnanswered = findOrderUnansweredNeighbor(1, currentIndex);
    if (nextUnanswered >= 0) {
      clearPracticeCurrentAnswer();
      currentIndex = nextUnanswered;
      renderQuestion();
      return;
    }
  } else if (currentIndex < getCurrentTotal() - 1) {
    clearPracticeCurrentAnswer();
    currentIndex += 1;
  }
  renderQuestion();
}

function goPracticePrevQuestion() {
  if (practiceMode === 'all' && orderPracticeScope === 'unanswered') {
    const prevUnanswered = findOrderUnansweredNeighbor(-1, currentIndex);
    if (prevUnanswered >= 0) {
      clearPracticeCurrentAnswer();
      currentIndex = prevUnanswered;
    }
    renderQuestion();
    return;
  }
  if (currentIndex > 0) {
    clearPracticeCurrentAnswer();
    currentIndex -= 1;
  }
  renderQuestion();
}

function getTopWrongReason(profile) {
  const stat = profile?.reasonStat || {};
  const top = Object.entries(stat).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];
  return (top && Number(top[1] || 0) > 0) ? top[0] : '';
}

function getExamUrgency(examDate, now) {
  if (!examDate) return 0.3;
  const dayMs = 24 * 3600 * 1000;
  const target = new Date(`${examDate}T00:00:00`).getTime();
  if (!Number.isFinite(target)) return 0.3;
  const daysLeft = Math.max(0, Math.ceil((target - now) / dayMs));
  if (daysLeft <= 7) return 1;
  if (daysLeft <= 14) return 0.8;
  if (daysLeft <= 30) return 0.6;
  return 0.35;
}

function smartScoreQuestion(q, context) {
  const km = context?.km || {};
  const progress = context?.progress || {};
  const review = context?.review || {};
  const profile = context?.profile || getLearnerProfile();
  const now = Number(context?.now || Date.now());
  const examDate = context?.examDate || '';

  const kid = q.knowledgeId || 'law.basic';
  const m = km[kid]?.mastery ?? 0.5;
  const freq = Number(q.frequency || 3);
  const diff = Number(q.difficulty || 3);
  const answered = progress.answered?.[q.id];
  const wasWrong = !!(answered && answered.correct === false);

  const lastSeenTs = answered?.ts || profile?.byKnowledge?.[kid]?.lastTs || km[kid]?.lastTs || 0;
  const daysSinceLast = lastSeenTs ? (now - lastSeenTs) / (1000 * 3600 * 24) : 30;
  const forgetRisk = Math.min(1, Math.max(0, daysSinceLast / 10));

  const dueTs = Number(review[q.id]?.nextTs || 0);
  const dueBoost = dueTs > 0 && dueTs <= now ? 0.95 : 0;
  const unseenBoost = answered ? 0 : 0.22;
  const masteryRisk = (1 - m) * 1.15;
  const wrongBoost = wasWrong ? 0.85 : 0;
  const freqBoost = (freq / 5) * (0.35 + 0.35 * getExamUrgency(examDate, now));
  const forgetBoost = forgetRisk * 0.65;

  const topReason = getTopWrongReason(profile);
  const stem = String(q.stem || '');
  let reasonBoost = 0;
  if (topReason === 'memory') {
    reasonBoost = dueBoost > 0 ? 0.25 : (wasWrong ? 0.15 : 0);
  } else if (topReason === 'understand') {
    reasonBoost = diff >= 4 ? 0.2 : 0;
  } else if (topReason === 'careless') {
    reasonBoost = /(不得|必须|可以|不可以|不能|不准|严禁|应当|不应当|允许)/.test(stem) ? 0.2 : 0.05;
  } else if (topReason === 'trap') {
    reasonBoost = (freq >= 4 ? 0.15 : 0) + (diff >= 4 ? 0.08 : 0);
  }

  const donePenalty = answered && answered.correct ? 0.75 : 1;
  const total = (masteryRisk + wrongBoost + dueBoost + freqBoost + forgetBoost + unseenBoost + reasonBoost) * donePenalty;

  return {
    total,
    parts: {
      masteryRisk,
      wrongBoost,
      dueBoost,
      freqBoost,
      forgetBoost,
      unseenBoost,
      reasonBoost
    }
  };
}

let smartLock = { kid: '', remain: 0, groupTotal: 0, groupCorrect: 0, groupWrong: 0, groupStartTs: 0 };
let smartPickExplain = null;

function pickSmartIndex(preferKnowledgeId = '') {
  const progress = getProgress();
  const km = getKnowledgeMastery();
  const review = getReview();
  const profile = getLearnerProfile();
  const now = Date.now();
  const examDate = getExamDate();
  const scoreContext = { km, progress, review, profile, now, examDate };

  const settings = getSettings();
  const lockN = normalizeSmartLockN(settings.smartLockN || 10);

  // 1) 若指定 preferKnowledgeId，则优先在该知识点内挑分最高题
  // 2) 否则若存在锁定 kid 且 remain>0，则在锁定知识点内挑
  let kid = preferKnowledgeId || '';
  if (!kid && smartLock.kid && smartLock.remain > 0) kid = smartLock.kid;

  const unanswered = QUESTIONS.filter(q => !progress.answered?.[q.id]);
  const poolBase = unanswered.length ? unanswered : QUESTIONS;
  const pool = kid ? poolBase.filter(q => (q.knowledgeId || 'law.basic') === kid) : poolBase;

  let best = (pool.length ? pool[0] : poolBase[0]);
  let bestScore = -Infinity;
  for (const q of (pool.length ? pool : poolBase)) {
    const scored = smartScoreQuestion(q, scoreContext);
    if (scored.total > bestScore) {
      bestScore = scored.total;
      best = q;
      smartPickExplain = scored;
    }
  }

  // 初始化/刷新锁定：当没有锁定时，锁定到 best 的知识点
  const bestKid = best.knowledgeId || 'law.basic';
  if (!smartLock.kid || smartLock.remain <= 0) {
    smartLock = {
      kid: bestKid,
      remain: lockN,
      groupTotal: 0,
      groupCorrect: 0,
      groupWrong: 0,
      groupStartTs: Date.now()
    };
  }

  const idx = QUESTIONS.findIndex(x => x.id === best.id);
  return Math.max(0, idx);
}

function renderQuestion() {
  if (!QUESTIONS.length) {
    showQuestionLoadHint();
    return;
  }
  const q = getCurrentQuestion();
  if (!q) return;

  const progress = getProgress();
  const answered = (practiceCurrentAnswer && practiceCurrentAnswer.questionId === q.id)
    ? { selected: practiceCurrentAnswer.selected, correct: practiceCurrentAnswer.correct }
    : null;
  const kName = KNOWLEDGE_DICT[q.knowledgeId] || q.knowledgeName || '未标注知识点';
  const isMulti = q.type === 'multi';
  const answerIndexes = getAnswerIndexes(q.answer);
  const correctSet = new Set(answerIndexes);

  qs('#q-index').textContent = String(currentIndex + 1);
  qs('#q-total').textContent = String(getCurrentTotal());
  qs('#q-id').textContent = q.id;
  // 题干渲染（支持“粗心关键词提示”时做轻度高亮）
  const stemEl = qs('#q-stem');
  const stemText = String(q.stem || '');
  const reasonMap = getWrongReason();
  const vals = Object.values(reasonMap || {});
  const carelessRate = vals.length ? (vals.filter(x => x === 'careless').length / vals.length) : 0;
  if (stemEl) {
    if (carelessRate >= 0.4) {
      const re = /(不得|必须|可以|不可以|不能|不准|严禁|应当|不应当|允许)/g;
      stemEl.innerHTML = stemText.replace(re, '<span class="text-error font-bold">$1</span>');
    } else {
      stemEl.textContent = stemText;
    }
  }
  const mediaEl = qs('#q-media');
  const workspaceEl = qs('#q-workspace');
  if (mediaEl) {
    const html = renderQuestionMediaHtml(q, '', 'side');
    mediaEl.innerHTML = html;
    mediaEl.classList.toggle('hidden', !html);
    if (workspaceEl) {
      workspaceEl.className = html
        ? 'mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4 items-start'
        : 'mt-4';
    }
  }
  qs('#q-tags').innerHTML = (q.tags || []).map(t => `<span class="badge badge-warning">${t}</span>`).join('')
    + (practiceMode === 'smart' ? '<span class="badge badge-success">AI加速</span>' : '')
    + (practiceMode === 'all' ? `<span class="badge badge-success">${orderPracticeScope === 'all' ? '顺序全量' : '顺序未做'}</span>` : '')
    + (practiceMode === 'wrong' ? '<span class="badge badge-error">错题重练</span>' : '')
    + (practiceMode === 'knowledge' ? `<span class="badge badge-success">专项：${knowledgeTitle || kName}</span>` : '')
    + (practiceMode === 'review' ? `<span class="badge badge-warning">到期复习</span>` : '');

  // 收藏
  const favBtn = qs('#btn-fav');
  const fav = isFavorite(q.id);
  favBtn.innerHTML = fav
    ? '<i class="fa fa-star mr-2"></i>已收藏'
    : '<i class="fa fa-star-o mr-2"></i>收藏';

  // options
  const optWrap = qs('#q-options');
  if (optWrap) {
    optWrap.className = mediaEl && !mediaEl.classList.contains('hidden')
      ? 'space-y-3 lg:col-span-3'
      : 'space-y-3';
  }
  if (mediaEl && !mediaEl.classList.contains('hidden')) {
    mediaEl.className = 'lg:col-span-2';
  }
  optWrap.innerHTML = '';

  const typeLabel = questionTypeText(q.type, true);
  const km = getKnowledgeMastery();
  const mastery = km[q.knowledgeId]?.mastery;
  const masteryText = (typeof mastery === 'number') ? ` · 知识点：${kName}（掌握度 ${(mastery * 100).toFixed(0)}%）` : ` · 知识点：${kName}`;

  qs('#q-type').textContent = typeLabel + masteryText;

  const reasonEl = qs('#smart-reason');
  if (reasonEl) {
    if (practiceMode === 'smart') {
      const profile = getLearnerProfile();
      const topReason = getTopWrongReason(profile);
      const parts = smartPickExplain?.parts || {};
      const partLabels = {
        masteryRisk: '薄弱知识点',
        wrongBoost: '历史错题',
        dueBoost: '到期复习',
        freqBoost: '高频考点',
        forgetBoost: '遗忘风险',
        unseenBoost: '新题覆盖',
        reasonBoost: '个性错因'
      };
      const topParts = Object.entries(parts)
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
        .slice(0, 2)
        .filter(([, v]) => Number(v || 0) > 0.12)
        .map(([k]) => partLabels[k] || k);
      const settings = getSettings();
      const lockN = normalizeSmartLockN(settings.smartLockN || 10);
      const topReasonText = ({
        memory: '记忆巩固',
        understand: '理解强化',
        careless: '审题纠偏',
        trap: '陷阱识别'
      })[topReason] || '均衡训练';
      const factors = topParts.length ? topParts.join(' + ') : '综合评分优先';
      reasonEl.textContent = `AI 专属建议：当前先做「${factors}」题型（主策略：${topReasonText}）· 锁定知识点：${smartLock.kid ? (KNOWLEDGE_DICT[smartLock.kid] || smartLock.kid) : '—'}（剩余${Math.max(0, smartLock.remain)}题 / 每组${lockN}题）`;
      reasonEl.classList.remove('hidden');
    } else if (practiceMode === 'knowledge') {
      reasonEl.textContent = `专项练习：${knowledgeTitle || kName} · 剩余 ${Math.max(0, getCurrentTotal() - (currentIndex + 1))} 题`;
      reasonEl.classList.remove('hidden');
    } else if (practiceMode === 'review') {
      const due = getDueReviewCount();
      reasonEl.textContent = `复习模式：优先到期题（当前到期 ${due} 题）· 目标是防遗忘，不追求新题覆盖。`;
      reasonEl.classList.remove('hidden');
    } else if (practiceMode === 'wrong') {
      const wc = getWrongList().length;
      reasonEl.textContent = `错题模式：聚焦历史错误（当前错题 ${wc} 题）· 连续答对 2 次会自动移出。`;
      reasonEl.classList.remove('hidden');
    } else if (practiceMode === 'all') {
      const p = getProgress();
      const remain = QUESTIONS.filter(x => !p.answered?.[x.id]).length;
      const scopeText = orderPracticeScope === 'all' ? '全量顺序（从头覆盖）' : '未做优先（先清未做题）';
      reasonEl.textContent = `顺序模式：${scopeText}（剩余未做 ${remain} 题）· 适合系统覆盖全量题库。`;
      reasonEl.classList.remove('hidden');
    } else {
      reasonEl.classList.add('hidden');
    }
  }

  const selected = answered?.selected;
  const locked = (typeof selected === 'number') || Array.isArray(selected);
  let draft = isMulti ? (practiceDraftAnswers[q.id] || []) : [];
  if (isMulti && !Array.isArray(practiceDraftAnswers[q.id])) {
    practiceDraftAnswers[q.id] = [];
    draft = practiceDraftAnswers[q.id];
  }
  const selectedIndexes = locked ? getAnswerIndexes(selected) : (isMulti ? getAnswerIndexes(draft) : getAnswerIndexes(selected));
  const selectedSet = new Set(selectedIndexes);

  function applyAnswer(selectedPayload, correct) {
    const ts = Date.now();
    practiceCurrentAnswer = {
      questionId: q.id,
      selected: selectedPayload,
      correct: !!correct
    };
    upsertAnswer(q.id, selectedPayload, correct, { wrongClearThreshold: 2 });
    updateKnowledgeMastery(q.knowledgeId, correct, { frequency: q.frequency, difficulty: q.difficulty });
    scheduleReview(q.id, correct);
    updateLearnerProfileOnAnswer({
      ts,
      questionId: q.id,
      knowledgeId: q.knowledgeId,
      correct
    });
    trackLearningEvent('answer_submitted', {
      mode: practiceMode,
      questionId: q.id,
      knowledgeId: q.knowledgeId,
      correct: !!correct,
      questionType: q.type
    });
    delete practiceDraftAnswers[q.id];

    if (practiceMode === 'knowledge' && !correct) {
      const insertPos = Math.min(knowledgeQueue.length, currentIndex + 2);
      knowledgeQueue.splice(insertPos, 0, q);
    }

    if (practiceMode === 'smart') {
      smartLock.groupTotal += 1;
      if (correct) smartLock.groupCorrect += 1;
      else smartLock.groupWrong += 1;
      if (smartLock.remain > 0) smartLock.remain -= 1;
      if (smartLock.remain <= 0) {
        trackLearningEvent('smart_group_finished', {
          knowledgeId: smartLock.kid,
          total: smartLock.groupTotal,
          correct: smartLock.groupCorrect,
          wrong: smartLock.groupWrong
        });
        openSmartSummary();
        renderStats();
        renderPlanSummary();
        return;
      }
    }

    const renderAfterAnswer = () => {
      renderQuestion();
      renderStats();
      renderPlanSummary();
    };
    const autoMoved = maybeScheduleAutoNext({
      expectedQuestionId: q.id,
      renderLocked: renderAfterAnswer,
      canAdvance: (expectedId) => currentPageId === 'practice' && getCurrentQuestion()?.id === expectedId,
      goNext: goPracticeNextQuestion
    });
    if (!autoMoved) renderAfterAnswer();

    if (practiceMode === 'wrong') {
      const ids = getWrongList();
      const map = new Map(QUESTIONS.map(q => [q.id, q]));
      wrongQueue = ids.map(id => map.get(id)).filter(Boolean);
      if (currentIndex >= wrongQueue.length) currentIndex = Math.max(0, wrongQueue.length - 1);
    }
  }

  q.options.forEach((text, idx) => {
    const item = document.createElement('div');
    item.className = 'question-option';

    // 状态样式
    if (locked) {
      if (correctSet.has(idx)) item.classList.add('correct');
      if (selectedSet.has(idx) && !correctSet.has(idx)) item.classList.add('incorrect');
    } else if (selectedSet.has(idx)) {
      item.classList.add('selected');
    }

    item.innerHTML = `
      <input type="${isMulti ? 'checkbox' : 'radio'}" name="qopt" ${locked ? 'disabled' : ''} ${selectedSet.has(idx) ? 'checked' : ''} />
      <span>${q.type === 'tf' ? '' : String.fromCharCode(65 + idx) + '. '}${text}</span>
    `;

    item.addEventListener('click', () => {
      if (locked) return;
      if (isMulti) {
        const cur = new Set(getAnswerIndexes(practiceDraftAnswers[q.id] || []));
        if (cur.has(idx)) cur.delete(idx);
        else cur.add(idx);
        practiceDraftAnswers[q.id] = Array.from(cur).sort((a, b) => a - b);
        renderQuestion();
        return;
      }
      const correct = correctSet.has(idx);
      applyAnswer(idx, correct);
    });

    optWrap.appendChild(item);
  });

  if (isMulti && !locked) {
    const submitWrap = document.createElement('div');
    submitWrap.className = 'mt-3 flex items-center justify-between';
    submitWrap.innerHTML = `
      <p class="text-sm text-neutral">已选 ${selectedSet.size} 项（多选需点“提交答案”判题）</p>
      <button class="btn btn-primary" id="btn-submit-multi" ${selectedSet.size ? '' : 'disabled'}>提交答案</button>
    `;
    optWrap.appendChild(submitWrap);
    qs('#btn-submit-multi')?.addEventListener('click', () => {
      const picked = Array.from(new Set(getAnswerIndexes(practiceDraftAnswers[q.id] || []))).sort((a, b) => a - b);
      const correct = isSameAnswerSet(picked, answerIndexes);
      applyAnswer(picked, correct);
    });
  }

  // analysis
  const analysisBox = qs('#q-analysis');
  if (locked) {
    analysisBox.classList.remove('hidden');
    const ok = answered.correct;
    qs('#q-result').innerHTML = ok
      ? '<span class="text-success font-medium"><i class="fa fa-check-circle mr-2"></i>回答正确</span>'
      : '<span class="text-error font-medium"><i class="fa fa-times-circle mr-2"></i>回答错误</span>';
    qs('#q-analysis-text').textContent = q.analysis || '暂无解析';
  } else {
    analysisBox.classList.add('hidden');
  }

  // 错因选择（仅在答错后展示）
  const reasonBox = qs('#wrong-reason');
  if (reasonBox) {
    if (locked && answered && answered.correct === false) {
      reasonBox.classList.remove('hidden');
      const saved = getWrongReason()?.[q.id] || '';
      qsa('[name="wrongReason"]').forEach(r => {
        r.checked = (r.value === saved);
      });
    } else {
      reasonBox.classList.add('hidden');
    }
  }

  // 专项模式：到最后一题后显示小结入口
  const summaryBtn = qs('#btn-knowledge-summary');
  if (summaryBtn) {
    if (practiceMode === 'knowledge' && locked && currentIndex === getCurrentTotal() - 1) {
      summaryBtn.classList.remove('hidden');
    } else {
      summaryBtn.classList.add('hidden');
    }
  }

  // note
  // 粗心提示：高亮常见关键词（当“粗心”错因占比较高时启用）
  const hintReasonMap = getWrongReason();
  const hintVals = Object.values(hintReasonMap || {});
  const hintCarelessRate = hintVals.length ? (hintVals.filter(x => x === 'careless').length / hintVals.length) : 0;
  const hintEl = qs('#smart-group-hint');
  if (hintEl) {
    if (hintCarelessRate >= 0.4) {
      hintEl.textContent = '提示：检测到你“粗心”占比较高，做题时重点关注题干中的“不/可以/必须/不得”等关键词。';
      hintEl.classList.remove('hidden');
    } else {
      hintEl.classList.add('hidden');
    }
  }

  // note
  const note = getNote(q.id);
  const noteEl = qs('#q-note');
  noteEl.value = note;

  // buttons state
  const prevBtn = qs('#btn-prev');
  if (prevBtn) {
    if (practiceMode === 'all' && orderPracticeScope === 'unanswered') {
      prevBtn.disabled = findOrderUnansweredNeighbor(-1, currentIndex, progress) < 0;
    } else {
      prevBtn.disabled = currentIndex === 0;
    }
  }
  const nextBtn = qs('#btn-next');
  if (nextBtn) {
    const canLoopNext = practiceMode === 'smart' || practiceMode === 'review';
    if (canLoopNext) {
      nextBtn.disabled = false;
    } else if (practiceMode === 'all' && orderPracticeScope === 'unanswered') {
      nextBtn.disabled = findOrderUnansweredNeighbor(1, currentIndex, progress) < 0;
    } else {
      nextBtn.disabled = currentIndex === getCurrentTotal() - 1;
    }
  }
  syncPracticeModeButtons();
}

function renderStats() {
  const progress = getProgress();
  const done = progress.doneCount || 0;
  const total = QUESTIONS.length;
  qs('#stat-done').textContent = String(done);
  qs('#stat-total').textContent = String(total);

  const correctCount = Object.values(progress.answered || {}).filter(a => a.correct).length;
  const acc = done ? Math.round((correctCount / done) * 100) : 0;
  qs('#stat-acc').textContent = acc + '%';

  const wrongCount = (getWrongList() || []).length;
  const wrongBadge = qs('#stat-wrong');
  if (wrongBadge) wrongBadge.textContent = String(wrongCount);
  refreshSmartGuideEntryButton();
  renderTodayMissionFlow();
  renderSmartGuideFlow();
}

function openSmartSummary() {
  const modal = qs('#smart-summary-modal');
  const content = qs('#smart-summary-content');
  if (!modal || !content) {
    // fallback：如果没渲染到 modal，直接继续
    currentIndex = pickSmartIndex();
    renderQuestion();
    return;
  }

  const settings = getSettings();
  const lockN = normalizeSmartLockN(settings.smartLockN || 10);
  const used = smartLock.groupTotal;
  const acc = used ? Math.round((smartLock.groupCorrect / used) * 100) : 0;
  const mins = Math.max(1, Math.round((Date.now() - (smartLock.groupStartTs || Date.now())) / 60000));

  const km = getKnowledgeMastery();
  const m = km[smartLock.kid]?.mastery;
  const mText = (typeof m === 'number') ? `${Math.round(m * 100)}%` : '—';

  content.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="card"><p class="text-neutral">本组知识点</p><p class="text-xl font-bold mt-1">${KNOWLEDGE_DICT[smartLock.kid] || smartLock.kid}</p></div>
      <div class="card"><p class="text-neutral">本组正确率</p><p class="text-2xl font-bold mt-1">${acc}%</p><p class="text-sm text-neutral mt-1">${smartLock.groupCorrect}/${used} 题</p></div>
      <div class="card"><p class="text-neutral">当前掌握度</p><p class="text-2xl font-bold mt-1">${mText}</p><p class="text-sm text-neutral mt-1">本组用时约 ${mins} 分钟</p></div>
    </div>
    <div class="bg-gray-50 p-4 rounded-lg text-sm text-neutral">
      <p><strong>下一步：</strong>继续下一组（每组 ${lockN} 题），AI 将优先安排你的高频短板与到期复习。</p>
    </div>
  `;

  modal.classList.remove('hidden');
}

function bindEvents() {
  bindSettingsModal();

  // 导航
  qsa('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
      const target = this.getAttribute('data-target');
      const titles = {
        'home': '首页',
        'smart-guide': 'AI 托管学习',
        'diagnosis': 'AI 智能诊断',
        'learning': 'AI 个性学习',
        'practice': '练题',
        'wrongbook': '错题本',
        'plan': '今日计划',
        'question-bank': '题库',
        'exam': '模拟考试',
        'crash-course': '考前冲刺',
        'report': 'AI 学习报告',
        'help': '使用说明'
      };
      showPage(target, titles[target] || '');
      if (target === 'practice') {
        renderQuestion();
      }
      if (target === 'home') {
        renderStats();
        renderPlanSummary();
      }
      if (target === 'smart-guide') {
        setPureSmartMode(true);
        renderSmartGuideFlow();
      }
      if (target === 'wrongbook') {
        renderWrongbook();
      }
      if (target === 'plan') {
        renderPlanPage();
      }
      if (target === 'question-bank') {
        renderQuestionBank();
      }
      if (target === 'help') {
        renderHelpTOC();
      }
      if (target === 'crash-course') {
        renderCrashCourse();
      }
      if (target === 'report') {
        renderReportPage();
      }
    });
  });

  qs('#btn-switch-student')?.addEventListener('click', () => {
    openAuthGate('student');
  });
  qs('#enter-smart-guide')?.addEventListener('click', () => {
    setPureSmartMode(true);
    showPage('smart-guide', 'AI 托管学习');
    renderSmartGuideFlow();
  });
  qs('#smart-guide-return')?.addEventListener('click', () => {
    showPage('smart-guide', 'AI 托管学习');
    renderSmartGuideFlow();
  });
  qs('#btn-logout-org')?.addEventListener('click', () => {
    logoutOrg();
  });
  qs('#top-student-select')?.addEventListener('change', (e) => {
    const sid = String(e.target?.value || '');
    if (sid) enterStudent(sid);
  });
  qs('#btn-student-manage')?.addEventListener('click', () => {
    openStudentManageModal();
  });
  qs('#btn-context-switch')?.addEventListener('click', () => {
    openContextModal();
  });

  // 练题按钮
  qs('#btn-prev').addEventListener('click', () => {
    goPracticePrevQuestion();
  });
  qs('#btn-next').addEventListener('click', () => {
    goPracticeNextQuestion();
  });

  // 智能锁定控制
  const smartSel = qs('#smart-lock-n');
  if (smartSel) {
    const settings = getSettings();
    smartSel.value = String(normalizeSmartLockN(settings.smartLockN || 10));
    smartSel.addEventListener('change', () => {
      const s = getSettings();
      s.smartLockN = normalizeSmartLockN(smartSel.value || 10);
      setSettings(s);
      // 重置当前锁定，使新配置立刻生效
      smartLock = { kid: '', remain: 0, groupTotal: 0, groupCorrect: 0, groupWrong: 0, groupStartTs: 0 };
      if (practiceMode === 'smart') {
        currentIndex = pickSmartIndex();
        renderQuestion();
      }
    });
  }

  const orderSel = qs('#order-scope');
  if (orderSel) {
    orderSel.value = orderPracticeScope;
    orderSel.addEventListener('change', () => {
      const v = String(orderSel.value || 'unanswered');
      orderPracticeScope = (v === 'all') ? 'all' : 'unanswered';
      if (practiceMode === 'all') {
        startOrderPractice(orderPracticeScope);
      } else {
        renderQuestion();
      }
    });
  }

  qs('#practice-auto-next')?.addEventListener('change', (e) => {
    setAnswerAutoNext(!!e.target.checked);
    syncPracticeModeButtons();
  });

  // 智能组小结弹窗
  const smartModal = qs('#smart-summary-modal');
  const smartClose = qs('#close-smart-summary');
  const smartContinue = qs('#smart-summary-continue');
  smartClose?.addEventListener('click', () => smartModal?.classList.add('hidden'));
  smartContinue?.addEventListener('click', () => {
    smartModal?.classList.add('hidden');
    // 进入下一组：重置锁定，让 pickSmartIndex 重新选“最优知识点”
    smartLock = { kid: '', remain: 0, groupTotal: 0, groupCorrect: 0, groupWrong: 0, groupStartTs: 0 };
    currentIndex = pickSmartIndex();
    renderQuestion();
  });

  // 专项小结
  const summaryBtn = qs('#btn-knowledge-summary');
  const modal = qs('#knowledge-summary-modal');
  const closeBtn = qs('#close-knowledge-summary');
  const nextBtn = qs('#knowledge-summary-next');

  function openSummary() {
    if (!modal) return;
    const content = qs('#knowledge-summary-content');
    const progress = getProgress();
    const answered = progress.answered || {};

    const items = (knowledgeQueue || []).map(q => ({
      id: q.id,
      correct: answered[q.id]?.correct
    }));
    const done = items.filter(x => typeof x.correct === 'boolean').length;
    const correctN = items.filter(x => x.correct === true).length;
    const acc = done ? Math.round((correctN / done) * 100) : 0;

    // 估算掌握度提升：拿当前知识点 mastery 显示即可
    const km = getKnowledgeMastery();
    const kid = (knowledgeQueue?.[0]?.knowledgeId) || '';
    const m = km[kid]?.mastery;
    const mText = (typeof m === 'number') ? `${Math.round(m * 100)}%` : '—';

    content.innerHTML = `
      <div class="card">
        <p class="text-neutral">专项</p>
        <p class="text-xl font-bold mt-1">${knowledgeTitle || '—'}</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="card"><p class="text-neutral">完成题数</p><p class="text-2xl font-bold mt-1">${done}/${getCurrentTotal()}</p></div>
        <div class="card"><p class="text-neutral">正确率</p><p class="text-2xl font-bold mt-1">${acc}%</p></div>
        <div class="card"><p class="text-neutral">当前掌握度</p><p class="text-2xl font-bold mt-1">${mText}</p></div>
      </div>
      <div class="bg-gray-50 p-4 rounded-lg">
        <p class="text-sm text-neutral">建议：如果正确率低于80%，再做一轮专项；如果≥80%，进入智能加速继续补其他高频短板。</p>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  summaryBtn?.addEventListener('click', openSummary);
  closeBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
  nextBtn?.addEventListener('click', () => {
    modal?.classList.add('hidden');

    // 若存在 ROI 串练队列，则自动进入下一专项
    if (window.__roiChain && Array.isArray(window.__roiChain)) {
      const nextI = (window.__roiChainIndex || 0) + 1;
      if (nextI < window.__roiChain.length) {
        window.__roiChainIndex = nextI;
        startKnowledgePractice(window.__roiChain[nextI], 20);
        return;
      } else {
        // 串练结束，清理
        window.__roiChain = null;
        window.__roiChainIndex = 0;
      }
    }

    practiceMode = 'smart';
    currentIndex = pickSmartIndex();
    showPage('practice', '练题');
    renderQuestion();
  });

  // 模式切换
  qsa('[data-practice-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-practice-mode');
      if (mode === 'smart') {
        startSmartPractice();
        return;
      }
      if (mode === 'wrong') {
        startWrongPractice();
        return;
      }
      if (mode === 'review') {
        startReviewPractice();
        return;
      }
      startOrderPractice();
    });
  });
  qs('#btn-fav').addEventListener('click', () => {
    const q = getCurrentQuestion();
    toggleFavorite(q.id);
    renderQuestion();
  });
  qs('#q-note').addEventListener('input', (e) => {
    const q = getCurrentQuestion();
    setNote(q.id, e.target.value);
  });

  // 错因选择存储
  qsa('[name="wrongReason"]').forEach(r => {
    r.addEventListener('change', () => {
      const q = getCurrentQuestion();
      if (!q) return;
      setWrongReasonForQuestion(q.id, r.value);
      updateLearnerProfileWrongReason(r.value);
      trackLearningEvent('wrong_reason_tagged', {
        questionId: q.id,
        knowledgeId: q.knowledgeId,
        reason: r.value
      });
    });
  });

  // 从个性学习页/首页进入练题（改为默认走智能加速）
  qsa('[data-go-practice="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      practiceMode = 'smart';
      // 重置锁定，让智能配置立即生效
      smartLock = { kid: '', remain: 0, groupTotal: 0, groupCorrect: 0, groupWrong: 0, groupStartTs: 0 };
      currentIndex = pickSmartIndex();
      showPage('practice', '练题');
      renderQuestion();
      renderGlobalCTA();
    });
  });

  const wrongStart = qs('#btn-wrong-start');
  if (wrongStart) {
    wrongStart.addEventListener('click', () => {
      startWrongPractice();
    });
  }

  // 顶部栏按钮
  qsa('[data-top-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-top-action');
      if (act === 'help') {
        showPage('help', '使用说明');
        renderHelpTOC();
        return;
      }
      if (act === 'notifications') {
        alert('通知中心（原型占位）：后续可接学习提醒/错题复习提醒/诊断未完成提醒。');
        return;
      }
      if (act === 'settings') {
        openSettingsModal();
        return;
      }
    });
  });

  // 个性学习：学习模式选择
  qsa('[data-learning-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-learning-mode');
      if (mode === 'order') {
        startOrderPractice(orderPracticeScope);
        return;
      }
      if (mode === 'random') {
        practiceMode = 'all';
        currentIndex = Math.floor(Math.random() * QUESTIONS.length);
        syncPracticeModeButtons();
        showPage('practice', '练题');
        renderQuestion();
        return;
      }
      if (mode === 'special') {
        // 滚动到专项区域
        const sec = document.querySelector('#learning h4.font-bold.mb-4');
        sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (mode === 'wrong') {
        startWrongPractice();
        return;
      }
    });
  });

  // 个性学习：专项练习按钮
  qsa('[data-special]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kid = btn.getAttribute('data-special');
      startKnowledgePractice(kid, 20);
    });
  });

  // 模拟考试入口
  qsa('[data-go-exam]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-go-exam');
      startMockExam(mode === 'quick' ? 'quick' : 'standard');
    });
  });

  qs('#exam-detail-close')?.addEventListener('click', () => {
    const m = qs('#exam-detail-modal');
    m?.classList.add('hidden');
    if (m?.__replayKeyHandler) {
      document.removeEventListener('keydown', m.__replayKeyHandler);
      m.__replayKeyHandler = null;
    }
  });

  qs('#btn-wrong-clear')?.addEventListener('click', () => {
    const ok = confirm('确认清空错题本与错题计数？');
    if (!ok) return;
    localStorage.removeItem('qa.wrong');
    localStorage.removeItem('qa.wrongStreak');
    renderWrongbook();
    renderStats();
  });

  // 考前冲刺入口：先跳转到智能加速（后续可做冲刺策略）
  qsa('[data-go-crash]').forEach(btn => {
    btn.addEventListener('click', () => {
      startMockExam('standard');
    });
  });

  // 同步考试日期：复用首页 date picker 的 confirm
  const confirm = qs('#confirm-date');
  if (confirm) {
    confirm.addEventListener('click', () => {
      const examDate = qs('#exam-date')?.value;
      if (examDate) setExamDate(examDate);
      refreshSmartGuideEntryButton();
      renderPlanSummary();
    });
  }

  // 初始化时把 localStorage 的考试日期回填到 input
  const input = qs('#exam-date');
  if (input) {
    const saved = getExamDate();
    if (saved) input.value = saved;
  }
}

function startWrongPractice() {
  clearPracticeCurrentAnswer();
  const ids = getWrongList();
  const map = new Map(QUESTIONS.map(q => [q.id, q]));
  wrongQueue = ids.map(id => map.get(id)).filter(Boolean);
  if (!wrongQueue.length) {
    alert('当前没有错题，已切换到智能加速练习。');
    startSmartPractice();
    return;
  }
  practiceMode = 'wrong';
  currentIndex = 0;
  syncPracticeModeButtons();
  showPage('practice', '错题重练');
  renderQuestion();
}

function startReviewPractice() {
  clearPracticeCurrentAnswer();
  const r = getReview();
  const dueIds = Object.keys(r)
    .filter(id => (r[id]?.nextTs || 0) <= Date.now())
    .slice(0, 50);

  const map = new Map(QUESTIONS.map(q => [q.id, q]));
  reviewQueue = dueIds.map(id => map.get(id)).filter(Boolean);

  if (!reviewQueue.length) {
    alert('暂无到期复习题（原型提示）。继续智能加速或稍后再来。');
    startSmartPractice();
    return;
  }

  practiceMode = 'review';
  currentIndex = 0;
  syncPracticeModeButtons();
  showPage('practice', '到期复习');
  renderQuestion();
}

function startSmartPractice() {
  clearPracticeCurrentAnswer();
  practiceMode = 'smart';
  smartLock = { kid: '', remain: 0, groupTotal: 0, groupCorrect: 0, groupWrong: 0, groupStartTs: 0 };
  currentIndex = pickSmartIndex();
  syncPracticeModeButtons();
  showPage('practice', '练题');
  renderQuestion();
}

function startOrderPractice(scope = '') {
  clearPracticeCurrentAnswer();
  if (scope === 'all' || scope === 'unanswered') orderPracticeScope = scope;
  practiceMode = 'all';
  if (orderPracticeScope === 'all') {
    currentIndex = 0;
  } else {
    const p = getProgress();
    const firstUnanswered = QUESTIONS.findIndex(q => !p.answered?.[q.id]);
    currentIndex = firstUnanswered >= 0 ? firstUnanswered : 0;
  }
  syncPracticeModeButtons();
  showPage('practice', '练题');
  renderQuestion();
}

function getTodayMissionState() {
  const weak = getCrashWeakKnowledge(1);
  const weakKid = weak[0]?.kid || 'law.basic';
  const weakName = KNOWLEDGE_DICT[weakKid] || weakKid;
  const dueCount = getDueReviewCount();
  const reviewTarget = Math.max(8, Math.min(20, dueCount || 8));

  const events = getLearningEvents();
  const start = new Date(`${todayStr()}T00:00:00`).getTime();
  const end = start + 24 * 3600 * 1000;
  const todayEvents = (events || []).filter(e => {
    const ts = Number(e?.ts || 0);
    return ts >= start && ts < end;
  });

  const weakDone = todayEvents.filter(e =>
    e?.event === 'answer_submitted'
    && e?.payload?.knowledgeId === weakKid
  ).length;
  const reviewDone = todayEvents.filter(e =>
    e?.event === 'answer_submitted'
    && e?.payload?.mode === 'review'
  ).length;

  const examDone = getExamHistory().some(x => {
    const ts = Number(x?.finishedAt || 0);
    return ts >= start && ts < end && String(x?.examType || '') === 'quick';
  });

  const step1Done = weakDone >= 20;
  const step2Done = (dueCount === 0) || (reviewDone >= reviewTarget);
  const step3Done = examDone;

  return {
    weakKid,
    weakName,
    dueCount,
    reviewTarget,
    weakDone,
    reviewDone,
    step1Done,
    step2Done,
    step3Done
  };
}

function runTodayMissionAction(action, extra = {}) {
  if (action === 'weak') {
    const kid = extra.kid || getTodayMissionState().weakKid;
    startKnowledgePractice(kid, 20);
    return;
  }
  if (action === 'review') {
    startReviewPractice();
    return;
  }
  if (action === 'exam-quick') {
    startMockExam('quick');
    return;
  }
}

function renderTodayMissionFlow() {
  const box = qs('#today-missions-box');
  if (!box) return;

  const st = getTodayMissionState();
  const rows = [
    {
      id: 1,
      title: `弱项专项20题 · ${st.weakName}`,
      hint: `已完成 ${Math.min(st.weakDone, 20)}/20 题`,
      done: st.step1Done,
      action: 'weak',
      kid: st.weakKid,
      cta: '开始专项'
    },
    {
      id: 2,
      title: '到期复习清理',
      hint: st.dueCount
        ? `到期 ${st.dueCount} 题，已完成 ${Math.min(st.reviewDone, st.reviewTarget)}/${st.reviewTarget}`
        : '当前无到期题，系统判定已完成',
      done: st.step2Done,
      action: 'review',
      cta: '开始复习'
    },
    {
      id: 3,
      title: '20分钟快速模考',
      hint: st.step3Done ? '今日已完成 1 次快速模考' : '建议今天完成 1 次，校准临考状态',
      done: st.step3Done,
      action: 'exam-quick',
      cta: '开始模考'
    }
  ];

  const next = rows.find(x => !x.done);
  const allDone = !next;

  box.innerHTML = `
    <div class="space-y-3">
      ${rows.map(r => `
        <div class="flex items-center justify-between p-3 border ${r.done ? 'border-success/40 bg-success/5' : 'border-gray-200'} rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full ${r.done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'} flex items-center justify-center">
              <i class="fa ${r.done ? 'fa-check' : 'fa-flag'}"></i>
            </div>
            <div>
              <p class="font-medium">步骤 ${r.id}：${r.title}</p>
              <p class="text-sm text-neutral">${r.hint}</p>
            </div>
          </div>
          <button
            class="btn ${r.done ? 'btn-secondary' : 'btn-primary'}"
            ${r.done ? 'disabled' : ''}
            data-mission-action="${r.action}"
            ${r.kid ? `data-mission-kid="${r.kid}"` : ''}
          >${r.done ? '已完成' : r.cta}</button>
        </div>
      `).join('')}
    </div>
    <div class="mt-4 border-t border-gray-200 pt-3 flex items-center justify-between gap-3">
      <p class="text-sm text-neutral">${allDone ? '今日三步已全部完成，建议继续 AI 加速巩固。' : `下一步建议：先完成步骤 ${next.id}`}</p>
      <button
        class="btn ${allDone ? 'btn-secondary' : 'btn-primary'}"
        ${allDone ? 'disabled' : ''}
        ${allDone ? '' : `data-mission-action="${next.action}"`}
        ${allDone || !next.kid ? '' : `data-mission-kid="${next.kid}"`}
      >${allDone ? '今日任务完成' : `去做步骤 ${next.id}`}</button>
    </div>
  `;

  qsa('[data-mission-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-mission-action') || '';
      const kid = btn.getAttribute('data-mission-kid') || '';
      runTodayMissionAction(action, { kid });
    });
  });
}

function getTodayExamDone() {
  const start = new Date(`${todayStr()}T00:00:00`).getTime();
  const end = start + 24 * 3600 * 1000;
  return getExamHistory().some(x => {
    const ts = Number(x?.finishedAt || 0);
    return ts >= start && ts < end && String(x?.examType || '') === 'quick';
  });
}

function getSmartGuideState() {
  const d = getDiagnosis();
  const total = QUESTIONS.length || 0;
  const progress = getProgress();
  const done = Number(progress.doneCount || 0);
  const examDate = getExamDate();
  const plan = getDynamicDailyPlan(total, done, examDate);
  const daily = getDaily();
  const today = todayStr();
  const todayRec = daily.byDate?.[today] || { done: 0, correct: 0 };
  const todayDone = Number(todayRec.done || 0);
  const todayAcc = todayDone ? Math.round((Number(todayRec.correct || 0) / todayDone) * 100) : 0;
  const mission = getTodayMissionState();
  const weak = getCrashWeakKnowledge(1)[0];
  const dueReview = getDueReviewCount();
  const examDone = getTodayExamDone();
  const diagDone = d.status === 'done';
  const diagRunning = d.status === 'running';
  const missionDone = mission.step1Done && mission.step2Done && mission.step3Done;
  const dailyDone = todayDone >= plan.totalTarget;

  return {
    d,
    total,
    done,
    examDate,
    plan,
    todayDone,
    todayAcc,
    mission,
    weak,
    dueReview,
    examDone,
    diagDone,
    diagRunning,
    missionDone,
    dailyDone
  };
}

function pickSmartGuideNextAction(st) {
  if (!st.diagDone) {
    if (st.diagRunning) {
      return {
        key: 'diagnosis_continue',
        cta: '继续诊断',
        title: `继续 AI 诊断（${st.d.cursor || 0}/${st.d.queue?.length || DIAG_TOTAL}）`,
        hint: '先完成基础诊断，后续推荐会更准确。'
      };
    }
    return {
      key: 'diagnosis_start',
      cta: '开始诊断',
      title: '启动 AI 诊断（100题）',
      hint: '系统先校准你的薄弱点和提分优先级。'
    };
  }

  if (!st.mission.step1Done) {
    return {
      key: 'weak',
      cta: '开始弱项专项',
      title: `弱项专项20题：${st.mission.weakName}`,
      hint: `当前进度 ${Math.min(st.mission.weakDone, 20)}/20，先补最短板。`,
      kid: st.mission.weakKid
    };
  }

  if (!st.mission.step2Done) {
    return {
      key: 'review',
      cta: '开始到期复习',
      title: '到期复习清理',
      hint: `当前到期 ${st.dueReview} 题，优先防遗忘回退。`
    };
  }

  if (!st.mission.step3Done) {
    return {
      key: 'exam_quick',
      cta: '开始快速模考',
      title: '20分钟快速模考',
      hint: '完成今日校准，检查临场稳定性。'
    };
  }

  if (!st.dailyDone) {
    if (st.dueReview > 0) {
      return {
        key: 'review',
        cta: '继续复习',
        title: `继续复习：还剩到期 ${st.dueReview} 题`,
        hint: `今日目标 ${st.todayDone}/${st.plan.totalTarget}，先做复习更稳。`
      };
    }
    return {
      key: 'practice_smart',
      cta: '继续智能练题',
      title: 'AI 加速练题',
      hint: `今日目标 ${st.todayDone}/${st.plan.totalTarget}，继续推进即可达成。`
    };
  }

  return {
    key: 'practice_smart',
    cta: '继续巩固',
    title: '今日目标已达成，进入巩固模式',
    hint: '系统将持续安排高频短板与遗忘风险题。'
  };
}

function runSmartGuideAction(action, extra = {}) {
  if (action === 'diagnosis_start') {
    showPage('diagnosis', '智能诊断');
    startDiagnosis(true);
    return;
  }
  if (action === 'diagnosis_continue') {
    showPage('diagnosis', '智能诊断');
    startDiagnosis(false);
    return;
  }
  if (action === 'weak') {
    const kid = extra.kid || getTodayMissionState().weakKid;
    startKnowledgePractice(kid, 20);
    return;
  }
  if (action === 'review') {
    startReviewPractice();
    return;
  }
  if (action === 'exam_quick') {
    startMockExam('quick');
    return;
  }
  startSmartPractice();
}

function renderSmartGuideFlow() {
  const nextCard = qs('#smart-guide-next-card');
  const overviewCard = qs('#smart-guide-overview-card');
  const goals = qs('#smart-guide-goals');
  const nextBtn = qs('#smart-guide-next-btn');
  const exitBtn = qs('#smart-guide-exit-btn');
  if (!nextCard || !overviewCard || !goals || !nextBtn || !exitBtn) return;

  const st = getSmartGuideState();
  const next = pickSmartGuideNextAction(st);
  const progressPct = st.plan.totalTarget
    ? Math.min(100, Math.round((st.todayDone / st.plan.totalTarget) * 100))
    : 0;
  const goalRows = [
    {
      title: '完成 AI 诊断',
      hint: st.diagDone ? '已完成' : (st.diagRunning ? `进行中 ${st.d.cursor || 0}/${st.d.queue?.length || DIAG_TOTAL}` : '未开始'),
      done: st.diagDone
    },
    {
      title: '完成今日三步任务',
      hint: st.missionDone
        ? '已完成（弱项专项 + 复习 + 快速模考）'
        : `当前：${st.mission.step1Done ? '1' : '0'}/${st.mission.step2Done ? '1' : '0'}/${st.mission.step3Done ? '1' : '0'}`,
      done: st.missionDone
    },
    {
      title: '达成今日目标',
      hint: `${st.todayDone}/${st.plan.totalTarget} 题 · 正确率 ${st.todayAcc}%`,
      done: st.dailyDone
    }
  ];

  nextCard.innerHTML = `
    <h4 class="font-bold mb-2">系统下一步</h4>
    <p class="text-xl font-bold">${next.title}</p>
    <p class="text-sm text-neutral mt-2">${next.hint}</p>
    <div class="mt-4">
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>
      <p class="text-xs text-neutral mt-2">今日完成进度：${st.todayDone}/${st.plan.totalTarget}（${progressPct}%）</p>
    </div>
  `;

  overviewCard.innerHTML = `
    <h4 class="font-bold mb-3">今日概览</h4>
    <div class="space-y-3">
      <div class="border border-gray-200 rounded-lg p-3">
        <p class="text-xs text-neutral">考试日期</p>
        <p class="font-medium mt-1">${st.examDate || '未设置'}</p>
      </div>
      <div class="border border-gray-200 rounded-lg p-3">
        <p class="text-xs text-neutral">阶段策略</p>
        <p class="font-medium mt-1">${st.plan.stageLabel}</p>
      </div>
      <div class="border border-gray-200 rounded-lg p-3">
        <p class="text-xs text-neutral">到期复习</p>
        <p class="font-medium mt-1">${st.dueReview} 题</p>
      </div>
    </div>
  `;

  goals.innerHTML = goalRows.map(g => `
    <div class="flex items-center justify-between border ${g.done ? 'border-success/40 bg-success/5' : 'border-gray-200'} rounded-lg p-3">
      <div>
        <p class="font-medium">${g.title}</p>
        <p class="text-sm text-neutral mt-1">${g.hint}</p>
      </div>
      <span class="badge ${g.done ? 'badge-success' : ''}">${g.done ? '已完成' : '进行中'}</span>
    </div>
  `).join('');

  nextBtn.textContent = next.cta;
  nextBtn.onclick = () => runSmartGuideAction(next.key, { kid: next.kid || '' });
  exitBtn.onclick = () => {
    setPureSmartMode(false);
    showPage('home', '首页');
    renderStats();
    renderPlanSummary();
  };
}

function getCrashWeakKnowledge(limit = 3) {
  const km = getKnowledgeMastery();
  const list = Object.keys(KNOWLEDGE_DICT).map(kid => {
    const rec = km[kid] || {};
    const attempts = Number(rec.attempts || 0);
    const mastery = typeof rec.mastery === 'number' ? rec.mastery : 0.5;
    return { kid, attempts, mastery };
  });

  list.sort((a, b) => {
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    return a.attempts - b.attempts;
  });
  return list.slice(0, limit);
}

function getCrashStage(examDate) {
  if (!examDate) return { key: 'unset', label: '未设置考试日期', tip: '建议先在首页设置考试日期，系统会自动按倒计时安排冲刺任务。' };
  const daysLeft = getDaysLeft(examDate);
  if (daysLeft <= 1) return { key: 'd1', label: '考前1天强化', tip: '减少新题，优先错题与快速模考，稳定到 90+。' };
  if (daysLeft <= 3) return { key: 'd3', label: '考前3天冲刺', tip: '高频薄弱专项 + 到期复习 + 每日1次模拟考试。' };
  if (daysLeft <= 7) return { key: 'd7', label: '考前7天提分', tip: '平衡新题与复习，先补最薄弱的2个知识点。' };
  return { key: 'normal', label: '常规备考期', tip: '距离考试较远，建议按今日计划稳步推进。' };
}

function runCrashAction(action, extra = {}) {
  if (action === 'wrong') {
    if (!(getWrongList() || []).length) {
      alert('当前没有错题，已为你切换到智能加速练习。');
      startSmartPractice();
      return;
    }
    startWrongPractice();
    return;
  }
  if (action === 'review') {
    startReviewPractice();
    return;
  }
  if (action === 'weak') {
    const kid = extra.kid || getCrashWeakKnowledge(1)[0]?.kid;
    if (!kid) {
      alert('暂无可用弱项数据，已为你切换到智能加速练习。');
      startSmartPractice();
      return;
    }
    startKnowledgePractice(kid, 20);
    return;
  }
  if (action === 'exam-weak') {
    const kid = extra.kid || getCrashWeakKnowledge(1)[0]?.kid || '';
    if (!kid) {
      alert('暂无可用弱项数据，已为你切换到标准100题模拟考试。');
      startMockExam('standard');
      return;
    }
    startMockExam('standard', { knowledgeId: kid });
    return;
  }
  if (action === 'exam-standard') {
    startMockExam('standard');
    return;
  }
  if (action === 'exam-quick') {
    startMockExam('quick');
    return;
  }
  startSmartPractice();
}

function renderCrashCourse() {
  const box = qs('#crash-course-box');
  if (!box) return;

  const examDate = getExamDate();
  const daysLeft = getDaysLeft(examDate);
  const stage = getCrashStage(examDate);
  const wrongCount = (getWrongList() || []).length;
  const dueReview = getDueReviewCount();
  const recent = getRecentAccuracy(3);
  const weak = getCrashWeakKnowledge(3);
  const weakCountMap = {};
  weak.forEach(x => {
    weakCountMap[x.kid] = QUESTIONS.filter(q => (q.knowledgeId || 'law.basic') === x.kid).length;
  });
  const topWeak = weak[0];
  const weakName = topWeak ? (KNOWLEDGE_DICT[topWeak.kid] || topWeak.kid) : '暂无';
  const topWeakCount = topWeak ? Number(weakCountMap[topWeak.kid] || 0) : 0;
  const latestExam = getExamHistory()
    .slice()
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))[0];
  const latestScoreText = latestExam ? `${latestExam.score}分（${latestExam.examType === 'quick' ? '快速测试' : '标准考试'}）` : '暂无';

  const tasks = [
    {
      title: '错题速刷',
      hint: `当前错题 ${wrongCount} 题，建议用100题模拟考试检验冲刺效果`,
      action: 'exam-standard',
      cta: '开始100题模拟考试'
    },
    {
      title: '到期复习',
      hint: `当前到期复习 ${dueReview} 题，建议先做一套100题模拟考试`,
      action: 'exam-standard',
      cta: '开始100题模拟考试'
    },
    {
      title: '弱项专项',
      hint: `当前最弱：${weakName}（可出题 ${topWeakCount} 道，最多100道）`,
      action: 'exam-weak',
      cta: topWeakCount ? `开始专项模拟（${Math.min(100, topWeakCount)}题）` : '开始100题模拟考试',
      kid: topWeak?.kid || ''
    },
    {
      title: '模拟实战',
      hint: `最近一次成绩：${latestScoreText}`,
      action: 'exam-standard',
      cta: '开始100题模拟考试'
    }
  ];

  box.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="card">
        <p class="text-neutral">冲刺阶段</p>
        <p class="text-xl font-bold mt-1">${stage.label}</p>
        <p class="text-sm text-neutral mt-1">${stage.tip}</p>
      </div>
      <div class="card">
        <p class="text-neutral">考试倒计时</p>
        <p class="text-2xl font-bold mt-1">${examDate ? `${daysLeft}天` : '未设置'}</p>
        <p class="text-sm text-neutral mt-1">考试日期：${examDate || '请先在首页预约考试'}</p>
      </div>
      <div class="card">
        <p class="text-neutral">近3天正确率</p>
        <p class="text-2xl font-bold mt-1">${recent.acc}%</p>
        <p class="text-sm text-neutral mt-1">共练习 ${recent.done} 题</p>
      </div>
      <div class="card">
        <p class="text-neutral">冲刺重点</p>
        <p class="text-2xl font-bold mt-1">${weakName}</p>
        <p class="text-sm text-neutral mt-1">错题 ${wrongCount} · 到期复习 ${dueReview}</p>
      </div>
    </div>

    <div class="card mt-4">
      <h4 class="font-bold mb-3">今日冲刺任务（按优先级）</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${tasks.map((t, i) => `
          <div class="border border-gray-200 rounded-lg p-4">
            <p class="text-sm text-neutral">任务 ${i + 1}</p>
            <h5 class="font-bold mt-1">${t.title}</h5>
            <p class="text-sm text-neutral mt-2">${t.hint}</p>
            <button
              class="btn btn-primary mt-3 w-full"
              data-crash-action="${t.action}"
              ${t.kid ? `data-crash-kid="${t.kid}"` : ''}
            >${t.cta}</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card mt-4">
      <h4 class="font-bold mb-3">薄弱知识点（优先修复）</h4>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${weak.map(x => `
          <div class="border border-gray-200 rounded-lg p-4">
            <p class="font-medium">${KNOWLEDGE_DICT[x.kid] || x.kid}</p>
            <p class="text-sm text-neutral mt-1">掌握度：${Math.round(x.mastery * 100)}% · 作答：${x.attempts} 题 · 可出题 ${Math.min(100, Number(weakCountMap[x.kid] || 0))} 题</p>
            <button class="btn btn-outline w-full mt-3" data-crash-action="exam-weak" data-crash-kid="${x.kid}">开始专项模拟考试</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  qsa('[data-crash-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-crash-action') || '';
      const kid = btn.getAttribute('data-crash-kid') || '';
      runCrashAction(action, { kid });
    });
  });
}

function getDailySeries(lastDays = 7) {
  const daily = getDaily();
  const byDate = daily.byDate || {};
  const t = todayStr();
  const arr = [];
  for (let i = lastDays - 1; i >= 0; i -= 1) {
    const d = addDays(t, -i);
    const rec = byDate[d] || { done: 0, correct: 0 };
    const done = Number(rec.done || 0);
    const correct = Number(rec.correct || 0);
    arr.push({
      date: d,
      done,
      correct,
      acc: done ? Math.round((correct / done) * 100) : 0
    });
  }
  return arr;
}

function getLearningStreak() {
  const daily = getDaily();
  const byDate = daily.byDate || {};
  let streak = 0;
  const t = todayStr();
  for (let i = 0; i < 365; i += 1) {
    const d = addDays(t, -i);
    if (Number(byDate[d]?.done || 0) > 0) streak += 1;
    else break;
  }
  return streak;
}

function formatHourSlot(h) {
  const n = Number(h);
  if (!Number.isFinite(n) || n < 0 || n > 23) return '未识别';
  const hh = String(n).padStart(2, '0');
  const next = String((n + 1) % 24).padStart(2, '0');
  return `${hh}:00-${next}:00`;
}

function getTopStudyHours(byHour, topN = 2) {
  return Object.entries(byHour || {})
    .map(([h, c]) => ({ h: Number(h), c: Number(c || 0) }))
    .filter(x => Number.isFinite(x.h) && x.h >= 0 && x.h <= 23 && x.c > 0)
    .sort((a, b) => b.c - a.c)
    .slice(0, topN);
}

function getPrimaryWeakByProfile(profile, weakList = []) {
  const list = Object.entries(profile?.byKnowledge || {})
    .map(([kid, v]) => {
      const attempts = Number(v?.attempts || 0);
      const correct = Number(v?.correct || 0);
      const acc = attempts ? (correct / attempts) : 0;
      return { kid, attempts, acc };
    })
    .filter(x => x.attempts >= 3)
    .sort((a, b) => (a.acc - b.acc) || (b.attempts - a.attempts));
  if (list.length) return list[0].kid;
  return weakList[0]?.kid || '';
}

function renderReportPage() {
  const box = qs('#report-box');
  if (!box) return;

  const progress = getProgress();
  const answeredList = Object.values(progress.answered || {});
  const totalDone = Number(progress.doneCount || 0);
  const totalCorrect = answeredList.filter(a => a.correct).length;
  const totalAcc = totalDone ? Math.round((totalCorrect / totalDone) * 100) : 0;
  const streak = getLearningStreak();
  const last7 = getDailySeries(7);
  const last14 = getDailySeries(14);
  const prev7 = last14.slice(0, 7);
  const weekDone = last7.reduce((s, x) => s + x.done, 0);
  const weekCorrect = last7.reduce((s, x) => s + x.correct, 0);
  const weekAcc = weekDone ? Math.round((weekCorrect / weekDone) * 100) : 0;
  const prevWeekDone = prev7.reduce((s, x) => s + x.done, 0);
  const prevWeekCorrect = prev7.reduce((s, x) => s + x.correct, 0);
  const prevWeekAcc = prevWeekDone ? Math.round((prevWeekCorrect / prevWeekDone) * 100) : 0;
  const doneDelta = weekDone - prevWeekDone;
  const accDelta = weekAcc - prevWeekAcc;

  const examList = getExamHistory().slice().sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const recentExams = examList.slice(0, 5);
  const examCount = examList.length;
  const examAvg = examCount ? Math.round(examList.reduce((s, x) => s + Number(x.score || 0), 0) / examCount) : 0;
  const examPassRate = examCount
    ? Math.round((examList.filter(x => Number(x.score || 0) >= PASS_SCORE).length / examCount) * 100)
    : 0;
  const lastExam = examList[0];

  const weak = getCrashWeakKnowledge(5);
  const learnerProfile = getLearnerProfile();
  const wrongReason = getWrongReason();
  const wrongStat = { memory: 0, understand: 0, careless: 0, trap: 0 };
  Object.values(wrongReason || {}).forEach(v => {
    if (Object.prototype.hasOwnProperty.call(wrongStat, v)) wrongStat[v] += 1;
  });
  const reasonTotal = Object.values(wrongStat).reduce((a, b) => a + b, 0);

  const review = getReview();
  const reviewIds = Object.keys(review || {});
  const now = Date.now();
  const dueCount = reviewIds.filter(id => Number(review[id]?.nextTs || 0) <= now).length;
  const scheduledCount = reviewIds.length;
  const reviewHealthyRate = scheduledCount ? Math.round(((scheduledCount - dueCount) / scheduledCount) * 100) : 100;

  const weakActionKid = weak[0]?.kid || '';
  const topReason = Object.entries(wrongStat).sort((a, b) => b[1] - a[1])[0];
  const reasonLabel = {
    memory: '记忆错误',
    understand: '理解错误',
    careless: '粗心错误',
    trap: '陷阱题误判'
  };
  const recent3 = getRecentAccuracy(3);
  const examDate = getExamDate();
  const daysLeft = getDaysLeft(examDate);
  const weakPenalty = weak.slice(0, 3)
    .reduce((s, x) => s + Math.max(0, 60 - Math.round(x.mastery * 100)), 0) / 3;
  const reviewPenalty = Math.min(20, dueCount * 0.6);
  const examSignal = examCount ? examAvg : 70;
  const rawPredict = 0.45 * recent3.acc + 0.40 * examSignal + 0.15 * weekAcc - reviewPenalty - weakPenalty * 0.2 + (streak >= 3 ? 2 : 0);
  const predictScore = Math.round(clamp(rawPredict, 45, 99));
  const passProb = Math.round(clamp((predictScore - 60) * 2.5, 5, 99));
  const riskText = passProb >= 80
    ? '通过概率较高，保持当前节奏并重点防粗心。'
    : passProb >= 60
      ? '通过概率中等，建议增加模考与到期复习。'
      : '通过风险较高，建议先做弱项专项 + 错题冲刺。';
  const deltaText = (n) => (n > 0 ? `+${n}` : `${n}`);

  const profileTotal = Number(learnerProfile.total || 0);
  const profileAcc = profileTotal ? Math.round((Number(learnerProfile.correct || 0) / profileTotal) * 100) : totalAcc;
  const topHours = getTopStudyHours(learnerProfile.byHour || {}, 2);
  const topHoursText = topHours.length ? topHours.map(x => formatHourSlot(x.h)).join(' / ') : '数据不足';
  const profileReason = (Object.entries(learnerProfile.reasonStat || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0]) || topReason || ['memory', 0];
  const profileReasonKey = profileReason?.[0] || 'memory';
  const profileReasonLabel = reasonLabel[profileReasonKey] || '记忆错误';
  const weakKidByProfile = getPrimaryWeakByProfile(learnerProfile, weak);
  const weakNameByProfile = weakKidByProfile ? (KNOWLEDGE_DICT[weakKidByProfile] || weakKidByProfile) : '数据不足';
  const strategyByReason = {
    memory: '建议优先做到期复习 + 间隔重复（1/3/7天）',
    understand: '建议先做弱项专项，再看解析对比题',
    careless: '建议开启关键词审题，提交前二次检查',
    trap: '建议优先高频高难题，强化易混淆选项辨识'
  };
  const coachText = strategyByReason[profileReasonKey] || '建议维持智能加速 + 每日复习闭环';

  box.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="card"><p class="text-neutral">总做题</p><p class="text-2xl font-bold mt-1">${totalDone}</p><p class="text-sm text-neutral mt-1">题库总量 ${QUESTIONS.length}</p></div>
      <div class="card"><p class="text-neutral">累计正确率</p><p class="text-2xl font-bold mt-1">${totalAcc}%</p><p class="text-sm text-neutral mt-1">近7天 ${weekAcc}%</p></div>
      <div class="card"><p class="text-neutral">连续学习</p><p class="text-2xl font-bold mt-1">${streak} 天</p><p class="text-sm text-neutral mt-1">近7天完成 ${weekDone} 题</p></div>
      <div class="card"><p class="text-neutral">模考均分</p><p class="text-2xl font-bold mt-1">${examAvg} 分</p><p class="text-sm text-neutral mt-1">通过率 ${examPassRate}%（共${examCount}次）</p></div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
      <div class="card">
        <p class="text-neutral">本周 vs 上周（题量）</p>
        <p class="text-2xl font-bold mt-1">${weekDone} / ${prevWeekDone}</p>
        <p class="text-sm mt-1 ${doneDelta >= 0 ? 'text-success' : 'text-error'}">变化 ${deltaText(doneDelta)} 题</p>
      </div>
      <div class="card">
        <p class="text-neutral">本周 vs 上周（正确率）</p>
        <p class="text-2xl font-bold mt-1">${weekAcc}% / ${prevWeekAcc}%</p>
        <p class="text-sm mt-1 ${accDelta >= 0 ? 'text-success' : 'text-error'}">变化 ${deltaText(accDelta)}%</p>
      </div>
      <div class="card">
        <p class="text-neutral">考试通过预测</p>
        <p class="text-2xl font-bold mt-1">${passProb}%</p>
        <p class="text-sm text-neutral mt-1">预测分 ${predictScore} · ${examDate ? `距考试 ${daysLeft} 天` : '未设置考试日期'}</p>
      </div>
    </div>

    <div class="card mt-4">
      <h4 class="font-bold mb-3">AI 学习画像</h4>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="border border-gray-200 rounded-lg p-3">
          <p class="text-neutral text-sm">画像正确率</p>
          <p class="text-2xl font-bold mt-1">${profileAcc}%</p>
          <p class="text-xs text-neutral mt-1">样本 ${profileTotal} 题</p>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <p class="text-neutral text-sm">最常错因</p>
          <p class="text-xl font-bold mt-1">${profileReasonLabel}</p>
          <p class="text-xs text-neutral mt-1">建议：${coachText}</p>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <p class="text-neutral text-sm">高效学习时段</p>
          <p class="text-xl font-bold mt-1">${topHoursText}</p>
          <p class="text-xs text-neutral mt-1">基于近期作答分布</p>
        </div>
        <div class="border border-gray-200 rounded-lg p-3">
          <p class="text-neutral text-sm">当前主攻弱项</p>
          <p class="text-xl font-bold mt-1">${weakNameByProfile}</p>
          <button class="btn btn-outline mt-2 w-full" data-report-action="weak" ${weakKidByProfile ? `data-report-kid="${weakKidByProfile}"` : ''}>立即专项20题</button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <div class="card">
        <h4 class="font-bold mb-3">近7天学习趋势</h4>
        <div class="space-y-2">
          ${last7.map(x => `
            <div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-neutral">${x.date.slice(5)} · ${x.done}题</span>
                <span class="font-medium">${x.acc}%</span>
              </div>
              <div class="progress-bar mt-1"><div class="progress-bar-fill" style="width:${x.acc}%"></div></div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <h4 class="font-bold mb-3">最近模考表现</h4>
        ${recentExams.length ? `
          <div class="space-y-2">
            ${recentExams.map(r => `
              <div class="flex items-center justify-between text-sm border border-gray-200 rounded-lg px-3 py-2">
                <span class="text-neutral">${formatDateTime(r.finishedAt)} · ${r.examType === 'quick' ? '快速测试' : '标准考试'}</span>
                <span class="font-medium ${Number(r.score || 0) >= PASS_SCORE ? 'text-success' : 'text-error'}">${r.score}分</span>
              </div>
            `).join('')}
          </div>
        ` : '<p class="text-sm text-neutral">暂无模考记录，建议先完成一次模拟考试。</p>'}
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <div class="card">
        <h4 class="font-bold mb-3">薄弱知识点 Top 5</h4>
        <div class="space-y-2">
          ${weak.map((x, i) => `
            <div class="border border-gray-200 rounded-lg p-3">
              <div class="flex items-center justify-between">
                <p class="font-medium">${i + 1}. ${KNOWLEDGE_DICT[x.kid] || x.kid}</p>
                <span class="text-sm ${Math.round(x.mastery * 100) < 60 ? 'text-error' : 'text-neutral'}">${Math.round(x.mastery * 100)}%</span>
              </div>
              <p class="text-xs text-neutral mt-1">作答 ${x.attempts} 题</p>
              <button class="btn btn-outline mt-2 w-full" data-report-action="weak" data-report-kid="${x.kid}">去专项20题</button>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <h4 class="font-bold mb-3">错因画像 + 复习执行</h4>
        <div class="space-y-2">
          ${Object.entries(wrongStat).map(([k, v]) => `
            <div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-neutral">${reasonLabel[k]}</span>
                <span class="font-medium">${reasonTotal ? Math.round((v / reasonTotal) * 100) : 0}%</span>
              </div>
              <div class="progress-bar mt-1"><div class="progress-bar-fill" style="width:${reasonTotal ? Math.round((v / reasonTotal) * 100) : 0}%"></div></div>
            </div>
          `).join('')}
        </div>
        <div class="mt-4 border-t border-gray-200 pt-3 text-sm">
          <p class="text-neutral">到期复习：<span class="font-medium">${dueCount} 题</span> · 复习健康度：<span class="font-medium">${reviewHealthyRate}%</span></p>
          <p class="text-neutral mt-1">最近模考：<span class="font-medium">${lastExam ? `${lastExam.score}分` : '暂无'}</span></p>
        </div>
      </div>
    </div>

    <div class="card mt-4">
      <h4 class="font-bold mb-3">AI 行动建议（可直接执行）</h4>
      <p class="text-sm text-neutral mb-3">${riskText}</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button class="btn btn-primary" data-report-action="weak" ${weakActionKid ? `data-report-kid="${weakActionKid}"` : ''}>先补最弱知识点</button>
        <button class="btn btn-outline" data-report-action="wrong">错题冲刺</button>
        <button class="btn btn-outline" data-report-action="review">到期复习</button>
        <button class="btn btn-outline" data-report-action="${(lastExam && Number(lastExam.score || 0) < PASS_SCORE) ? 'exam-standard' : 'exam-quick'}">开始模拟测试</button>
        <button class="btn btn-outline" data-report-action="smart">进入智能加速</button>
        <div class="text-sm text-neutral flex items-center">主要风险：${topReason?.[1] ? `${reasonLabel[topReason[0]]}占比高` : '暂无错因数据'}</div>
      </div>
    </div>
  `;

  qsa('[data-report-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-report-action');
      const kid = btn.getAttribute('data-report-kid');
      if (act === 'weak') {
        if (kid) startKnowledgePractice(kid, 20);
        else runCrashAction('weak');
        return;
      }
      if (act === 'wrong') return runCrashAction('wrong');
      if (act === 'review') return runCrashAction('review');
      if (act === 'exam-standard') return startMockExam('standard');
      if (act === 'exam-quick') return startMockExam('quick');
      startSmartPractice();
    });
  });
}

let mockExamTimer = null;
let mockExam = {
  status: 'idle',
  examType: 'standard',
  scopeLabel: '',
  total: 0,
  durationSec: 0,
  queue: [],
  cursor: 0,
  answers: {},
  startedAt: 0,
  finishedAt: 0,
  savedRecord: null
};

function buildMockExamQueue(totalCount) {
  const pool = QUESTIONS.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const queue = pool.slice(0, totalCount).map(q => q.id);
  let k = 0;
  while (queue.length < totalCount && QUESTIONS.length) {
    queue.push(QUESTIONS[k % QUESTIONS.length].id);
    k += 1;
  }
  return queue;
}

function buildMockExamQueueByKnowledge(knowledgeId, totalCount = 100) {
  const kid = String(knowledgeId || '');
  const pool = QUESTIONS.filter(q => (q.knowledgeId || 'law.basic') === kid);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const total = Math.max(0, Math.min(Number(totalCount || 100), pool.length));
  return pool.slice(0, total).map(q => q.id);
}

function stopMockExamTimer() {
  if (mockExamTimer) {
    clearInterval(mockExamTimer);
    mockExamTimer = null;
  }
}

function startMockExam(mode = 'standard', opts = {}) {
  if (!QUESTIONS.length) {
    showQuestionLoadHint();
    return;
  }

  const examType = mode === 'quick' ? 'quick' : 'standard';
  const knowledgeId = String(opts.knowledgeId || '');
  const kName = KNOWLEDGE_DICT[knowledgeId] || knowledgeId;
  const isKnowledgeExam = !!knowledgeId;
  let total = examType === 'quick' ? QUICK_TOTAL : DIAG_TOTAL;
  let durationSec = examType === 'quick' ? QUICK_DURATION_SEC : DIAG_DURATION_SEC;
  let queue = [];
  let scopeLabel = '';

  if (isKnowledgeExam) {
    queue = buildMockExamQueueByKnowledge(knowledgeId, DIAG_TOTAL);
    total = queue.length;
    if (!total) {
      alert('该知识点暂无可用题目，已为你切换到标准100题模拟考试。');
      startMockExam('standard');
      return;
    }
    durationSec = Math.max(10 * 60, Math.round((DIAG_DURATION_SEC * total) / DIAG_TOTAL));
    scopeLabel = `薄弱专项模拟 · ${kName}`;
  } else {
    queue = buildMockExamQueue(total);
  }

  if (mockExam.status === 'running') {
    const ok = confirm('当前有进行中的模拟考试，确认重新开始吗？');
    if (!ok) return;
  }

  stopMockExamTimer();
  mockExam = {
    status: 'running',
    examType,
    scopeLabel,
    total,
    durationSec,
    queue,
    cursor: 0,
    answers: {},
    startedAt: Date.now(),
    finishedAt: 0,
    savedRecord: null
  };

  showPage('exam', '模拟考试');
  renderExamPage();

  mockExamTimer = setInterval(() => {
    if (mockExam.status !== 'running') {
      stopMockExamTimer();
      return;
    }
    const elapsed = Math.floor((Date.now() - (mockExam.startedAt || Date.now())) / 1000);
    const left = Math.max(0, mockExam.durationSec - elapsed);
    const timerEl = qs('#mock-exam-timer');
    if (timerEl) timerEl.textContent = formatDuration(left);
    if (left <= 0) finishMockExam(true);
  }, 1000);
}

function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function getMockExamCurrentQuestion() {
  if (!mockExam.queue.length) return null;
  const qid = mockExam.queue[mockExam.cursor];
  return QUESTIONS.find(q => q.id === qid) || null;
}

function finishMockExam(forceByTimeout = false) {
  if (mockExam.status !== 'running') return;
  mockExam.finishedAt = Date.now();
  mockExam.status = 'done';
  stopMockExamTimer();

  const rec = buildExamResultFromDiagnosis({
    savedExamId: `exam_${Date.now()}`,
    queue: mockExam.queue.slice(),
    answers: { ...mockExam.answers },
    startedAt: mockExam.startedAt,
    finishedAt: mockExam.finishedAt,
    examType: mockExam.examType,
    durationSec: mockExam.durationSec
  });
  saveExamResult(rec);
  mockExam.savedRecord = rec;

  if (forceByTimeout) {
    alert('考试时间已到，系统已自动交卷。');
  }
  renderExamPage();
}

function renderMockExamRuntime() {
  const runtime = qs('#exam-runtime');
  const entry = qs('#exam-entry-grid');
  const history = qs('#exam-history-section');
  if (!runtime || !entry || !history) return;

  if (mockExam.status === 'idle') {
    runtime.classList.add('hidden');
    entry.classList.remove('hidden');
    history.classList.remove('hidden');
    runtime.innerHTML = '';
    return;
  }

  runtime.classList.remove('hidden');
  entry.classList.add('hidden');
  history.classList.add('hidden');

  if (mockExam.status === 'done' && mockExam.savedRecord) {
    const r = mockExam.savedRecord;
    const pass = Number(r.score || 0) >= PASS_SCORE;
    runtime.innerHTML = `
      <div class="card">
        <h4 class="text-lg font-bold">考试完成</h4>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          <div class="card"><p class="text-neutral">类型</p><p class="text-xl font-bold mt-1">${mockExam.scopeLabel || (r.examType === 'quick' ? '快速测试' : '标准考试')}</p></div>
          <div class="card"><p class="text-neutral">得分</p><p class="text-2xl font-bold mt-1">${r.score}分</p></div>
          <div class="card"><p class="text-neutral">答对/总题</p><p class="text-2xl font-bold mt-1">${r.correct}/${r.total}</p></div>
          <div class="card"><p class="text-neutral">结果</p><p class="text-2xl font-bold mt-1 ${pass ? 'text-success' : 'text-error'}">${pass ? '通过' : '未通过'}</p></div>
        </div>
        <div class="flex flex-wrap gap-2 mt-4">
          <button class="btn btn-primary" id="mock-exam-view-detail">查看错题解析</button>
          <button class="btn btn-outline" id="mock-exam-back-list">返回考试首页</button>
        </div>
      </div>
    `;

    qs('#mock-exam-view-detail')?.addEventListener('click', () => renderExamDetail(r));
    qs('#mock-exam-back-list')?.addEventListener('click', () => {
      mockExam = {
        status: 'idle',
        examType: 'standard',
        scopeLabel: '',
        total: 0,
        durationSec: 0,
        queue: [],
        cursor: 0,
        answers: {},
        startedAt: 0,
        finishedAt: 0,
        savedRecord: null
      };
      renderExamPage();
    });
    return;
  }

  const q = getMockExamCurrentQuestion();
  if (!q) {
    runtime.innerHTML = '<div class="card"><p class="text-error">考试题目加载失败，请重新开始考试。</p></div>';
    return;
  }
  const qid = mockExam.queue[mockExam.cursor];
  const ans = mockExam.answers[qid] || {};
  const selected = Array.isArray(ans.selected) ? ans.selected.slice() : (typeof ans.selected === 'number' ? [ans.selected] : []);
  const selectedSet = new Set(selected);
  const isSubmitted = typeof ans.correct === 'boolean';
  const correctSet = new Set(getAnswerIndexes(q.answer));
  const elapsed = Math.floor((Date.now() - (mockExam.startedAt || Date.now())) / 1000);
  const left = Math.max(0, mockExam.durationSec - elapsed);
  const answeredCount = Object.keys(mockExam.answers).filter(id => typeof mockExam.answers[id]?.correct === 'boolean').length;
  const draftCount = Object.keys(mockExam.answers).filter(id => {
    const a = mockExam.answers[id];
    const picked = getAnswerIndexes(a?.selected);
    return picked.length > 0 && typeof a?.correct !== 'boolean';
  }).length;
  const unansweredCount = Math.max(0, mockExam.total - answeredCount);
  const progressPct = mockExam.total ? Math.round(((mockExam.cursor + 1) / mockExam.total) * 100) : 0;
  const typeText = questionTypeText(q.type, true);

  runtime.innerHTML = `
    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h4 class="text-lg font-bold">${mockExam.scopeLabel || (mockExam.examType === 'quick' ? '快速测试' : '标准考试')}</h4>
          <p class="text-sm text-neutral mt-1">${typeText} · 题目 ${mockExam.cursor + 1}/${mockExam.total} · 已作答 ${answeredCount} 题 · 未作答 ${unansweredCount} 题${draftCount ? ` · 待提交 ${draftCount} 题` : ''}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium">剩余时间 <span id="mock-exam-timer">${formatDuration(left)}</span></span>
          <button class="btn btn-outline" id="mock-exam-submit-paper">交卷</button>
        </div>
      </div>
      <div class="mt-4 progress-bar"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>
      <div class="mt-6">
        <p class="text-lg font-medium">${q.stem}</p>
      </div>
      <div class="mt-4 ${q.imgUrl ? 'grid grid-cols-1 lg:grid-cols-5 gap-4 items-start' : ''}">
        <div class="${q.imgUrl ? 'lg:col-span-3' : ''}">
          <div class="space-y-3" id="mock-exam-options"></div>
        </div>
        ${q.imgUrl ? `<div class="lg:col-span-2">${renderQuestionMediaHtml(q, '', 'side')}</div>` : ''}
      </div>
      <div class="mt-4 hidden" id="mock-exam-analysis">
        <div class="p-4 rounded-lg border border-gray-200 bg-gray-50">
          <div id="mock-exam-result" class="mb-2"></div>
          <p class="text-sm"><strong>解析：</strong>${q.analysis || '暂无解析'}</p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap justify-between gap-2">
        <button class="btn btn-secondary" id="mock-exam-prev" ${mockExam.cursor === 0 ? 'disabled' : ''}>上一题</button>
        <div class="flex gap-2">
          <button class="btn btn-primary" id="mock-exam-submit-answer" ${isSubmitted ? 'disabled' : ''}>提交答案</button>
          <button class="btn btn-secondary" id="mock-exam-next">${mockExam.cursor >= mockExam.total - 1 ? '最后一题' : '下一题'}</button>
        </div>
      </div>
      <div class="mt-5 border-t border-gray-200 pt-4">
        <div class="flex flex-wrap items-center gap-2 mb-3 text-xs text-neutral">
          <span class="badge">答题卡</span>
          <span class="badge badge-success">已答对</span>
          <span class="badge badge-error">已答错</span>
          <span class="badge badge-warning">待提交</span>
          <span class="badge">未作答</span>
        </div>
        <div class="grid grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2" id="mock-exam-card"></div>
      </div>
    </div>
  `;

  const optWrap = qs('#mock-exam-options');
  q.options.forEach((text, oi) => {
    const item = document.createElement('div');
    item.className = 'question-option';
    if (isSubmitted) {
      if (correctSet.has(oi)) item.classList.add('correct');
      if (selectedSet.has(oi) && !correctSet.has(oi)) item.classList.add('incorrect');
    } else if (selectedSet.has(oi)) {
      item.classList.add('selected');
    }
    item.innerHTML = `<div class="option-indicator">${renderOptionKey(oi)}</div><div>${text}</div>`;
    item.addEventListener('click', () => {
      if (isSubmitted) return;
      const cur = new Set(selected);
      if (q.type === 'multi') {
        if (cur.has(oi)) cur.delete(oi);
        else cur.add(oi);
        mockExam.answers[qid] = { selected: Array.from(cur).sort((a, b) => a - b) };
      } else {
        mockExam.answers[qid] = { selected: oi };
      }
      renderMockExamRuntime();
    });
    optWrap.appendChild(item);
  });

  if (isSubmitted) {
    const analysis = qs('#mock-exam-analysis');
    const result = qs('#mock-exam-result');
    if (analysis) analysis.classList.remove('hidden');
    if (result) result.innerHTML = ans.correct
      ? '<span class="badge badge-success">回答正确</span>'
      : `<span class="badge badge-error">回答错误</span> 正确答案：${getAnswerIndexes(q.answer).map(i => renderOptionLabel(q, i)).join('、')}`;
  }

  qs('#mock-exam-prev')?.addEventListener('click', () => {
    if (mockExam.cursor > 0) mockExam.cursor -= 1;
    renderMockExamRuntime();
  });
  qs('#mock-exam-next')?.addEventListener('click', () => {
    if (mockExam.cursor < mockExam.total - 1) {
      mockExam.cursor += 1;
      renderMockExamRuntime();
    }
  });
  qs('#mock-exam-submit-paper')?.addEventListener('click', () => {
    if (confirm('确认现在交卷吗？')) finishMockExam(false);
  });
  qs('#mock-exam-submit-answer')?.addEventListener('click', () => {
    if (isSubmitted) return;
    const picked = getAnswerIndexes(mockExam.answers[qid]?.selected);
    if (!picked.length) {
      alert('请先选择答案');
      return;
    }
    const correct = isSameAnswerSet(picked, q.answer);
    mockExam.answers[qid] = { selected: q.type === 'multi' ? picked : picked[0], correct, ts: Date.now() };
    if (!correct) addWrong(qid);
    renderMockExamRuntime();
  });

  const cardWrap = qs('#mock-exam-card');
  if (cardWrap) {
    cardWrap.innerHTML = mockExam.queue.map((id, i) => {
      const a = mockExam.answers[id] || {};
      const isCurrent = i === mockExam.cursor;
      const isDone = typeof a.correct === 'boolean';
      const hasDraft = !isDone && getAnswerIndexes(a.selected).length > 0;
      const cls = isCurrent
        ? 'border-primary bg-primary/10 text-primary'
        : isDone
          ? (a.correct ? 'border-success bg-success/10 text-success' : 'border-error bg-error/10 text-error')
          : hasDraft
            ? 'border-warning bg-warning/10 text-warning'
            : 'border-gray-200 bg-white text-neutral';
      return `<button class="h-9 rounded border text-sm font-medium ${cls}" data-exam-jump="${i}">${i + 1}</button>`;
    }).join('');

    qsa('[data-exam-jump]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-exam-jump'));
        if (!Number.isFinite(idx)) return;
        mockExam.cursor = Math.max(0, Math.min(mockExam.total - 1, idx));
        renderMockExamRuntime();
      });
    });
  }
}

// ======================
// 智能诊断（50题）
// ======================
const DIAG_TOTAL = 100;
const DIAG_DURATION_SEC = 45 * 60;
const QUICK_TOTAL = 50;
const QUICK_DURATION_SEC = 20 * 60;
const PASS_SCORE = 90;

function buildDiagnosisQueue(totalCount = DIAG_TOTAL) {
  // 半自适应：先覆盖知识点，再偏薄弱高频（不足则循环补齐）
  const km = getKnowledgeMastery();
  const review = getReview();
  const profile = getLearnerProfile();
  const examDate = getExamDate();
  const now = Date.now();
  const progress = getProgress();
  const scoreContext = { km, progress, review, profile, now, examDate };

  // 1) 覆盖：每个知识点尽量选1题（共12题，若题库不足则跳过）
  const byK = {};
  for (const q of QUESTIONS) {
    const kid = q.knowledgeId || 'law.basic';
    (byK[kid] ||= []).push(q);
  }

  const cover = [];
  for (const kid of Object.keys(KNOWLEDGE_DICT)) {
    const arr = byK[kid] || [];
    if (!arr.length) continue;
    // 优先未做过的
    const pick = arr.find(q => !progress.answered?.[q.id]) || arr[0];
    cover.push(pick);
  }

  // 2) 剩余：按智能得分排序，避免重复，填满50
  const chosen = new Set(cover.map(q => q.id));
  const rest = QUESTIONS
    .filter(q => !chosen.has(q.id))
    .map(q => ({ q, s: smartScoreQuestion(q, scoreContext).total }))
    .sort((a, b) => Number(b.s || 0) - Number(a.s || 0))
    .map(x => x.q);

  const queue = [...cover, ...rest].slice(0, totalCount).map(q => q.id);

  // 若题库不足 totalCount，允许重复（循环补齐）
  let i = 0;
  const fallback = rest.length ? rest : QUESTIONS;
  while (queue.length < totalCount && fallback.length) {
    queue.push(fallback[i % fallback.length].id);
    i += 1;
    if (i > 10000) break;
  }

  return queue;
}

let diagTimer = null;

function startDiagnosis(reset = false, examOpts = {}) {
  if (!QUESTIONS.length) {
    showQuestionLoadHint();
    return;
  }
  if (reset) clearDiagnosis();
  let d = getDiagnosis();
  const totalCount = Number(examOpts.total || d.total || DIAG_TOTAL);
  const durationSec = Number(examOpts.durationSec || d.durationSec || DIAG_DURATION_SEC);
  const examType = examOpts.examType || d.examType || 'standard';

  if (!d.queue?.length) {
    const queue = buildDiagnosisQueue(totalCount);
    d = {
      status: 'running',
      queue,
      cursor: 0,
      answers: {},
      startedAt: Date.now(),
      finishedAt: 0,
      durationSec,
      total: totalCount,
      examType,
      savedExamId: ''
    };
  } else {
    d.status = 'running';
    d.durationSec = durationSec;
    d.total = totalCount;
    d.examType = examType;
  }

  setDiagnosis(d);
  renderDiagnosisQuiz();
}

function buildExamResultFromDiagnosis(d) {
  const queue = d.queue || [];
  const answers = d.answers || {};
  const qMap = new Map(QUESTIONS.map(q => [q.id, q]));

  let correct = 0;
  const wrongIds = new Set();
  const byKnowledge = {};

  for (const qid of queue) {
    const q = qMap.get(qid);
    const ans = answers[qid];
    const isCorrect = !!ans?.correct;
    if (isCorrect) correct += 1;
    else wrongIds.add(qid);

    const kid = q?.knowledgeId || 'law.basic';
    byKnowledge[kid] = byKnowledge[kid] || { total: 0, correct: 0 };
    byKnowledge[kid].total += 1;
    if (isCorrect) byKnowledge[kid].correct += 1;
  }

  const total = queue.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const wrongReason = getWrongReason();
  const wrongReasonStat = { memory: 0, understand: 0, careless: 0, trap: 0 };
  Array.from(wrongIds).forEach(id => {
    const r = wrongReason[id];
    if (Object.prototype.hasOwnProperty.call(wrongReasonStat, r)) wrongReasonStat[r] += 1;
  });

  return {
    id: d.savedExamId || `exam_${Date.now()}`,
    startedAt: d.startedAt || 0,
    finishedAt: d.finishedAt || Date.now(),
    durationSec: d.startedAt ? Math.max(0, Math.round(((d.finishedAt || Date.now()) - d.startedAt) / 1000)) : (d.durationSec || 0),
    examType: d.examType || 'standard',
    total,
    correct,
    score,
    wrongIds: Array.from(wrongIds),
    byKnowledge,
    wrongReasonStat,
    queue: queue.slice(),
    answers
  };
}

function finishDiagnosis() {
  const d = getDiagnosis();
  if (d.savedExamId && d.status === 'done') {
    renderDiagnosisReport();
    renderGlobalCTA();
    renderExamPage();
    return;
  }
  d.status = 'done';
  d.finishedAt = d.finishedAt || Date.now();
  const result = buildExamResultFromDiagnosis(d);
  saveExamResult(result);
  d.savedExamId = result.id;
  setDiagnosis(d);
  renderDiagnosisReport();
  renderGlobalCTA();
  renderExamPage();
}

function diagnosisCurrentQuestion() {
  const d = getDiagnosis();
  const id = d.queue?.[d.cursor];
  return QUESTIONS.find(q => q.id === id);
}

function renderDiagnosisHome() {
  if (!QUESTIONS.length) {
    showQuestionLoadHint();
    return;
  }
  const d = getDiagnosis();
  const box = qs('#diagnosis-box');
  if (!box) return;

  const total = (d.queue && d.queue.length) ? d.queue.length : (d.total || DIAG_TOTAL);
  const cur = d.cursor || 0;
  const examType = d.examType === 'quick' ? '快速测试' : '标准考试';

  let statusText = '未开始';
  if (d.status === 'running') statusText = `进行中：${cur}/${total}`;
  if (d.status === 'done') statusText = '已完成';

  const examDate = getExamDate();
  const currentOpts = {
    examType: d.examType || 'standard',
    total: d.total || (d.examType === 'quick' ? QUICK_TOTAL : DIAG_TOTAL),
    durationSec: d.durationSec || (d.examType === 'quick' ? QUICK_DURATION_SEC : DIAG_DURATION_SEC)
  };

  box.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h4 class="text-lg font-bold">${total}题智能诊断（${examType}）</h4>
        <p class="text-neutral mt-1">状态：<span class="font-medium">${statusText}</span> · 考试日期：<span class="font-medium">${examDate || '未设置'}</span></p>
        <p class="text-sm text-neutral mt-2">说明：当前为 Mock 题库，若题量不足会循环补齐到${total}题用于流程演示。完成后将输出薄弱知识点TOP、提分清单，并可一键进入智能加速练习。</p>
      </div>
      <div class="flex gap-2">
        ${d.status === 'running' ? '<button class="btn btn-primary" id="btn-diag-continue">继续诊断</button>' : '<button class="btn btn-primary" id="btn-diag-start">开始诊断</button>'}
        ${d.status !== 'idle' ? '<button class="btn btn-outline" id="btn-diag-reset">重新开始</button>' : ''}
        ${d.status === 'done' ? '<button class="btn btn-secondary" id="btn-diag-report">查看报告</button>' : ''}
      </div>
    </div>
  `;

  qs('#btn-diag-start')?.addEventListener('click', () => { startDiagnosis(true, currentOpts); renderGlobalCTA(); });
  qs('#btn-diag-continue')?.addEventListener('click', () => { startDiagnosis(false, currentOpts); renderGlobalCTA(); });
  qs('#btn-diag-reset')?.addEventListener('click', () => { startDiagnosis(true, currentOpts); renderGlobalCTA(); });
  qs('#btn-diag-report')?.addEventListener('click', () => { renderDiagnosisReport(); renderGlobalCTA(); });
}

function renderDiagnosisQuiz() {
  showPage('diagnosis', '智能诊断');

  const d = getDiagnosis();
  const q = diagnosisCurrentQuestion();
  const area = qs('#diagnosis-quiz');
  const report = qs('#diagnosis-report');
  const box = qs('#diagnosis-box');

  if (report) report.classList.add('hidden');
  if (area) area.classList.remove('hidden');

  const total = d.queue.length || DIAG_TOTAL;
  const idx = (d.cursor || 0) + 1;

  if (!q) {
    finishDiagnosis();
    return;
  }

  const kName = KNOWLEDGE_DICT[q.knowledgeId] || '未标注知识点';

  const settings = getSettings();

  area.innerHTML = `
    <div class="card mb-6">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h4 class="text-lg font-bold">诊断中（${idx}/${total}）</h4>
          <p class="text-sm text-neutral mt-1">当前知识点：<span class="font-medium">${kName}</span> · 题目ID：${q.id}</p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <label class="flex items-center gap-2 text-sm text-neutral bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <input type="checkbox" id="diag-show-analysis" ${settings.diagnosisShowAnalysis ? 'checked' : ''} />
            <span>显示解析</span>
          </label>
          <label class="flex items-center gap-2 text-sm text-neutral bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <input type="checkbox" id="diag-auto-next" ${isAnswerAutoNextEnabled(settings) ? 'checked' : ''} />
            <span>选完自动下一题</span>
          </label>
          <div class="px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium" id="diag-timer">倒计时：--:--</div>
          <button class="btn btn-secondary" id="btn-diag-exit">退出（可继续）</button>
        </div>
      </div>
      <div class="mt-4">
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.round((idx/total)*100)}%"></div></div>
      </div>

      <div class="mt-6">
        <p class="text-lg font-medium">${q.stem}</p>
      </div>
      <div class="mt-4 ${q.imgUrl ? 'grid grid-cols-1 lg:grid-cols-5 gap-4 items-start' : ''}">
        <div class="${q.imgUrl ? 'lg:col-span-3' : ''}">
          <div class="space-y-3" id="diag-options"></div>
        </div>
        ${q.imgUrl ? `<div class="lg:col-span-2">${renderQuestionMediaHtml(q, '', 'side')}</div>` : ''}
      </div>
      <div class="mt-3 hidden" id="diag-submit-wrap">
        <div class="flex items-center justify-between">
          <p class="text-sm text-neutral" id="diag-submit-tip"></p>
          <button class="btn btn-primary" id="btn-diag-submit">提交答案</button>
        </div>
      </div>

      <div class="mt-4 hidden" id="diag-analysis">
        <div class="p-4 rounded-lg border border-gray-200 bg-gray-50">
          <div class="mb-2" id="diag-result"></div>
          <p class="text-sm"><strong>解析：</strong><span id="diag-analysis-text"></span></p>
          <div class="flex justify-start mt-4">
            <button class="btn btn-primary" id="btn-diag-next">下一题</button>
          </div>
        </div>
      </div>

      <div class="mt-4 hidden" id="diag-next-only">
        <div class="flex justify-start">
          <button class="btn btn-primary" id="btn-diag-next2">下一题</button>
        </div>
      </div>
    </div>
  `;

  function formatSec(sec) {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function tick() {
    const d2 = getDiagnosis();
    if (d2.status !== 'running') return;
    const elapsed = Math.floor((Date.now() - (d2.startedAt || Date.now())) / 1000);
    const left = (d2.durationSec || DIAG_DURATION_SEC) - elapsed;
    const el = qs('#diag-timer');
    if (el) el.textContent = `倒计时：${formatSec(left)}`;
    if (left <= 0) {
      // 时间到：直接生成报告
      finishDiagnosis();
      return;
    }
  }

  if (diagTimer) clearInterval(diagTimer);
  tick();
  diagTimer = setInterval(tick, 1000);

  // 设置开关
  qs('#diag-show-analysis')?.addEventListener('change', (e) => {
    const s = getSettings();
    s.diagnosisShowAnalysis = !!e.target.checked;
    setSettings(s);
  });
  qs('#diag-auto-next')?.addEventListener('change', (e) => {
    setAnswerAutoNext(!!e.target.checked);
  });

  qs('#btn-diag-exit')?.addEventListener('click', () => {
    // 回到诊断首页状态（保留进度）
    if (diagTimer) clearInterval(diagTimer);
    area.classList.add('hidden');
    renderDiagnosisHome();
  });

  const answered = d.answers?.[q.id];
  const isMulti = q.type === 'multi';
  const correctIndexes = getAnswerIndexes(q.answer);
  const correctSet = new Set(correctIndexes);
  const locked = (typeof answered?.selected === 'number') || Array.isArray(answered?.selected);
  if (isMulti && !Array.isArray(diagnosisDraftAnswers[q.id])) diagnosisDraftAnswers[q.id] = [];
  const selectedIndexes = locked
    ? getAnswerIndexes(answered?.selected)
    : (isMulti ? getAnswerIndexes(diagnosisDraftAnswers[q.id] || []) : []);
  const selectedSet = new Set(selectedIndexes);

  const optWrap = qs('#diag-options');
  optWrap.innerHTML = '';
  q.options.forEach((text, oi) => {
    const item = document.createElement('div');
    item.className = 'question-option';

    if (locked) {
      if (correctSet.has(oi)) item.classList.add('correct');
      if (selectedSet.has(oi) && !correctSet.has(oi)) item.classList.add('incorrect');
    } else if (selectedSet.has(oi)) {
      item.classList.add('selected');
    }

    item.innerHTML = `
      <input type="${isMulti ? 'checkbox' : 'radio'}" name="diagopt" ${locked ? 'disabled' : ''} ${selectedSet.has(oi) ? 'checked' : ''} />
      <span>${q.type === 'tf' ? '' : String.fromCharCode(65 + oi) + '. '}${text}</span>
    `;

    item.addEventListener('click', () => {
      if (locked) return;
      if (isMulti) {
        const cur = new Set(getAnswerIndexes(diagnosisDraftAnswers[q.id] || []));
        if (cur.has(oi)) cur.delete(oi);
        else cur.add(oi);
        diagnosisDraftAnswers[q.id] = Array.from(cur).sort((a, b) => a - b);
        renderDiagnosisQuiz();
        return;
      }
      const correct = correctSet.has(oi);
      d.answers = d.answers || {};
      d.answers[q.id] = { selected: oi, correct, ts: Date.now() };
      setDiagnosis(d);
      updateKnowledgeMastery(q.knowledgeId, correct, { frequency: q.frequency, difficulty: q.difficulty });
      if (maybeAutoNext()) return;
      renderDiagnosisQuiz();
    });

    optWrap.appendChild(item);
  });

  const submitWrap = qs('#diag-submit-wrap');
  const submitTip = qs('#diag-submit-tip');
  const submitBtn = qs('#btn-diag-submit');
  const maybeAutoNext = () => {
    return maybeScheduleAutoNext({
      expectedQuestionId: q.id,
      renderLocked: renderDiagnosisQuiz,
      canAdvance: (expectedId) => {
        const cur = getDiagnosis();
        return cur.status === 'running' && diagnosisCurrentQuestion()?.id === expectedId;
      },
      goNext
    });
  };
  if (submitWrap && submitTip && submitBtn) {
    if (isMulti && !locked) {
      submitWrap.classList.remove('hidden');
      submitTip.textContent = `已选 ${selectedSet.size} 项（多选需提交判题）`;
      submitBtn.disabled = selectedSet.size === 0;
      submitBtn.onclick = () => {
        const picked = Array.from(new Set(getAnswerIndexes(diagnosisDraftAnswers[q.id] || []))).sort((a, b) => a - b);
        const correct = isSameAnswerSet(picked, correctIndexes);
        d.answers = d.answers || {};
        d.answers[q.id] = { selected: picked, correct, ts: Date.now() };
        setDiagnosis(d);
        delete diagnosisDraftAnswers[q.id];
        updateKnowledgeMastery(q.knowledgeId, correct, { frequency: q.frequency, difficulty: q.difficulty });
        if (maybeAutoNext()) return;
        renderDiagnosisQuiz();
      };
    } else {
      submitWrap.classList.add('hidden');
      submitBtn.onclick = null;
    }
  }

  if (locked) {
    const ok = !!answered?.correct;
    if (settings.diagnosisShowAnalysis) {
      const box = qs('#diag-analysis');
      if (box) box.classList.remove('hidden');
      const analysisText = qs('#diag-analysis-text');
      if (analysisText) analysisText.textContent = q.analysis || '暂无解析';
      const result = qs('#diag-result');
      if (result) {
        result.innerHTML = ok
          ? '<span class="text-success font-medium"><i class="fa fa-check-circle mr-2"></i>回答正确</span>'
          : '<span class="text-error font-medium"><i class="fa fa-times-circle mr-2"></i>回答错误</span>';
      }
    } else {
      qs('#diag-next-only')?.classList.remove('hidden');
    }
  }

  function goNext() {
    const d2 = getDiagnosis();
    delete diagnosisDraftAnswers[q.id];
    d2.cursor = (d2.cursor || 0) + 1;
    setDiagnosis(d2);
    renderDiagnosisQuiz();
  }

  qs('#btn-diag-next')?.addEventListener('click', goNext);
  qs('#btn-diag-next2')?.addEventListener('click', goNext);

  // 若已全部做完
  if ((d.cursor || 0) >= total) {
    finishDiagnosis();
  }
}


function calcPredictedScoreFromMastery() {
  // 加权预测：知识点掌握度按“题库中该知识点 frequency 总和”加权
  const km = getKnowledgeMastery();
  const kids = Object.keys(KNOWLEDGE_DICT);

  // 统计每个知识点在题库里的权重（sum frequency）
  const weightByK = {};
  for (const q of QUESTIONS) {
    const k = q.knowledgeId || 'law.basic';
    const w = Number(q.frequency || 3);
    weightByK[k] = (weightByK[k] || 0) + w;
  }

  let wsum = 0;
  let msum = 0;
  for (const k of kids) {
    const m = (typeof km[k]?.mastery === 'number') ? km[k].mastery : 0.5;
    const w = weightByK[k] || 1;
    wsum += w;
    msum += m * w;
  }
  const avg = wsum ? (msum / wsum) : 0.5;
  return Math.round(avg * 100);
}

function startKnowledgePractice(knowledgeId, targetCount = 20) {
  clearPracticeCurrentAnswer();
  const list = QUESTIONS.filter(q => (q.knowledgeId || 'law.basic') === knowledgeId);
  if (!list.length) {
    // fallback to smart
    practiceMode = 'smart';
    currentIndex = pickSmartIndex();
    showPage('practice', '练题');
    renderQuestion();
    return;
  }

  // 先放入未做过的，再循环补齐到 targetCount
  const progress = getProgress();
  const unanswered = list.filter(q => !progress.answered?.[q.id]);
  const answered = list.filter(q => progress.answered?.[q.id]);
  const base = [...unanswered, ...answered];

  const queue = [];
  let i = 0;
  while (queue.length < targetCount && base.length) {
    queue.push(base[i % base.length]);
    i += 1;
    if (i > 200) break;
  }

  knowledgeQueue = queue;
  knowledgeTitle = KNOWLEDGE_DICT[knowledgeId] || knowledgeId;
  practiceMode = 'knowledge';
  currentIndex = 0;
  showPage('practice', '专项练习');
  renderQuestion();
}

function renderDiagnosisReport() {
  showPage('diagnosis', '智能诊断');

  const area = qs('#diagnosis-quiz');
  const report = qs('#diagnosis-report');
  if (area) area.classList.add('hidden');
  if (report) report.classList.remove('hidden');

  const score = calcPredictedScoreFromMastery();
  const km = getKnowledgeMastery();

  // 权重：按题库 frequency 统计每知识点权重
  const weightByK = {};
  for (const q of QUESTIONS) {
    const k = q.knowledgeId || 'law.basic';
    weightByK[k] = (weightByK[k] || 0) + Number(q.frequency || 3);
  }

  const rows = Object.keys(KNOWLEDGE_DICT).map(k => {
    const m = km[k]?.mastery ?? 0.5;
    const w = weightByK[k] || 1;
    // 提分潜力：薄弱程度 * 权重
    const roi = (1 - m) * w;
    return { k, name: KNOWLEDGE_DICT[k], mastery: m, weight: w, roi };
  }).sort((a,b) => a.mastery - b.mastery);

  const topWeak = rows.slice(0, 10);
  const topROI = [...rows].sort((a,b) => b.roi - a.roi).slice(0, 5);

  // 错因统计
  const reasonMap = getWrongReason();
  const reasons = Object.values(reasonMap || {});
  const reasonCount = {
    memory: reasons.filter(x => x === 'memory').length,
    understand: reasons.filter(x => x === 'understand').length,
    careless: reasons.filter(x => x === 'careless').length,
    trap: reasons.filter(x => x === 'trap').length
  };
  const totalReason = Object.values(reasonCount).reduce((a,b)=>a+b,0);
  const reasonLabel = {
    memory: '记忆错误',
    understand: '理解错误',
    careless: '粗心',
    trap: '陷阱'
  };

  report.innerHTML = `
    <div class="card mb-6">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h4 class="text-lg font-bold">AI 诊断报告</h4>
          <p class="text-neutral mt-1">AI 预测得分（加权）：<span class="text-primary font-bold text-xl">${score}</span> 分</p>
          <p class="text-sm text-neutral mt-2">口径：知识点掌握度按题库考频（frequency）加权，优先反映“高频短板”。</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary" id="btn-go-smart">一键进入 AI 加速练习</button>
          <button class="btn btn-outline" id="btn-roi-chain">一键执行 AI ROI 路径（5×20题）</button>
          <button class="btn btn-outline" id="btn-diag-redo">重新诊断</button>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1">
          <h5 class="font-bold mb-3">AI 提分清单 TOP5（ROI）</h5>
          <div class="space-y-3">
            ${topROI.map(r => {
              const pct = Math.round(r.mastery * 100);
              return `
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center justify-between gap-4">
                    <div>
                      <p class="font-medium">${r.name}</p>
                      <p class="text-sm text-neutral mt-1">掌握度：${pct}%</p>
                    </div>
                    <div>
                      <button class="btn btn-outline" data-roi-practice="${r.k}">去专项练习</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="lg:col-span-1">
          <h5 class="font-bold mb-3">错因分布（基于你选择的错因）</h5>
          <div class="border border-gray-200 rounded-lg p-4">
            ${totalReason ? Object.keys(reasonCount).map(k => {
              const n = reasonCount[k];
              const pct = Math.round((n/totalReason)*100);
              return `
                <div class="mb-3">
                  <div class="flex justify-between text-sm text-neutral mb-1">
                    <span>${reasonLabel[k]}</span>
                    <span>${n}（${pct}%）</span>
                  </div>
                  <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
                </div>
              `;
            }).join('') : '<p class="text-neutral">暂无错因数据：建议在练题答错后选择错因，智能推荐会更准。</p>'}
          </div>
          <div class="bg-gray-50 p-4 rounded-lg mt-4 text-sm text-neutral">
            <p><strong>建议：</strong></p>
            <p>记忆错误多 → 多做专项+写口诀；理解错误多 → 多看解析与规则卡；粗心多 → 开启“关键词慢读”；陷阱多 → 做“易混淆”专项。</p>
          </div>
        </div>

        <div class="lg:col-span-1">
          <h5 class="font-bold mb-3">薄弱知识点 TOP10</h5>
          <div class="space-y-3">
            ${topWeak.map(r => {
              const pct = Math.round(r.mastery * 100);
              return `
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-medium">${r.name}</p>
                      <p class="text-sm text-neutral mt-1">掌握度：${pct}%</p>
                    </div>
                    <div class="w-32">
                      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // ROI 串练：按当前报告的 ROI 排序依次做专项
  const roiOrder = topROI.map(x => x.k);

  qsa('[data-roi-practice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kid = btn.getAttribute('data-roi-practice');
      startKnowledgePractice(kid, 20);
    });
  });

  qs('#btn-roi-chain')?.addEventListener('click', () => {
    if (!roiOrder.length) return;
    // 存到 window 上，供专项小结使用（轻量实现）
    window.__roiChain = roiOrder;
    window.__roiChainIndex = 0;
    startKnowledgePractice(roiOrder[0], 20);
  });

  qs('#btn-go-smart')?.addEventListener('click', () => {
    // 跳转练题并进入智能模式
    practiceMode = 'smart';
    currentIndex = pickSmartIndex();
    showPage('practice', '练题');
    renderQuestion();
    renderGlobalCTA();
  });
  qs('#btn-diag-redo')?.addEventListener('click', () => {
    startDiagnosis(true);
    renderGlobalCTA();
  });

  // 标记 done
  const d = getDiagnosis();
  if (d.status !== 'done') {
    d.status = 'done';
    d.finishedAt = Date.now();
    setDiagnosis(d);
  }
}

function renderHelpTOC() {
  const toc = qs('#help-toc-links');
  if (!toc) return;

  const sections = qsa('#help [data-help-section]');
  toc.innerHTML = sections.map(sec => {
    const id = sec.id;
    const title = sec.querySelector('h4')?.textContent || id;
    return `<button class="text-left hover:underline" data-help-jump="${id}">${title}</button>`;
  }).join('');

  qsa('[data-help-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-help-jump');
      const el = qs('#' + id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  bindHelpActions();
  bindHelpSearch();
}

let helpMatches = [];
let helpMatchIndex = -1;

function clearHighlights() {
  qsa('#help mark[data-help-mark]').forEach(m => {
    const text = document.createTextNode(m.textContent);
    m.replaceWith(text);
  });
}

function highlight(query) {
  clearHighlights();
  helpMatches = [];
  helpMatchIndex = -1;
  if (!query) return;

  const container = qs('#help');
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

  let node;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue;
    if (!value || !re.test(value)) continue;

    const span = document.createElement('span');
    span.innerHTML = value.replace(re, (m) => `<mark data-help-mark="1" class="bg-yellow-200">${m}</mark>`);
    node.parentNode.replaceChild(span, node);
  }

  helpMatches = qsa('#help mark[data-help-mark]');
}

function jumpNextMatch() {
  if (!helpMatches.length) return;
  helpMatchIndex = (helpMatchIndex + 1) % helpMatches.length;
  const el = helpMatches[helpMatchIndex];
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindHelpSearch() {
  const input = qs('#help-search');
  if (!input) return;

  input.addEventListener('input', () => {
    highlight(input.value.trim());
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!helpMatches.length) highlight(input.value.trim());
      jumpNextMatch();
    }
  });
}

function bindHelpActions() {
  qsa('#help-actions [data-help-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-help-action');
      if (act === 'start-diagnosis') {
        showPage('diagnosis', '智能诊断');
        startDiagnosis(true);
        return;
      }
      if (act === 'continue-diagnosis') {
        showPage('diagnosis', '智能诊断');
        startDiagnosis(false);
        return;
      }
      if (act === 'go-smart') {
        practiceMode = 'smart';
        currentIndex = pickSmartIndex();
        showPage('practice', '练题');
        renderQuestion();
        return;
      }
      if (act === 'go-wrong') {
        showPage('wrongbook', '错题本');
        renderWrongbook();
        return;
      }
      if (act === 'go-plan') {
        showPage('plan', '今日计划');
        renderPlanPage();
        return;
      }
      if (act === 'go-bank') {
        showPage('question-bank', '题库');
        renderQuestionBank();
        return;
      }
      if (act === 'clear-data') {
        const ok = confirm('确认清空本地数据？此操作会删除学习记录/错题/收藏/诊断/掌握度等（仅本机浏览器）。');
        if (!ok) return;
        // 逐项清空（不直接依赖 storage.js 的 clearAllData 以避免循环import）
        const keys = [
          'qa.examDate','qa.progress','qa.favorites','qa.notes','qa.wrong','qa.wrongStreak','qa.daily',
          'qa.knowledgeMastery','qa.diagnosis','qa.settings','qa.wrongReason','qa.review','qa.examHistory',
          'qa.trainingContext','qa.learnerProfile','qa.learningEvents'
        ];
        keys.forEach(k => localStorage.removeItem(k));
        alert('已清空本地数据。');
        renderStats();
        renderPlanSummary();
        renderGlobalCTA();
        persistActiveStudentSnapshot();
        return;
      }
    });
  });
}

function renderWrongbook() {
  const wrap = qs('#wrong-list');
  const ids = getWrongList();
  const map = new Map(QUESTIONS.map(q => [q.id, q]));
  const items = ids.map(id => map.get(id)).filter(Boolean);

  qs('#wrong-count').textContent = String(items.length);

  const tip = qs('#wrong-tip');
  if (tip) tip.textContent = '错题消除规则：同一题连续答对 2 次将自动移出错题本（答错会重置计数）。';

  if (!items.length) {
    wrap.innerHTML = '<p class="text-neutral">暂无错题。去练题页做题吧。</p>';
    return;
  }

  wrap.innerHTML = items.map(q => `
    <div class="border border-gray-200 rounded-lg p-4 hover:border-primary transition-all">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm text-neutral">${q.id} · ${questionTypeText(q.type)} · ${(q.tags || []).join(' / ')}</p>
          <p class="font-medium mt-1">${q.stem}</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline" data-wrong-practice="${q.id}">去重练</button>
          <button class="btn btn-secondary" data-wrong-remove="${q.id}">移除</button>
        </div>
      </div>
    </div>
  `).join('');

  qsa('[data-wrong-practice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-wrong-practice');
      // 只对这一题启动错题队列
      const map = new Map(QUESTIONS.map(q => [q.id, q]));
      wrongQueue = [map.get(id)].filter(Boolean);
      practiceMode = 'wrong';
      currentIndex = 0;
      showPage('practice', '错题重练');
      renderQuestion();
    });
  });

  qsa('[data-wrong-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-wrong-remove');
      removeWrong(id);
      renderWrongbook();
      renderStats();
    });
  });
}

function formatDateTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function renderOptionLabel(q, idx) {
  if (Array.isArray(idx)) {
    if (!idx.length) return '未作答';
    return idx
      .map(i => renderOptionLabel(q, Number(i)))
      .filter(Boolean)
      .join('；');
  }
  if (typeof idx !== 'number' || !Array.isArray(q?.options) || idx < 0 || idx >= q.options.length) return '未作答';
  const txt = q.options[idx];
  return `${String.fromCharCode(65 + idx)}. ${txt}`;
}

function renderOptionKey(idx) {
  if (typeof idx !== 'number' || idx < 0) return '-';
  return String.fromCharCode(65 + idx);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightReplayKeywords(text) {
  const raw = escapeHtml(text || '');
  const re = /(不得|必须|可以|不可以|不能|不准|严禁|应当|不应当|允许|优先|让行|减速|停车|注意|观察)/g;
  return raw.replace(re, '<mark class="bg-yellow-200 px-0.5 rounded">$1</mark>');
}

function renderExamDetail(record) {
  const modal = qs('#exam-detail-modal');
  const body = qs('#exam-detail-content');
  if (!modal || !body || !record) return;

  const wrongCount = Math.max(0, (record.total || 0) - (record.correct || 0));
  const minutes = Math.max(1, Math.round((record.durationSec || 0) / 60));
  const typeLabel = record.examType === 'quick' ? '快速测试' : '标准考试';
  const byK = record.byKnowledge || {};
  const topWeak = Object.keys(byK)
    .map(k => {
      const total = byK[k]?.total || 0;
      const correct = byK[k]?.correct || 0;
      return { kid: k, wrong: Math.max(0, total - correct), total, acc: total ? Math.round((correct / total) * 100) : 0 };
    })
    .filter(x => x.total > 0)
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 3);

  const reasonStat = record.wrongReasonStat || {};
  const reasonLabel = {
    memory: '记忆错误',
    understand: '理解错误',
    careless: '粗心',
    trap: '陷阱'
  };

  body.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
      <div class="card"><p class="text-neutral">考试类型</p><p class="text-xl font-bold mt-1">${typeLabel}</p></div>
      <div class="card"><p class="text-neutral">得分</p><p class="text-2xl font-bold mt-1">${record.score || 0}</p></div>
      <div class="card"><p class="text-neutral">答对/总题</p><p class="text-2xl font-bold mt-1">${record.correct || 0}/${record.total || 0}</p></div>
      <div class="card"><p class="text-neutral">用时</p><p class="text-2xl font-bold mt-1">${minutes} 分钟</p></div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      <div class="border border-gray-200 rounded-lg p-4">
        <h5 class="font-bold mb-3">知识点失分 TOP3</h5>
        ${topWeak.length ? topWeak.map(x => `
          <div class="mb-3">
            <div class="flex justify-between text-sm">
              <span>${KNOWLEDGE_DICT[x.kid] || x.kid}</span>
              <span>错 ${x.wrong} / ${x.total}（正确率 ${x.acc}%）</span>
            </div>
            <div class="progress-bar mt-1"><div class="progress-bar-fill" style="width:${x.acc}%"></div></div>
          </div>
        `).join('') : '<p class="text-neutral">暂无知识点统计。</p>'}
      </div>
      <div class="border border-gray-200 rounded-lg p-4">
        <h5 class="font-bold mb-3">错因分布</h5>
        ${Object.keys(reasonLabel).map(k => {
          const n = Number(reasonStat[k] || 0);
          const pct = wrongCount ? Math.round((n / wrongCount) * 100) : 0;
          return `
            <div class="mb-3">
              <div class="flex justify-between text-sm text-neutral mb-1">
                <span>${reasonLabel[k]}</span>
                <span>${n}（${pct}%）</span>
              </div>
              <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="border border-gray-200 rounded-lg p-4 mt-4">
      <h5 class="font-bold mb-3">错题ID（${wrongCount}题）</h5>
      <div class="flex flex-wrap gap-2">
        ${(record.wrongIds || []).length
          ? record.wrongIds.slice(0, 30).map((id, idx) => `<button class="badge badge-error" data-replay-jump="${idx}">${id}</button>`).join('')
          : '<span class="text-neutral">无</span>'
        }
      </div>
    </div>
    <div class="border border-gray-200 rounded-lg p-4 mt-4" id="exam-replay-wrap">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h5 class="font-bold">错题回放</h5>
        <div class="flex gap-2">
          <button class="btn btn-secondary" id="replay-prev">上一题</button>
          <button class="btn btn-secondary" id="replay-next">下一题</button>
        </div>
      </div>
      <div id="exam-replay-box" class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-neutral"></div>
    </div>
  `;

  const qMap = new Map(QUESTIONS.map(q => [q.id, q]));
  const replayIds = (record.wrongIds || []).filter(id => qMap.has(id));
  const answers = record.answers || {};
  const replayCache = new Map();
  let replayCursor = 0;

  function getReplaySnapshot(idx) {
    const safeIdx = (idx + replayIds.length) % replayIds.length;
    if (replayCache.has(safeIdx)) return replayCache.get(safeIdx);
    const qid = replayIds[safeIdx];
    const q = qMap.get(qid);
    const my = answers[qid] || {};
    const snap = {
      qid,
      q,
      my,
      myLabel: escapeHtml(renderOptionLabel(q, my.selected)),
      rightLabel: escapeHtml(renderOptionLabel(q, q.answer)),
      stemHtml: highlightReplayKeywords(q?.stem || ''),
      analysisHtml: highlightReplayKeywords(q?.analysis || '暂无解析')
    };
    replayCache.set(safeIdx, snap);
    return snap;
  }

  function drawReplay() {
    const box = qs('#exam-replay-box');
    if (!box) return;
    if (!replayIds.length) {
      box.innerHTML = '本次没有错题，暂无回放内容。';
      return;
    }

    const cur = getReplaySnapshot(replayCursor);
    const prev = getReplaySnapshot(replayCursor - 1);
    const next = getReplaySnapshot(replayCursor + 1);
    const qid = cur.qid;
    const q = cur.q;

    // 预加载相邻题，减少切换时渲染抖动
    getReplaySnapshot(replayCursor + 2);
    getReplaySnapshot(replayCursor - 2);

    box.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <p class="text-neutral">第 ${replayCursor + 1}/${replayIds.length} 题 · ${qid}</p>
        <span class="badge badge-error">答错</span>
      </div>
      <p class="text-xs text-neutral mb-2">上一题：${prev.qid} · 下一题：${next.qid}</p>
      <p class="font-medium text-gray-900 mb-3">${cur.stemHtml}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="border border-error/30 bg-red-50 rounded-lg p-3">
          <p class="text-error font-medium">你的答案</p>
          <p class="mt-1 text-gray-900">${cur.myLabel}</p>
        </div>
        <div class="border border-success/30 bg-green-50 rounded-lg p-3">
          <p class="text-success font-medium">正确答案</p>
          <p class="mt-1 text-gray-900">${cur.rightLabel}</p>
        </div>
      </div>
      <div class="mt-3">
        <p class="text-neutral"><strong>解析：</strong>${cur.analysisHtml}</p>
      </div>
      <div class="mt-4">
        <p class="text-neutral mb-2"><strong>错因标记：</strong>请选择本题主要错因（用于后续智能推荐）</p>
        <div class="flex flex-wrap gap-2" id="replay-reason-group">
          ${(() => {
            const selected = getWrongReason()?.[qid] || '';
            const items = [
              { v: 'memory', t: '记忆错误' },
              { v: 'understand', t: '理解错误' },
              { v: 'careless', t: '粗心' },
              { v: 'trap', t: '陷阱' }
            ];
            return items.map(it => `
              <button class="${selected === it.v ? 'btn btn-primary' : 'btn btn-secondary'}" data-replay-reason="${it.v}">
                ${it.t}
              </button>
            `).join('');
          })()}
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn btn-outline" id="replay-add-wrong">加入错题本</button>
        <button class="btn btn-primary" id="replay-practice-one">立即重练该题</button>
      </div>
    `;

    qsa('[data-replay-reason]').forEach(btn => {
      btn.addEventListener('click', () => {
        const reason = btn.getAttribute('data-replay-reason');
        if (!reason) return;
        setWrongReasonForQuestion(qid, reason);
        drawReplay();
      });
    });

    qs('#replay-add-wrong')?.addEventListener('click', () => {
      addWrong(qid);
      renderStats();
      const tip = qs('#exam-replay-box');
      if (!tip) return;
      const note = document.createElement('p');
      note.className = 'text-success mt-3';
      note.textContent = '已加入错题本。';
      tip.appendChild(note);
    });

    qs('#replay-practice-one')?.addEventListener('click', () => {
      const one = qMap.get(qid);
      if (!one) return;
      wrongQueue = [one];
      practiceMode = 'wrong';
      currentIndex = 0;
      modal.classList.add('hidden');
      showPage('practice', '错题重练');
      renderQuestion();
    });
  }

  qs('#replay-prev')?.addEventListener('click', () => {
    if (!replayIds.length) return;
    replayCursor = (replayCursor - 1 + replayIds.length) % replayIds.length;
    drawReplay();
  });

  qs('#replay-next')?.addEventListener('click', () => {
    if (!replayIds.length) return;
    replayCursor = (replayCursor + 1) % replayIds.length;
    drawReplay();
  });

  qsa('[data-replay-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-replay-jump') || 0);
      replayCursor = Math.max(0, Math.min(idx, replayIds.length - 1));
      drawReplay();
    });
  });

  if (modal.__replayKeyHandler) {
    document.removeEventListener('keydown', modal.__replayKeyHandler);
  }
  modal.__replayKeyHandler = (e) => {
    if (modal.classList.contains('hidden')) return;
    if (!replayIds.length) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      replayCursor = (replayCursor - 1 + replayIds.length) % replayIds.length;
      drawReplay();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      replayCursor = (replayCursor + 1) % replayIds.length;
      drawReplay();
    }
  };
  document.addEventListener('keydown', modal.__replayKeyHandler);

  drawReplay();
  modal.classList.remove('hidden');
}

function renderExamPage() {
  renderMockExamRuntime();
  const body = qs('#exam-history-body');
  if (!body) return;

  const list = getExamHistory()
    .slice()
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));

  if (!list.length) {
    body.innerHTML = '<tr class="border-b border-gray-200"><td class="py-4 px-4 text-neutral" colspan="5">暂无考试记录。先完成一次标准考试或快速测试。</td></tr>';
    return;
  }

  body.innerHTML = list.map(r => {
    const typeLabel = r.examType === 'quick' ? '快速测试' : '标准考试';
    const pass = Number(r.score || 0) >= PASS_SCORE;
    return `
      <tr class="border-b border-gray-200">
        <td class="py-3 px-4">${formatDateTime(r.finishedAt)}</td>
        <td class="py-3 px-4">${typeLabel}</td>
        <td class="py-3 px-4">${r.score || 0}分</td>
        <td class="py-3 px-4">${pass ? '<span class="badge badge-success">通过</span>' : '<span class="badge badge-error">未通过</span>'}</td>
        <td class="py-3 px-4"><button class="text-primary hover:underline" data-exam-open="${r.id}">查看详情</button></td>
      </tr>
    `;
  }).join('');

  qsa('[data-exam-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-exam-open');
      const rec = list.find(x => x.id === id);
      renderExamDetail(rec);
    });
  });
}

function renderPlanPage() {
  const examDate = getExamDate();
  const examEl = qs('#plan-exam-date');
  if (examEl) examEl.textContent = examDate || '未设置';
  const progress = getProgress();
  const total = QUESTIONS.length;
  const done = progress.doneCount || 0;
  const plan = getDynamicDailyPlan(total, done, examDate);

  const daily = getDaily();
  const today = todayStr();
  const todayRec = daily.byDate?.[today] || { done: 0, correct: 0 };
  const todayDone = todayRec.done || 0;
  const todayAcc = todayDone ? Math.round((todayRec.correct / todayDone) * 100) : 0;

  const remain = Math.max(total - done, 0);
  const pct = plan.totalTarget ? Math.min(100, Math.round((todayDone / plan.totalTarget) * 100)) : 0;

  const box = qs('#plan-box');
  const ratioText = `${Math.round(plan.newRatio * 100)}% 新题 / ${Math.round(plan.reviewRatio * 100)}% 复习`;
  const riskBlock = plan.risk
    ? `
      <div class="card mt-4">
        <p class="text-error font-semibold">进度风险提醒</p>
        <p class="text-sm text-neutral mt-1">按当前剩余题量与倒计时，至少需要 ${plan.requiredPerDay} 新题/天才可能按时覆盖全题库，已超过系统建议上限 ${plan.maxNewPerDay} 新题/天。</p>
        <p class="text-sm text-neutral mt-1">建议：延后考试日期或提高每日练题时长，并优先完成错题与高频考点复盘。</p>
      </div>
    `
    : '';
  box.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="card">
        <p class="text-neutral">今日完成</p>
        <p class="text-2xl font-bold mt-1">${todayDone}/${plan.totalTarget}</p>
        <p class="text-sm text-neutral mt-1">新题 ${plan.newTarget} + 复习 ${plan.reviewTarget}</p>
        <div class="progress-bar mt-3"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="card">
        <p class="text-neutral">今日正确率</p>
        <p class="text-2xl font-bold mt-1">${todayAcc}%</p>
        <p class="text-sm text-neutral mt-1">近3天正确率：${plan.recentAcc}% · 今日正确 ${todayRec.correct} 题</p>
      </div>
      <div class="card">
        <p class="text-neutral">剩余题量</p>
        <p class="text-2xl font-bold mt-1">${remain}</p>
        <p class="text-sm text-neutral mt-1">总进度：${done}/${total} · 到期复习：${plan.dueReview}</p>
      </div>
    </div>
    <div class="card mt-4">
      <p class="text-neutral">目标依据</p>
      <p class="text-sm text-neutral mt-1">
        ${examDate ? `考试倒计时：${Math.max(plan.daysLeft, 0)} 天 · 当前阶段：${plan.stageLabel}` : '考试日期未设置（建议尽快设置）'}
        · 分配建议：${ratioText}
        · 动态目标按“倒计时阶段 + 剩余题量/天数 + 近3天正确率 + 到期复习量”自动计算。
      </p>
    </div>
    ${riskBlock}
  `;
}

const bankState = {
  q: '',
  status: 'all',
  type: 'all',
  knowledge: 'all',
  favOnly: false,
  sort: 'priority',
  view: 'list',
  page: 1,
  pageSize: 20
};

function getFavoritesSet() {
  return new Set(JSON.parse(localStorage.getItem('qa.favorites') || '[]'));
}

function bankFiltered() {
  const progress = getProgress();
  const fav = getFavoritesSet();
  const q = (bankState.q || '').trim().toLowerCase();

  let list = QUESTIONS.slice();

  if (q) {
    list = list.filter(x => (x.id + ' ' + x.stem).toLowerCase().includes(q));
  }

  if (bankState.status !== 'all') {
    list = list.filter(x => {
      const a = progress.answered?.[x.id];
      if (bankState.status === 'unanswered') return !a;
      if (bankState.status === 'correct') return a && a.correct === true;
      if (bankState.status === 'wrong') return a && a.correct === false;
      return true;
    });
  }

  if (bankState.type !== 'all') {
    list = list.filter(x => x.type === bankState.type);
  }

  if (bankState.knowledge !== 'all') {
    list = list.filter(x => (x.knowledgeId || 'law.basic') === bankState.knowledge);
  }

  if (bankState.favOnly) {
    list = list.filter(x => fav.has(x.id));
  }

  // 排序
  if (bankState.sort === 'id') {
    list.sort((a,b) => String(a.id).localeCompare(String(b.id)));
  } else {
    // 默认：未做优先 -> 未掌握 -> 已掌握
    const rank = (x) => {
      const a = progress.answered?.[x.id];
      if (!a) return 0;
      if (a.correct === false) return 1;
      return 2;
    };
    list.sort((a,b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  return list;
}

function startPracticeWithList(list, title = '练题') {
  if (!list.length) return;
  // 将该列表作为 knowledgeQueue 复用（不改变其含义：这里当作“筛选队列”）
  knowledgeQueue = list;
  knowledgeTitle = title;
  practiceMode = 'knowledge';
  currentIndex = 0;
  showPage('practice', title);
  renderQuestion();
}

function renderKnowledgeView(allList) {
  const wrap = qs('#bank-knowledge-view');
  if (!wrap) return;
  const progress = getProgress();

  // 聚合统计
  const groups = {};
  for (const q of allList) {
    const kid = q.knowledgeId || 'law.basic';
    (groups[kid] ||= []).push(q);
  }

  const km = getKnowledgeMastery();

  wrap.innerHTML = Object.keys(KNOWLEDGE_DICT).map(kid => {
    const list = groups[kid] || [];
    const total = list.length;
    const answered = list.filter(q => progress.answered?.[q.id]).length;
    const wrong = list.filter(q => progress.answered?.[q.id] && progress.answered[q.id].correct === false).length;
    const mastery = km[kid]?.mastery;
    const mText = (typeof mastery === 'number') ? `${Math.round(mastery * 100)}%` : '—';

    return `
      <div class="border border-gray-200 rounded-lg overflow-hidden">
        <button class="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between" data-k-toggle="${kid}">
          <div>
            <p class="font-medium">${KNOWLEDGE_DICT[kid]}</p>
            <p class="text-sm text-neutral mt-1">掌握度：${mText} · 已做：${answered}/${total} · 未掌握：${wrong}</p>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn btn-outline" data-k-practice="${kid}">专项20题</button>
            <i class="fa fa-chevron-down text-neutral"></i>
          </div>
        </button>
        <div class="hidden p-4 space-y-2" id="k-panel-${kid}"></div>
      </div>
    `;
  }).join('');

  // 展开/收起
  qsa('[data-k-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // 避免点到专项按钮也触发展开
      if (e.target?.getAttribute && e.target.getAttribute('data-k-practice')) return;
      const kid = btn.getAttribute('data-k-toggle');
      const panel = qs('#k-panel-' + kid);
      if (!panel) return;
      const open = !panel.classList.contains('hidden');
      if (open) {
        panel.classList.add('hidden');
        return;
      }

      // 懒渲染该知识点下的题目
      const list = (groups[kid] || []).slice(0, 30); // 先展示前30条，避免太长
      panel.innerHTML = list.map(q => {
        const a = progress.answered?.[q.id];
        const status = a ? (a.correct ? '<span class="badge badge-success">已掌握</span>' : '<span class="badge badge-error">未掌握</span>') : '<span class="badge">未做</span>';
        const stem = String(q.stem || '');
        const shortStem = stem.length > 60 ? stem.slice(0, 60) + '…' : stem;
        return `
          <div class="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
            <div>
              <p class="text-sm text-neutral">${q.id} · ${questionTypeText(q.type)}</p>
              <p class="font-medium mt-1">${shortStem}</p>
              <div class="mt-2">${status}</div>
            </div>
            <div>
              <button class="btn btn-outline" data-bank-go="${q.id}">去做题</button>
            </div>
          </div>
        `;
      }).join('');
      panel.classList.remove('hidden');

      // 绑定“去做题”
      qsa('#k-panel-' + kid + ' [data-bank-go]').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-bank-go');
          const idx = QUESTIONS.findIndex(x => x.id === id);
          practiceMode = 'all';
          currentIndex = Math.max(0, idx);
          showPage('practice', '练题');
          renderQuestion();
        });
      });
    });
  });

  // 专项
  qsa('[data-k-practice]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const kid = btn.getAttribute('data-k-practice');
      startKnowledgePractice(kid, 20);
    });
  });
}

function renderQuestionBank() {
  const wrap = qs('#bank-list');
  const kv = qs('#bank-knowledge-view');
  const meta = qs('#bank-meta');
  const pageEl = qs('#bank-page');
  const progress = getProgress();
  const fav = getFavoritesSet();

  // 初始化知识点下拉
  const selK = qs('#bank-knowledge');
  if (selK && selK.options.length <= 1) {
    Object.keys(KNOWLEDGE_DICT).forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = KNOWLEDGE_DICT[k];
      selK.appendChild(opt);
    });
  }

  const all = bankFiltered();
  const total = all.length;
  const startBtn = qs('#bank-start-filter');
  if (startBtn) {
    startBtn.innerHTML = `<i class="fa fa-play-circle mr-2"></i>AI 生成练习（${total}题）`;
    startBtn.disabled = total === 0;
  }

  // 视图切换
  if (bankState.view === 'knowledge') {
    if (wrap) wrap.classList.add('hidden');
    if (kv) kv.classList.remove('hidden');
    if (meta) meta.textContent = `共 ${QUESTIONS.length} 题 · 当前筛选 ${total} 题 · 视图：按知识点`;
    if (pageEl) pageEl.textContent = `—`;
    renderKnowledgeView(all);
    return;
  }

  if (wrap) wrap.classList.remove('hidden');
  if (kv) kv.classList.add('hidden');

  const pages = Math.max(1, Math.ceil(total / bankState.pageSize));
  bankState.page = Math.max(1, Math.min(bankState.page, pages));

  const start = (bankState.page - 1) * bankState.pageSize;
  const slice = all.slice(start, start + bankState.pageSize);

  if (meta) meta.textContent = `共 ${QUESTIONS.length} 题 · 筛选后 ${total} 题 · 每页 ${bankState.pageSize} 题`;
  if (pageEl) pageEl.textContent = `${bankState.page}/${pages}`;

  wrap.innerHTML = slice.map((q, idx) => {
    const a = progress.answered?.[q.id];
    const status = a ? (a.correct ? '<span class="badge badge-success">已掌握</span>' : '<span class="badge badge-error">未掌握</span>') : '<span class="badge">未做</span>';
    const star = fav.has(q.id) ? '<i class="fa fa-star text-warning"></i>' : '<i class="fa fa-star-o text-neutral"></i>';
    const kName = KNOWLEDGE_DICT[q.knowledgeId] || '未标注';
    const stem = String(q.stem || '');
    const shortStem = stem.length > 46 ? stem.slice(0, 46) + '…' : stem;
    return `
      <div class="border border-gray-200 rounded-lg p-3 hover:border-primary transition-all">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-neutral">#${start + idx + 1} · ${q.id} · ${questionTypeText(q.type)} · ${kName}</p>
            <p class="font-medium mt-1">${shortStem}</p>
            <div class="mt-2 flex items-center gap-2">${status} <span class="text-xs">${star}</span></div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-outline" data-bank-go="${q.id}">去做题</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  qsa('[data-bank-go]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-bank-go');
      const idx = QUESTIONS.findIndex(x => x.id === id);
      practiceMode = 'all';
      currentIndex = Math.max(0, idx);
      showPage('practice', '练题');
      renderQuestion();
    });
  });

  // 绑定控件事件（只绑定一次）
  const search = qs('#bank-search');
  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', () => { bankState.q = search.value; bankState.page = 1; renderQuestionBank(); });
  }
  const st = qs('#bank-status');
  if (st && !st.dataset.bound) {
    st.dataset.bound = '1';
    st.addEventListener('change', () => { bankState.status = st.value; bankState.page = 1; renderQuestionBank(); });
  }
  const tp = qs('#bank-type');
  if (tp && !tp.dataset.bound) {
    tp.dataset.bound = '1';
    tp.addEventListener('change', () => { bankState.type = tp.value; bankState.page = 1; renderQuestionBank(); });
  }
  const kn = qs('#bank-knowledge');
  if (kn && !kn.dataset.bound) {
    kn.dataset.bound = '1';
    kn.addEventListener('change', () => { bankState.knowledge = kn.value; bankState.page = 1; renderQuestionBank(); });
  }
  const favOnly = qs('#bank-fav');
  if (favOnly && !favOnly.dataset.bound) {
    favOnly.dataset.bound = '1';
    favOnly.addEventListener('change', () => { bankState.favOnly = !!favOnly.checked; bankState.page = 1; renderQuestionBank(); });
  }
  const sort = qs('#bank-sort');
  if (sort && !sort.dataset.bound) {
    sort.dataset.bound = '1';
    sort.addEventListener('change', () => { bankState.sort = sort.value; bankState.page = 1; renderQuestionBank(); });
  }

  const view = qs('#bank-view');
  if (view && !view.dataset.bound) {
    view.dataset.bound = '1';
    // 初始化下拉与状态一致
    view.value = bankState.view || 'list';
    view.addEventListener('change', () => {
      bankState.view = view.value;
      bankState.page = 1;
      renderQuestionBank();
      // 切到按知识点时把页面滚回到列表顶部，避免用户以为“没变化”
      qs('#question-bank')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const prev = qs('#bank-prev');
  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = '1';
    prev.addEventListener('click', () => { bankState.page = Math.max(1, bankState.page - 1); renderQuestionBank(); });
  }
  const next = qs('#bank-next');
  if (next && !next.dataset.bound) {
    next.dataset.bound = '1';
    next.addEventListener('click', () => { bankState.page = Math.min(pages, bankState.page + 1); renderQuestionBank(); });
  }

  const startBtn2 = qs('#bank-start-filter');
  if (startBtn2 && !startBtn2.dataset.bound) {
    startBtn2.dataset.bound = '1';
    startBtn2.addEventListener('click', () => {
      const list = bankFiltered();
      startPracticeWithList(list, '筛选练习');
    });
  }

  const addFavBtn = qs('#bank-add-fav');
  if (addFavBtn && !addFavBtn.dataset.bound) {
    addFavBtn.dataset.bound = '1';
    addFavBtn.addEventListener('click', () => {
      const ids = bankFiltered().map(x => x.id);
      const set = getFavoritesSet();
      ids.forEach(id => set.add(id));
      localStorage.setItem('qa.favorites', JSON.stringify(Array.from(set)));
      renderQuestionBank();
    });
  }
}

const AUTH_KEYS = {
  ORG_SESSION: 'qa.orgSession',
  ACTIVE_STUDENT: 'qa.activeStudent'
};

const STUDENT_DATA_KEYS = [
  'qa.examDate','qa.progress','qa.favorites','qa.notes','qa.wrong','qa.wrongStreak','qa.daily',
  'qa.knowledgeMastery','qa.diagnosis','qa.settings','qa.wrongReason','qa.review','qa.examHistory',
  'qa.trainingContext','qa.learnerProfile','qa.learningEvents'
];

let authState = {
  org: null,
  activeStudentId: '',
  students: []
};

function getTrainingContext() {
  return parseJsonSafe(localStorage.getItem('qa.trainingContext'), {
    city: '深圳',
    carType: 'C1',
    subject: '科目一'
  });
}

function setTrainingContext(ctx) {
  localStorage.setItem('qa.trainingContext', JSON.stringify({
    city: String(ctx?.city || '深圳'),
    carType: String(ctx?.carType || 'C1'),
    subject: String(ctx?.subject || '科目一')
  }));
}

function renderTrainingContext() {
  const ctx = getTrainingContext();
  const text = `城市：${ctx.city} · 车型：${ctx.carType} · 科目：${ctx.subject}`;
  const brief = qs('#context-brief');
  if (brief) brief.textContent = text;
  renderAIStatusPill();
}

function renderAIStatusPill() {
  const el = qs('#ai-status-pill');
  if (!el) return;
  const profile = getLearnerProfile();
  const total = Number(profile?.total || 0);
  const enabled = total >= 20;
  const text = enabled
    ? `AI 模型：个性化推荐已启用（基于 ${total} 题）`
    : `AI 模型：已启用，等待学习数据完善（${total} 题）`;
  el.className = enabled
    ? 'inline-flex items-center gap-1 text-[11px] mt-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary'
    : 'inline-flex items-center gap-1 text-[11px] mt-1.5 px-2 py-1 rounded-full bg-warning/10 text-warning';
  const txt = el.querySelector('span');
  if (txt) txt.textContent = text;
}

function openContextModal() {
  const m = qs('#context-modal');
  if (!m) return;
  const ctx = getTrainingContext();
  const city = qs('#ctx-city');
  const car = qs('#ctx-car');
  const sub = qs('#ctx-subject');
  if (city) city.value = ctx.city;
  if (car) car.value = ctx.carType;
  if (sub) sub.value = ctx.subject;
  m.classList.remove('hidden');
}

function closeContextModal() {
  qs('#context-modal')?.classList.add('hidden');
}

function bindContextModal() {
  const m = qs('#context-modal');
  if (!m || m.dataset.bound) return;
  m.dataset.bound = '1';
  m.addEventListener('click', (e) => {
    if (e.target === m) closeContextModal();
  });
  qs('#context-cancel')?.addEventListener('click', closeContextModal);
  qs('#context-reset')?.addEventListener('click', () => {
    setTrainingContext({ city: '深圳', carType: 'C1', subject: '科目一' });
    renderTrainingContext();
    openContextModal();
  });
  qs('#context-save')?.addEventListener('click', () => {
    setTrainingContext({
      city: qs('#ctx-city')?.value || '深圳',
      carType: qs('#ctx-car')?.value || 'C1',
      subject: qs('#ctx-subject')?.value || '科目一'
    });
    renderTrainingContext();
    closeContextModal();
  });
}

function parseJsonSafe(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getOrgStudentsKey(account) {
  return `qa.orgStudents.${account || ''}`;
}

function getStudentSnapshotKey(account, studentId) {
  return `qa.snapshot.${account || ''}.${studentId || ''}`;
}

function getOrgSession() {
  return parseJsonSafe(localStorage.getItem(AUTH_KEYS.ORG_SESSION), null);
}

function setOrgSession(session) {
  if (!session) {
    localStorage.removeItem(AUTH_KEYS.ORG_SESSION);
    return;
  }
  localStorage.setItem(AUTH_KEYS.ORG_SESSION, JSON.stringify(session));
}

function getOrgStudents(account) {
  return parseJsonSafe(localStorage.getItem(getOrgStudentsKey(account)), []);
}

function setOrgStudents(account, list) {
  localStorage.setItem(getOrgStudentsKey(account), JSON.stringify(Array.isArray(list) ? list : []));
}

function normalizeStudents(list) {
  const used = new Set();
  return (Array.isArray(list) ? list : []).map((s, idx) => {
    const phoneDigits = String(s.phone || '').replace(/\D/g, '');
    let accountBase = String(s.loginAccount || '').trim();
    if (!accountBase) {
      accountBase = `stu${(phoneDigits.slice(-6) || String(s.id || '').slice(-6) || String(idx + 1).padStart(3, '0'))}`;
    }
    let account = accountBase.toLowerCase();
    let n = 1;
    while (used.has(account)) {
      n += 1;
      account = `${accountBase.toLowerCase()}${n}`;
    }
    used.add(account);
    return {
      ...s,
      loginAccount: account,
      loginPassword: String(s.loginPassword || '123456')
    };
  });
}

function persistActiveStudentSnapshot() {
  if (!authState.org?.account || !authState.activeStudentId) return;
  const payload = {};
  STUDENT_DATA_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) payload[k] = v;
  });
  localStorage.setItem(getStudentSnapshotKey(authState.org.account, authState.activeStudentId), JSON.stringify(payload));
}

function loadStudentSnapshot(account, studentId) {
  STUDENT_DATA_KEYS.forEach(k => localStorage.removeItem(k));
  const payload = parseJsonSafe(localStorage.getItem(getStudentSnapshotKey(account, studentId)), {});
  Object.keys(payload || {}).forEach(k => {
    if (Object.prototype.hasOwnProperty.call(payload, k)) localStorage.setItem(k, payload[k]);
  });
}

function updateSidebarIdentity() {
  const nameEl = qs('#sidebar-student-name');
  const orgEl = qs('#sidebar-org-name');
  const stu = authState.students.find(x => x.id === authState.activeStudentId);
  if (nameEl) nameEl.textContent = stu ? `${stu.name}（${stu.carType || 'C1'}）` : '未绑定学员';
  if (orgEl) orgEl.textContent = authState.org ? `${authState.org.orgName || '驾校'} · ${authState.org.account}` : '未登录驾校';
}

function renderMockLoginQr() {
  const c = qs('#mock-qr-canvas');
  if (!c) return;
  const size = 29;
  const px = 6;
  c.width = size * px;
  c.height = size * px;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);

  const inFinder = (x, y, ox, oy) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
  const isFinderCell = (x, y) => inFinder(x, y, 0, 0) || inFinder(x, y, size - 7, 0) || inFinder(x, y, 0, size - 7);
  const drawFinder = (ox, oy) => {
    ctx.fillStyle = '#111827';
    ctx.fillRect(ox * px, oy * px, 7 * px, 7 * px);
    ctx.fillStyle = '#fff';
    ctx.fillRect((ox + 1) * px, (oy + 1) * px, 5 * px, 5 * px);
    ctx.fillStyle = '#111827';
    ctx.fillRect((ox + 2) * px, (oy + 2) * px, 3 * px, 3 * px);
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (isFinderCell(x, y)) continue;
      const v = ((x * 37 + y * 19 + x * y * 3 + 17) % 100) < 46;
      if (!v) continue;
      ctx.fillStyle = '#111827';
      ctx.fillRect(x * px, y * px, px, px);
    }
  }

  ctx.fillStyle = '#1890FF';
  ctx.fillRect((size / 2 - 2) * px, (size / 2 - 2) * px, 4 * px, 4 * px);
}

function openAuthGate(step = 'org') {
  qs('#auth-gate')?.classList.remove('hidden');
  qs('#main-app')?.classList.add('hidden');
  qs('#mode-selection')?.classList.add('hidden');
  const orgStep = qs('#auth-step-org');
  const stuStep = qs('#auth-step-student');
  if (step === 'student') {
    renderAuthStudents();
    renderMockLoginQr();
    orgStep?.classList.add('hidden');
    stuStep?.classList.remove('hidden');
  } else {
    orgStep?.classList.remove('hidden');
    stuStep?.classList.add('hidden');
  }
}

function closeAuthGate() {
  qs('#auth-gate')?.classList.add('hidden');
  qs('#main-app')?.classList.remove('hidden');
  qs('#mode-selection')?.classList.add('hidden');
}

function renderAuthStudents() {
  const sel = qs('#student-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">请选择学员</option>' + authState.students.map(s => (
    `<option value="${s.id}">${s.name} · ${s.phone || '-'} · ${s.carType || 'C1'}</option>`
  )).join('');
  const hints = qs('#auth-student-hints');
  if (hints) {
    const top = authState.students.slice(0, 3).map(s => `${s.name}:${s.loginAccount}/${s.loginPassword}`).join('；');
    hints.textContent = top ? `调试账号示例：${top}` : '暂无调试学员账号。';
  }
  renderTopStudentSwitcher();
}

function renderTopStudentSwitcher() {
  const sel = qs('#top-student-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">当前学员</option>' + authState.students.map(s => (
    `<option value="${s.id}">${s.name} · ${s.carType || 'C1'}</option>`
  )).join('');
  if (authState.activeStudentId) sel.value = authState.activeStudentId;
}

function openStudentManageModal() {
  if (!authState.org?.account) {
    openAuthGate('org');
    return;
  }
  const modal = qs('#student-manage-modal');
  if (!modal) return;
  const search = qs('#student-manage-search');
  if (search) search.value = '';
  renderStudentManageList('');
  modal.classList.remove('hidden');
}

function closeStudentManageModal() {
  qs('#student-manage-modal')?.classList.add('hidden');
}

function renderStudentManageList(keyword = '') {
  const listEl = qs('#student-manage-list');
  const summary = qs('#student-manage-summary');
  if (!listEl) return;
  const q = String(keyword || '').trim().toLowerCase();
  const list = authState.students.filter(s => {
    const text = `${s.name || ''} ${s.phone || ''}`.toLowerCase();
    return !q || text.includes(q);
  });
  if (summary) summary.textContent = `共 ${authState.students.length} 名学员，当前显示 ${list.length} 名`;
  if (!list.length) {
    listEl.innerHTML = '<div class="text-sm text-neutral py-4">暂无匹配学员。</div>';
    return;
  }
  listEl.innerHTML = list.map(s => {
    const isActive = s.id === authState.activeStudentId;
    return `
      <div class="border border-gray-200 rounded-lg p-3">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p class="font-medium">${s.name} ${isActive ? '<span class="badge badge-success ml-1">当前</span>' : ''}</p>
            <p class="text-xs text-neutral mt-1">手机号：${s.phone || '-'} · 车型：${s.carType || 'C1'}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-outline text-xs px-3 py-1" data-sm-act="switch" data-sm-id="${s.id}">切换</button>
            <button class="btn btn-secondary text-xs px-3 py-1" data-sm-act="edit" data-sm-id="${s.id}">编辑</button>
            <button class="btn btn-secondary text-xs px-3 py-1 text-error" data-sm-act="delete" data-sm-id="${s.id}">删除</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  qsa('[data-sm-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-sm-act');
      const sid = btn.getAttribute('data-sm-id');
      if (!sid) return;
      handleStudentManageAction(act, sid);
    });
  });
}

function handleStudentManageAction(act, sid) {
  const tip = qs('#student-manage-tip');
  if (tip) tip.textContent = '';
  const idx = authState.students.findIndex(s => s.id === sid);
  if (idx < 0) return;
  const stu = authState.students[idx];

  if (act === 'switch') {
    enterStudent(sid);
    closeStudentManageModal();
    return;
  }

  if (act === 'edit') {
    const name = prompt('学员姓名', stu.name || '') || stu.name || '';
    const phone = prompt('手机号', stu.phone || '') || '';
    const carType = (prompt('准驾车型（如 C1/C2/A1）', stu.carType || 'C1') || stu.carType || 'C1').toUpperCase();
    authState.students[idx] = { ...stu, name: name.trim() || stu.name, phone: phone.trim(), carType: carType.trim() || stu.carType || 'C1' };
    setOrgStudents(authState.org.account, authState.students);
    renderAuthStudents();
    updateSidebarIdentity();
    renderStudentManageList(qs('#student-manage-search')?.value || '');
    return;
  }

  if (act === 'delete') {
    const ok = confirm(`确认删除学员「${stu.name}」吗？该学员本地学习数据快照也会删除。`);
    if (!ok) return;
    if (sid === authState.activeStudentId) persistActiveStudentSnapshot();
    authState.students = authState.students.filter(s => s.id !== sid);
    setOrgStudents(authState.org.account, authState.students);
    localStorage.removeItem(getStudentSnapshotKey(authState.org.account, sid));

    if (!authState.students.length) {
      authState.activeStudentId = '';
      localStorage.removeItem(AUTH_KEYS.ACTIVE_STUDENT);
      updateSidebarIdentity();
      renderAuthStudents();
      closeStudentManageModal();
      openAuthGate('student');
      return;
    }

    if (sid === authState.activeStudentId) {
      enterStudent(authState.students[0].id);
      closeStudentManageModal();
      return;
    }
    renderAuthStudents();
    renderStudentManageList(qs('#student-manage-search')?.value || '');
  }
}

function bindStudentManageModal() {
  const modal = qs('#student-manage-modal');
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = '1';

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeStudentManageModal();
  });
  qs('#student-manage-close')?.addEventListener('click', closeStudentManageModal);
  qs('#student-manage-search')?.addEventListener('input', (e) => {
    renderStudentManageList(e.target?.value || '');
  });
}

function enterStudent(studentId) {
  if (!authState.org?.account || !studentId) return;
  if (authState.activeStudentId && authState.activeStudentId !== studentId) {
    persistActiveStudentSnapshot();
  }
  authState.activeStudentId = studentId;
  localStorage.setItem(AUTH_KEYS.ACTIVE_STUDENT, studentId);
  loadStudentSnapshot(authState.org.account, studentId);

  closeAuthGate();
  updateSidebarIdentity();
  renderTopStudentSwitcher();
  renderTrainingContext();
  renderStats();
  renderPlanSummary();
  renderGlobalCTA();
  renderExamPage();
  renderCrashCourse();
  renderReportPage();
  setPureSmartMode(false);
  showPage('home', '首页');
}

function logoutOrg() {
  persistActiveStudentSnapshot();
  authState = { org: null, activeStudentId: '', students: [] };
  setPureSmartMode(false);
  localStorage.removeItem(AUTH_KEYS.ACTIVE_STUDENT);
  setOrgSession(null);
  const tip = qs('#auth-tip');
  if (tip) tip.textContent = '';
  openAuthGate('org');
  updateSidebarIdentity();
  renderTopStudentSwitcher();
}

function bindAuthFlow() {
  const gate = qs('#auth-gate');
  if (!gate || gate.dataset.bound) return;
  gate.dataset.bound = '1';
  bindStudentManageModal();
  bindContextModal();

  const tip = qs('#auth-tip');
  const setTip = (msg) => { if (tip) tip.textContent = msg || ''; };

  qs('#org-login-btn')?.addEventListener('click', () => {
    const account = String(qs('#org-account')?.value || '').trim();
    const password = String(qs('#org-password')?.value || '').trim();
    if (!account || !password) {
      setTip('请输入驾校账号和密码。');
      return;
    }
    authState.org = { account, orgName: '', loginAt: Date.now() };
    setOrgSession(authState.org);
    authState.students = normalizeStudents(getOrgStudents(account));
    setOrgStudents(account, authState.students);
    authState.activeStudentId = '';
    renderAuthStudents();
    setTip('');
    openAuthGate('student');
  });

  qs('#org-logout-btn')?.addEventListener('click', () => {
    setTip('');
    logoutOrg();
  });

  qs('#bind-selected-student')?.addEventListener('click', () => {
    const sid = String(qs('#student-select')?.value || '');
    if (!sid) {
      setTip('请先选择要绑定的学员。');
      return;
    }
    setTip('');
    enterStudent(sid);
  });

  qs('#student-password-login-btn')?.addEventListener('click', () => {
    const acc = String(qs('#student-login-account')?.value || '').trim().toLowerCase();
    const pwd = String(qs('#student-login-password')?.value || '').trim();
    if (!acc || !pwd) {
      setTip('请输入学员账号和密码。');
      return;
    }
    const stu = authState.students.find(s => s.loginAccount === acc && String(s.loginPassword || '') === pwd);
    if (!stu) {
      setTip('学员账号或密码错误，请确认后重试。');
      return;
    }
    setTip('');
    enterStudent(stu.id);
  });

  qs('#student-scan-login-btn')?.addEventListener('click', () => {
    // 演示模式：点击后自动生成一个 mock 学员并登录
    const stamp = Date.now().toString().slice(-6);
    const mock = normalizeStudents([{
      id: `stu_scan_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: `扫码学员${stamp.slice(-3)}`,
      phone: `1390000${stamp.slice(-4)}`,
      carType: 'C1',
      loginAccount: `scan${stamp}`,
      loginPassword: '123456',
      createdAt: Date.now()
    }])[0];
    authState.students = [mock, ...authState.students];
    setOrgStudents(authState.org.account, authState.students);
    renderAuthStudents();
    setTip('');
    enterStudent(mock.id);
  });

  qs('#create-student-btn')?.addEventListener('click', () => {
    if (!authState.org?.account) {
      setTip('请先完成驾校登录。');
      openAuthGate('org');
      return;
    }
    const name = String(qs('#new-student-name')?.value || '').trim();
    const phone = String(qs('#new-student-phone')?.value || '').trim();
    const carType = String(qs('#new-student-car-type')?.value || 'C1').trim();
    if (!name) {
      setTip('请填写学员姓名。');
      return;
    }
    const student = {
      id: `stu_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name,
      phone,
      carType,
      loginAccount: '',
      loginPassword: '',
      createdAt: Date.now()
    };
    authState.students = normalizeStudents([student, ...authState.students]);
    setOrgStudents(authState.org.account, authState.students);
    renderAuthStudents();
    const sel = qs('#student-select');
    if (sel) sel.value = student.id;
    setTip('');
    enterStudent(student.id);
  });
}

function initAuthGate() {
  bindAuthFlow();
  const org = getOrgSession();
  if (!org?.account) {
    openAuthGate('org');
    return;
  }
  authState.org = org;
  authState.students = normalizeStudents(getOrgStudents(org.account));
  setOrgStudents(org.account, authState.students);
  renderAuthStudents();
  const active = String(localStorage.getItem(AUTH_KEYS.ACTIVE_STUDENT) || '');
  if (active && authState.students.some(s => s.id === active)) {
    enterStudent(active);
    return;
  }
  openAuthGate('student');
  updateSidebarIdentity();
}

async function main() {
  await loadQuestions();
  if (!QUESTIONS.length) showQuestionLoadHint();
  bindEvents();
  bindGlobalCTA();
  renderStats();
  renderPlanSummary();
  renderGlobalCTA();
  renderExamPage();
  renderTrainingContext();
  initAuthGate();
  window.addEventListener('beforeunload', persistActiveStudentSnapshot);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistActiveStudentSnapshot();
  });
}

window.addEventListener('load', main);

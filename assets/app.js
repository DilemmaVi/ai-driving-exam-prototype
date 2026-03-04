// assets/app.js
import {
  getExamDate,
  setExamDate,
  getProgress,
  upsertAnswer,
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
  setSettings
} from './storage.js';

let QUESTIONS = [];
let currentIndex = 0;

async function loadQuestions() {
  const res = await fetch('./data/questions.json', { cache: 'no-store' });
  QUESTIONS = await res.json();
}

function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

function showPage(pageId, title) {
  qsa('.page-content').forEach(p => p.classList.add('hidden'));
  qs('#' + pageId)?.classList.remove('hidden');
  if (title) qs('#page-title').textContent = title;
  qsa('.nav-item').forEach(n => n.classList.remove('active'));
  qs(`.nav-item[data-target="${pageId}"]`)?.classList.add('active');

  // 进入诊断页时刷新诊断状态
  if (pageId === 'diagnosis') {
    renderDiagnosisHome();
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function calcDailyTarget(total, done, examDate) {
  let dailyTarget = 50;
  if (examDate) {
    const today = new Date();
    const exam = new Date(examDate);
    const diff = Math.ceil((exam.getTime() - today.getTime()) / (1000 * 3600 * 24));
    const remain = Math.max(total - done, 0);
    if (diff > 0) {
      dailyTarget = Math.ceil(remain / diff);
      dailyTarget = Math.max(20, Math.min(100, dailyTarget));
    }
  }
  return dailyTarget;
}

function renderPlanSummary() {
  const examDate = getExamDate();
  const progress = getProgress();
  const total = QUESTIONS.length || 0;
  const done = progress.doneCount || 0;

  const dailyTarget = calcDailyTarget(total, done, examDate);
  const daily = getDaily();
  const today = todayStr();
  const todayRec = daily.byDate?.[today] || { done: 0, correct: 0 };
  const todayDone = todayRec.done || 0;
  const todayAcc = todayDone ? Math.round((todayRec.correct / todayDone) * 100) : 0;

  const planEl = qs('#plan-summary');
  if (!planEl) return;

  const pct = Math.min(100, Math.round((todayDone / dailyTarget) * 100));

  planEl.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <p class="text-neutral">今日目标</p>
        <p class="text-2xl font-bold mt-1">${todayDone}/${dailyTarget} 题</p>
        <p class="text-sm text-neutral mt-1">今日正确率：${todayAcc}% · 总进度：${done}/${total}</p>
      </div>
      <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <i class="fa fa-bullseye text-primary text-2xl"></i>
      </div>
    </div>
    <div class="mt-4">
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width: ${pct}%"></div>
      </div>
      <p class="text-sm text-neutral mt-2">建议：优先完成今日目标，并复盘解析与笔记。</p>
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

let practiceMode = 'all'; // all | wrong | smart | knowledge
let wrongQueue = [];
let knowledgeQueue = [];
let knowledgeTitle = '';

function getCurrentQuestion() {
  if (practiceMode === 'wrong') return wrongQueue[currentIndex];
  if (practiceMode === 'knowledge') return knowledgeQueue[currentIndex];
  return QUESTIONS[currentIndex];
}

function getCurrentTotal() {
  if (practiceMode === 'wrong') return wrongQueue.length;
  if (practiceMode === 'knowledge') return knowledgeQueue.length;
  return QUESTIONS.length;
}

function smartScoreQuestion(q, km, progress, now) {
  const kid = q.knowledgeId || 'law.basic';
  const m = km[kid]?.mastery ?? 0.5;
  const freq = Number(q.frequency || 3);
  const lastTs = km[kid]?.lastTs || 0;
  const days = lastTs ? (now - lastTs) / (1000 * 3600 * 24) : 999;
  const recencyBoost = Math.min(1.3, 0.8 + Math.min(7, days) / 10); // 0.8~1.3
  const base = (1 - m) * (0.6 + 0.1 * freq) * recencyBoost;
  const donePenalty = progress.answered?.[q.id] ? 0.85 : 1.0;
  return base * donePenalty;
}

function pickSmartIndex() {
  const progress = getProgress();
  const km = getKnowledgeMastery();
  const now = Date.now();

  const unanswered = QUESTIONS.filter(q => !progress.answered?.[q.id]);
  const pool = unanswered.length ? unanswered : QUESTIONS;

  let best = pool[0];
  let bestScore = -Infinity;
  for (const q of pool) {
    const s = smartScoreQuestion(q, km, progress, now);
    if (s > bestScore) {
      bestScore = s;
      best = q;
    }
  }

  const idx = QUESTIONS.findIndex(x => x.id === best.id);
  return Math.max(0, idx);
}

function renderQuestion() {
  const q = getCurrentQuestion();
  if (!q) return;

  const progress = getProgress();
  const answered = progress.answered?.[q.id];

  qs('#q-index').textContent = String(currentIndex + 1);
  qs('#q-total').textContent = String(getCurrentTotal());
  qs('#q-id').textContent = q.id;
  qs('#q-stem').textContent = q.stem;
  qs('#q-tags').innerHTML = (q.tags || []).map(t => `<span class="badge badge-warning">${t}</span>`).join('')
    + (practiceMode === 'wrong' ? '<span class="badge badge-error">错题重练</span>' : '')
    + (practiceMode === 'knowledge' ? `<span class="badge badge-success">专项：${knowledgeTitle || kName}</span>` : '');

  // 收藏
  const favBtn = qs('#btn-fav');
  const fav = isFavorite(q.id);
  favBtn.innerHTML = fav
    ? '<i class="fa fa-star mr-2"></i>已收藏'
    : '<i class="fa fa-star-o mr-2"></i>收藏';

  // options
  const optWrap = qs('#q-options');
  optWrap.innerHTML = '';

  const typeLabel = q.type === 'tf' ? '判断题' : '单选题';
  const kName = KNOWLEDGE_DICT[q.knowledgeId] || q.knowledgeName || '未标注知识点';
  const km = getKnowledgeMastery();
  const mastery = km[q.knowledgeId]?.mastery;
  const masteryText = (typeof mastery === 'number') ? ` · 知识点：${kName}（掌握度 ${(mastery * 100).toFixed(0)}%）` : ` · 知识点：${kName}`;

  qs('#q-type').textContent = typeLabel + masteryText;

  const reasonEl = qs('#smart-reason');
  if (reasonEl) {
    if (practiceMode === 'smart') {
      const freq = Number(q.frequency || 3);
      const m = (typeof mastery === 'number') ? mastery : 0.5;
      reasonEl.textContent = `推荐原因：高频权重 ${freq}/5 + 当前掌握度 ${(m * 100).toFixed(0)}%（优先补短板）`;
      reasonEl.classList.remove('hidden');
    } else if (practiceMode === 'knowledge') {
      reasonEl.textContent = `专项练习：${knowledgeTitle || kName} · 剩余 ${Math.max(0, getCurrentTotal() - (currentIndex + 1))} 题`;
      reasonEl.classList.remove('hidden');
    } else {
      reasonEl.classList.add('hidden');
    }
  }

  const selected = answered?.selected;
  const locked = typeof selected === 'number';

  q.options.forEach((text, idx) => {
    const item = document.createElement('div');
    item.className = 'question-option';

    // 状态样式
    if (locked) {
      if (idx === q.answer) item.classList.add('correct');
      if (idx === selected && idx !== q.answer) item.classList.add('incorrect');
    } else if (idx === selected) {
      item.classList.add('selected');
    }

    item.innerHTML = `
      <input type="radio" name="qopt" ${locked ? 'disabled' : ''} ${selected === idx ? 'checked' : ''} />
      <span>${q.type === 'tf' ? '' : String.fromCharCode(65 + idx) + '. '}${text}</span>
    `;

    item.addEventListener('click', () => {
      if (locked) return;
      const correct = idx === q.answer;

      // 记录做题
      upsertAnswer(q.id, idx, correct, { wrongClearThreshold: 2 });
      // 更新知识点掌握度
      updateKnowledgeMastery(q.knowledgeId, correct, { frequency: q.frequency, difficulty: q.difficulty });

      // 专项模式：错题插队（1-2题后再出现一次）
      if (practiceMode === 'knowledge' && !correct) {
        const insertPos = Math.min(knowledgeQueue.length, currentIndex + 2);
        knowledgeQueue.splice(insertPos, 0, q);
      }

      // 智能模式：答完自动跳下一题（加速）
      if (practiceMode === 'smart') {
        currentIndex = pickSmartIndex();
      }

      renderQuestion();
      renderStats();
      renderPlanSummary();

      // 若在错题模式下答对后被自动移出，可能导致队列变化，这里轻量刷新错题本数据
      if (practiceMode === 'wrong') {
        const ids = getWrongList();
        const map = new Map(QUESTIONS.map(q => [q.id, q]));
        wrongQueue = ids.map(id => map.get(id)).filter(Boolean);
        if (currentIndex >= wrongQueue.length) currentIndex = Math.max(0, wrongQueue.length - 1);
      }
    });

    optWrap.appendChild(item);
  });

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
  const note = getNote(q.id);
  const noteEl = qs('#q-note');
  noteEl.value = note;

  // buttons state
  qs('#btn-prev').disabled = currentIndex === 0;
  qs('#btn-next').disabled = currentIndex === getCurrentTotal() - 1;
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
}

function bindEvents() {
  // 导航
  qsa('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
      const target = this.getAttribute('data-target');
      const titles = {
        'home': '首页',
        'diagnosis': '智能诊断',
        'learning': '个性学习',
        'practice': '练题',
        'wrongbook': '错题本',
        'plan': '今日计划',
        'question-bank': '题库',
        'exam': '模拟考试',
        'wrong-questions': '错题管理',
        'crash-course': '考前冲刺',
        'report': '学习报告'
      };
      showPage(target, titles[target] || '');
      if (target === 'practice') {
        renderQuestion();
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
    });
  });

  // 练题按钮
  qs('#btn-prev').addEventListener('click', () => {
    if (currentIndex > 0) currentIndex -= 1;
    renderQuestion();
  });
  qs('#btn-next').addEventListener('click', () => {
    if (practiceMode === 'smart') {
      currentIndex = pickSmartIndex();
    } else {
      if (currentIndex < getCurrentTotal() - 1) currentIndex += 1;
    }
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
    practiceMode = 'smart';
    currentIndex = pickSmartIndex();
    showPage('practice', '练题');
    renderQuestion();
  });

  // 模式切换
  qsa('[data-practice-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      practiceMode = btn.getAttribute('data-practice-mode');
      qsa('[data-practice-mode]').forEach(b => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');

      if (practiceMode === 'smart') {
        currentIndex = pickSmartIndex();
      } else if (practiceMode === 'wrong') {
        startWrongPractice();
        return;
      } else {
        currentIndex = 0;
      }
      renderQuestion();
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

  // 从个性学习页/首页进入练题
  qsa('[data-go-practice="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      practiceMode = 'all';
      currentIndex = 0;
      showPage('practice', '练题');
      renderQuestion();
    });
  });

  const wrongStart = qs('#btn-wrong-start');
  if (wrongStart) {
    wrongStart.addEventListener('click', () => {
      startWrongPractice();
    });
  }

  // 同步考试日期：复用首页 date picker 的 confirm
  const confirm = qs('#confirm-date');
  if (confirm) {
    confirm.addEventListener('click', () => {
      const examDate = qs('#exam-date')?.value;
      if (examDate) setExamDate(examDate);
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
  const ids = getWrongList();
  const map = new Map(QUESTIONS.map(q => [q.id, q]));
  wrongQueue = ids.map(id => map.get(id)).filter(Boolean);
  practiceMode = 'wrong';
  currentIndex = 0;
  showPage('practice', '错题重练');
  renderQuestion();
}

// ======================
// 智能诊断（50题）
// ======================
const DIAG_TOTAL = 100;
const DIAG_DURATION_SEC = 45 * 60;

function buildDiagnosisQueue() {
  // 半自适应：先覆盖知识点，再偏薄弱高频（不足则循环补齐）
  const km = getKnowledgeMastery();
  const now = Date.now();
  const progress = getProgress();

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
    .map(q => ({ q, s: smartScoreQuestion(q, km, progress, now) }))
    .sort((a, b) => b.s - a.s)
    .map(x => x.q);

  const queue = [...cover, ...rest].slice(0, DIAG_TOTAL).map(q => q.id);

  // 若题库不足 DIAG_TOTAL，允许重复（循环补齐）
  let i = 0;
  const fallback = rest.length ? rest : QUESTIONS;
  while (queue.length < DIAG_TOTAL && fallback.length) {
    queue.push(fallback[i % fallback.length].id);
    i += 1;
    if (i > 10000) break;
  }

  return queue;
}

let diagTimer = null;

function startDiagnosis(reset = false) {
  if (reset) clearDiagnosis();
  let d = getDiagnosis();

  if (!d.queue?.length) {
    const queue = buildDiagnosisQueue();
    d = {
      status: 'running',
      queue,
      cursor: 0,
      answers: {},
      startedAt: Date.now(),
      finishedAt: 0,
      durationSec: DIAG_DURATION_SEC
    };
  } else {
    d.status = 'running';
    d.durationSec = d.durationSec || DIAG_DURATION_SEC;
  }

  setDiagnosis(d);
  renderDiagnosisQuiz();
}

function finishDiagnosis() {
  const d = getDiagnosis();
  d.status = 'done';
  d.finishedAt = Date.now();
  setDiagnosis(d);
  renderDiagnosisReport();
}

function diagnosisCurrentQuestion() {
  const d = getDiagnosis();
  const id = d.queue?.[d.cursor];
  return QUESTIONS.find(q => q.id === id);
}

function renderDiagnosisHome() {
  const d = getDiagnosis();
  const box = qs('#diagnosis-box');
  if (!box) return;

  const total = (d.queue && d.queue.length) ? d.queue.length : DIAG_TOTAL;
  const cur = d.cursor || 0;

  let statusText = '未开始';
  if (d.status === 'running') statusText = `进行中：${cur}/${total}`;
  if (d.status === 'done') statusText = '已完成';

  const examDate = getExamDate();

  box.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h4 class="text-lg font-bold">100题智能诊断（模拟考试）</h4>
        <p class="text-neutral mt-1">状态：<span class="font-medium">${statusText}</span> · 考试日期：<span class="font-medium">${examDate || '未设置'}</span></p>
        <p class="text-sm text-neutral mt-2">说明：当前为 Mock 题库，若题量不足会循环补齐到100题用于流程演示。完成后将输出薄弱知识点TOP、提分清单，并可一键进入智能加速练习。</p>
      </div>
      <div class="flex gap-2">
        ${d.status === 'running' ? '<button class="btn btn-primary" id="btn-diag-continue">继续诊断</button>' : '<button class="btn btn-primary" id="btn-diag-start">开始诊断</button>'}
        ${d.status !== 'idle' ? '<button class="btn btn-outline" id="btn-diag-reset">重新开始</button>' : ''}
        ${d.status === 'done' ? '<button class="btn btn-secondary" id="btn-diag-report">查看报告</button>' : ''}
      </div>
    </div>
  `;

  qs('#btn-diag-start')?.addEventListener('click', () => startDiagnosis(true));
  qs('#btn-diag-continue')?.addEventListener('click', () => startDiagnosis(false));
  qs('#btn-diag-reset')?.addEventListener('click', () => startDiagnosis(true));
  qs('#btn-diag-report')?.addEventListener('click', () => renderDiagnosisReport());
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

      <div class="mt-4 space-y-3" id="diag-options"></div>

      <div class="mt-4 hidden" id="diag-analysis">
        <div class="p-4 rounded-lg border border-gray-200 bg-gray-50">
          <div class="mb-2" id="diag-result"></div>
          <p class="text-sm"><strong>解析：</strong><span id="diag-analysis-text"></span></p>
          <div class="flex justify-end mt-4">
            <button class="btn btn-primary" id="btn-diag-next">下一题</button>
          </div>
        </div>
      </div>

      <div class="mt-4 hidden" id="diag-next-only">
        <div class="flex justify-end">
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

  qs('#btn-diag-exit')?.addEventListener('click', () => {
    // 回到诊断首页状态（保留进度）
    if (diagTimer) clearInterval(diagTimer);
    area.classList.add('hidden');
    renderDiagnosisHome();
  });

  const answered = d.answers?.[q.id];
  const locked = typeof answered?.selected === 'number';

  const optWrap = qs('#diag-options');
  optWrap.innerHTML = '';
  q.options.forEach((text, oi) => {
    const item = document.createElement('div');
    item.className = 'question-option';

    if (locked) {
      if (oi === q.answer) item.classList.add('correct');
      if (oi === answered.selected && oi !== q.answer) item.classList.add('incorrect');
    }

    item.innerHTML = `
      <input type="radio" name="diagopt" ${locked ? 'disabled' : ''} ${answered?.selected === oi ? 'checked' : ''} />
      <span>${q.type === 'tf' ? '' : String.fromCharCode(65 + oi) + '. '}${text}</span>
    `;

    item.addEventListener('click', () => {
      if (locked) return;
      const correct = oi === q.answer;
      d.answers = d.answers || {};
      d.answers[q.id] = { selected: oi, correct, ts: Date.now() };
      setDiagnosis(d);

      // 诊断也更新知识点掌握度（同一套模型）
      updateKnowledgeMastery(q.knowledgeId, correct, { frequency: q.frequency, difficulty: q.difficulty });

      const s = getSettings();
      if (s.diagnosisShowAnalysis) {
        // 显示解析并等待“下一题”
        const box = qs('#diag-analysis');
        box.classList.remove('hidden');
        qs('#diag-analysis-text').textContent = q.analysis || '暂无解析';
        qs('#diag-result').innerHTML = correct
          ? '<span class="text-success font-medium"><i class="fa fa-check-circle mr-2"></i>回答正确</span>'
          : '<span class="text-error font-medium"><i class="fa fa-times-circle mr-2"></i>回答错误</span>';
      } else {
        // 不显示解析：直接给“下一题”按钮
        const nextOnly = qs('#diag-next-only');
        nextOnly.classList.remove('hidden');
      }
    });

    optWrap.appendChild(item);
  });

  function goNext() {
    const d2 = getDiagnosis();
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

  report.innerHTML = `
    <div class="card mb-6">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h4 class="text-lg font-bold">诊断报告</h4>
          <p class="text-neutral mt-1">预测得分（加权）：<span class="text-primary font-bold text-xl">${score}</span> 分</p>
          <p class="text-sm text-neutral mt-2">口径：知识点掌握度按题库考频（frequency）加权，优先反映“高频短板”。</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary" id="btn-go-smart">一键进入智能加速练习</button>
          <button class="btn btn-outline" id="btn-diag-redo">重新诊断</button>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h5 class="font-bold mb-3">提分清单 TOP5（ROI）</h5>
          <div class="space-y-3">
            ${topROI.map(r => {
              const pct = Math.round(r.mastery * 100);
              const roi = r.roi.toFixed(1);
              return `
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center justify-between gap-4">
                    <div>
                      <p class="font-medium">${r.name}</p>
                      <p class="text-sm text-neutral mt-1">掌握度：${pct}% · 权重：${r.weight} · 提分潜力：${roi}</p>
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

        <div>
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
                    <div class="w-40">
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

  qsa('[data-roi-practice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kid = btn.getAttribute('data-roi-practice');
      startKnowledgePractice(kid, 20);
    });
  });

  qs('#btn-go-smart')?.addEventListener('click', () => {
    // 跳转练题并进入智能模式
    practiceMode = 'smart';
    currentIndex = pickSmartIndex();
    showPage('practice', '练题');
    renderQuestion();
  });
  qs('#btn-diag-redo')?.addEventListener('click', () => {
    startDiagnosis(true);
  });

  // 标记 done
  const d = getDiagnosis();
  if (d.status !== 'done') {
    d.status = 'done';
    d.finishedAt = Date.now();
    setDiagnosis(d);
  }
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
          <p class="text-sm text-neutral">${q.id} · ${(q.type === 'tf' ? '判断' : '单选')} · ${(q.tags || []).join(' / ')}</p>
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

function renderPlanPage() {
  const examDate = getExamDate();
  const examEl = qs('#plan-exam-date');
  if (examEl) examEl.textContent = examDate || '未设置';
  const progress = getProgress();
  const total = QUESTIONS.length;
  const done = progress.doneCount || 0;
  const dailyTarget = calcDailyTarget(total, done, examDate);

  const daily = getDaily();
  const today = todayStr();
  const todayRec = daily.byDate?.[today] || { done: 0, correct: 0 };
  const todayDone = todayRec.done || 0;
  const todayAcc = todayDone ? Math.round((todayRec.correct / todayDone) * 100) : 0;

  const remain = Math.max(total - done, 0);
  const pct = dailyTarget ? Math.min(100, Math.round((todayDone / dailyTarget) * 100)) : 0;

  const box = qs('#plan-box');
  box.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="card">
        <p class="text-neutral">今日完成</p>
        <p class="text-2xl font-bold mt-1">${todayDone}/${dailyTarget}</p>
        <div class="progress-bar mt-3"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="card">
        <p class="text-neutral">今日正确率</p>
        <p class="text-2xl font-bold mt-1">${todayAcc}%</p>
        <p class="text-sm text-neutral mt-1">（今日正确 ${todayRec.correct} 题）</p>
      </div>
      <div class="card">
        <p class="text-neutral">剩余题量</p>
        <p class="text-2xl font-bold mt-1">${remain}</p>
        <p class="text-sm text-neutral mt-1">总进度：${done}/${total}</p>
      </div>
    </div>
  `;
}

function renderQuestionBank() {
  const wrap = qs('#bank-list');
  const progress = getProgress();
  const fav = new Set(JSON.parse(localStorage.getItem('qa.favorites') || '[]'));

  wrap.innerHTML = QUESTIONS.map((q, idx) => {
    const a = progress.answered?.[q.id];
    const status = a ? (a.correct ? '<span class="badge badge-success">已掌握</span>' : '<span class="badge badge-error">未掌握</span>') : '<span class="badge">未做</span>';
    const star = fav.has(q.id) ? '<i class="fa fa-star text-warning"></i>' : '<i class="fa fa-star-o text-neutral"></i>';
    return `
      <div class="border border-gray-200 rounded-lg p-3 hover:border-primary transition-all">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-neutral">#${idx + 1} · ${q.id} · ${(q.type === 'tf' ? '判断' : '单选')} · ${(q.tags || []).join(' / ')}</p>
            <p class="font-medium mt-1">${q.stem}</p>
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
}

async function main() {
  await loadQuestions();
  bindEvents();
  renderStats();
  renderPlanSummary();
}

window.addEventListener('load', main);

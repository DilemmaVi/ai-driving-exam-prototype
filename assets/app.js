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
  getDaily
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

let practiceMode = 'all'; // all | wrong
let wrongQueue = [];

function getCurrentQuestion() {
  if (practiceMode === 'wrong') return wrongQueue[currentIndex];
  return QUESTIONS[currentIndex];
}

function getCurrentTotal() {
  return practiceMode === 'wrong' ? wrongQueue.length : QUESTIONS.length;
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
    + (practiceMode === 'wrong' ? '<span class="badge badge-error">错题重练</span>' : '');

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
  qs('#q-type').textContent = typeLabel;

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
      upsertAnswer(q.id, idx, correct, { wrongClearThreshold: 2 });
      renderQuestion();
      renderStats();
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
    if (currentIndex < getCurrentTotal() - 1) currentIndex += 1;
    renderQuestion();
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

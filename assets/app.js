// assets/app.js
import {
  getExamDate,
  setExamDate,
  getProgress,
  upsertAnswer,
  isFavorite,
  toggleFavorite,
  getNote,
  setNote
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

function renderPlanSummary() {
  const examDate = getExamDate();
  const progress = getProgress();
  const total = QUESTIONS.length || 0;
  const done = progress.doneCount || 0;

  // 简单今日目标：默认50题；若剩余题数少于50则取剩余；若设置了考试日期，则按天数摊分（上限100，下限20）
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

  const todayDone = Math.min(dailyTarget, 0); // 先不做按日统计（后续可加），这里展示“目标”即可

  const planEl = qs('#plan-summary');
  if (!planEl) return;
  planEl.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <p class="text-neutral">今日目标</p>
        <p class="text-2xl font-bold mt-1">${dailyTarget} 题</p>
        <p class="text-sm text-neutral mt-1">总进度：${done}/${total}</p>
      </div>
      <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <i class="fa fa-bullseye text-primary text-2xl"></i>
      </div>
    </div>
    <div class="mt-4">
      <p class="text-sm text-neutral">建议：优先完成 ${dailyTarget} 题练习，并复盘解析与笔记。</p>
    </div>
  `;
}

function renderQuestion() {
  const q = QUESTIONS[currentIndex];
  if (!q) return;

  const progress = getProgress();
  const answered = progress.answered?.[q.id];

  qs('#q-index').textContent = String(currentIndex + 1);
  qs('#q-total').textContent = String(QUESTIONS.length);
  qs('#q-id').textContent = q.id;
  qs('#q-stem').textContent = q.stem;
  qs('#q-tags').innerHTML = (q.tags || []).map(t => `<span class="badge badge-warning">${t}</span>`).join('');

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
      upsertAnswer(q.id, idx, correct);
      renderQuestion();
      renderStats();
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
  qs('#btn-next').disabled = currentIndex === QUESTIONS.length - 1;
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
        'exam': '模拟考试',
        'wrong-questions': '错题管理',
        'crash-course': '考前冲刺',
        'report': '学习报告'
      };
      showPage(target, titles[target] || '');
      if (target === 'practice') {
        renderQuestion();
      }
    });
  });

  // 练题按钮
  qs('#btn-prev').addEventListener('click', () => {
    if (currentIndex > 0) currentIndex -= 1;
    renderQuestion();
  });
  qs('#btn-next').addEventListener('click', () => {
    if (currentIndex < QUESTIONS.length - 1) currentIndex += 1;
    renderQuestion();
  });
  qs('#btn-fav').addEventListener('click', () => {
    const q = QUESTIONS[currentIndex];
    toggleFavorite(q.id);
    renderQuestion();
  });
  qs('#q-note').addEventListener('input', (e) => {
    const q = QUESTIONS[currentIndex];
    setNote(q.id, e.target.value);
  });

  // 从个性学习页/首页进入练题
  qsa('[data-go-practice="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      showPage('practice', '练题');
      renderQuestion();
    });
  });

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

async function main() {
  await loadQuestions();
  bindEvents();
  renderStats();
  renderPlanSummary();
}

window.addEventListener('load', main);

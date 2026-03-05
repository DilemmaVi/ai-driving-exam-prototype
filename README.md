# AI Driving Exam Prototype (科目一·学员学习系统)

纯静态网页原型，支持 GitHub Pages 发布。

## 题库来源（当前）
- 当前 `data/questions.json` 基于 MySQL `subject_bases` 全量同步（1883 题）。
- 同步口径：`驾驶证==>小车==>科目一==>顺序练习`，仅保留 `question_type in (1,2)`（判断/单选）。
- 字段映射：
  - `id`: `sb-{subject_bases.id}`
  - `type`: `1 -> tf`，`2 -> single`
  - `stem/options/analysis`: 去除 `【】/｛｝` 标记
  - `answer`: `answer_correct[0] - 1`（转为 0-based）
  - `imgUrl`: `img_url`（题目配图，前端支持相对路径自动补全）
- 知识点说明：
  - 导出数据统一落为基础字段，前端加载时会按题干/选项/解析关键词自动归类到知识点（用于智能练习、专项练习、诊断报告）。
- 冲刺专项模拟说明：
  - 考前冲刺中的“薄弱知识点专项模拟”按该知识点实际题量组卷，题量为 `min(该知识点题量, 100)`，不做重复补题。

## 本地预览
```bash
cd projects/active/ai-driving-exam-prototype
python3 -m http.server 5173
```
浏览器打开： http://127.0.0.1:5173/

## 功能（当前）
- 账号与学员：支持“驾校登录 + 学员登录（扫码/账号密码/调试创建）”，学员数据独立保存与切换
- 训练上下文：支持城市/车型/科目设置（`qa.trainingContext`），用于个性化学习引导
- 首页“今日3步任务”：弱项专项20题 -> 到期复习 -> 快速模考，支持自动进度打勾与下一步直达
- 智能诊断：100题、45分钟；支持继续/重置、显示解析开关、完成后生成诊断报告
- 练题模式：`顺序`（未做优先/全量顺序）/`智能`/`复习`/`错题`/`专项`
- 智能练题：支持同知识点锁定组练（`5/10/20/30/40/50`），并显示每组小结
- 错题闭环：答错自动入错题本；同题连续答对2次自动移出；支持错因标记（记忆/理解/粗心/陷阱）
- 学习报告：包含通过预测、薄弱知识点、错因分布、复习执行、专属学习画像（高效学习时段/主错因/主攻弱项）
- 题库：支持搜索、状态/题型/知识点/收藏筛选、分页、列表/按知识点视图、筛选开练
- 考前冲刺：统一走模拟考试流程；薄弱知识点“专项模拟”按该知识点实际题量组卷（上限100，不强补）

## 数据存储（localStorage keys）
- `qa.examDate`：考试日期（YYYY-MM-DD）
- `qa.progress`：做题记录与完成数量
- `qa.favorites`：收藏题目 id 列表
- `qa.notes`：题目笔记
- `qa.wrong`：错题题目 id 列表
- `qa.wrongStreak`：错题消除计数（同一题连续答对次数）
- `qa.daily`：按天统计（done/correct）
- `qa.knowledgeMastery`：知识点掌握度（mastery/attempts/correct/lastTs）
- `qa.diagnosis`：100题诊断状态（queue/cursor/answers/startedAt/finishedAt/durationSec）
- `qa.settings`：用户设置（diagnosisShowAnalysis、smartLockN）
- `qa.wrongReason`：错因选择（questionId -> memory/understand/careless/trap）
- `qa.review`：到期复习调度（questionId -> nextTs/intervalDays）
- `qa.examHistory`：模拟考试历史记录（最近 50 次，含每题作答明细用于错题回放）
- `qa.learnerProfile`：学习画像（总作答/正确率/连续表现/错因统计/按知识点与时段分布）
- `qa.learningEvents`：学习行为事件流（最近 500 条，用于今日任务进度与个性化反馈）
- `qa.trainingContext`：训练上下文（city/carType/subject）
- `qa.orgSession` / `qa.activeStudent` / `qa.orgStudents.*` / `qa.snapshot.*`：驾校-学员登录态与学员数据快照

## 如何清空本地数据
在浏览器控制台执行：
```js
localStorage.removeItem('qa.examDate');
localStorage.removeItem('qa.progress');
localStorage.removeItem('qa.favorites');
localStorage.removeItem('qa.notes');
localStorage.removeItem('qa.wrong');
localStorage.removeItem('qa.wrongStreak');
localStorage.removeItem('qa.daily');
localStorage.removeItem('qa.knowledgeMastery');
localStorage.removeItem('qa.diagnosis');
localStorage.removeItem('qa.settings');
localStorage.removeItem('qa.wrongReason');
localStorage.removeItem('qa.review');
localStorage.removeItem('qa.examHistory');
localStorage.removeItem('qa.learnerProfile');
localStorage.removeItem('qa.learningEvents');
localStorage.removeItem('qa.trainingContext');
localStorage.removeItem('qa.orgSession');
localStorage.removeItem('qa.activeStudent');
```
或在浏览器设置里清空站点数据。

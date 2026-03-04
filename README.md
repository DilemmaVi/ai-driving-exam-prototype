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
- 知识点说明：
  - 导出数据统一落为基础字段，前端加载时会按题干/选项/解析关键词自动归类到知识点（用于智能练习、专项练习、诊断报告）。

## 本地预览
```bash
cd projects/active/ai-driving-exam-prototype
python3 -m http.server 5173
```
浏览器打开： http://127.0.0.1:5173/

## 功能（当前）
- 左侧导航新增：`练题` / `错题本` / `今日计划` / `题库`
- 练题支持：单选/判断、上一题/下一题、答题后显示对错与解析、收藏、笔记
- 练题支持：单选/判断/多选（多选需提交判题）、上一题/下一题、答题后显示对错与解析、收藏、笔记
- 错题本：答错自动入错题；支持错题重练；支持从错题本移除
- 今日计划：根据考试日期与剩余题量生成今日目标，并统计“今日完成/今日正确率”
- 题库：展示每题状态（未做/已掌握/未掌握）并可跳转到指定题

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
```
或在浏览器设置里清空站点数据。

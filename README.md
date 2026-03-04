# AI Driving Exam Prototype (科目一·学员学习系统)

纯静态网页原型，支持 GitHub Pages 发布。

## 本地预览
```bash
cd projects/active/ai-driving-exam-prototype
python3 -m http.server 5173
```
浏览器打开： http://127.0.0.1:5173/

## 功能（当前）
- 左侧导航新增：`练题` / `错题本` / `今日计划` / `题库`
- 练题支持：单选/判断、上一题/下一题、答题后显示对错与解析、收藏、笔记
- 错题本：答错自动入错题；支持错题重练；支持从错题本移除
- 今日计划：根据考试日期与剩余题量生成今日目标，并统计“今日完成/今日正确率”
- 题库：展示每题状态（未做/已掌握/未掌握）并可跳转到指定题

## 数据存储（localStorage keys）
- `qa.examDate`：考试日期（YYYY-MM-DD）
- `qa.progress`：做题记录与完成数量
- `qa.favorites`：收藏题目 id 列表
- `qa.notes`：题目笔记
- `qa.wrong`：错题题目 id 列表
- `qa.daily`：按天统计（done/correct）

## 如何清空本地数据
在浏览器控制台执行：
```js
localStorage.removeItem('qa.examDate');
localStorage.removeItem('qa.progress');
localStorage.removeItem('qa.favorites');
localStorage.removeItem('qa.notes');
localStorage.removeItem('qa.wrong');
localStorage.removeItem('qa.daily');
```
或在浏览器设置里清空站点数据。

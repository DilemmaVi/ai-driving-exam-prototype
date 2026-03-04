# AI Driving Exam Prototype (科目一·学员学习系统)

纯静态网页原型，支持 GitHub Pages 发布。

## 本地预览
```bash
cd projects/active/ai-driving-exam-prototype
python3 -m http.server 5173
```
浏览器打开： http://127.0.0.1:5173/

## 功能（MVP 第1步）
- 左侧导航新增：`练题`
- 练题支持：单选/判断、上一题/下一题、答题后显示对错与解析
- 支持收藏、笔记（保存在本地浏览器 `localStorage`）
- 首页展示：已做题/总题数、正确率、今日目标（简单算法）

## 数据存储（localStorage keys）
- `qa.examDate`：考试日期（YYYY-MM-DD）
- `qa.progress`：做题记录与完成数量
- `qa.favorites`：收藏题目 id 列表
- `qa.notes`：题目笔记

## 如何清空本地数据
在浏览器控制台执行：
```js
localStorage.removeItem('qa.examDate');
localStorage.removeItem('qa.progress');
localStorage.removeItem('qa.favorites');
localStorage.removeItem('qa.notes');
```
或在浏览器设置里清空站点数据。

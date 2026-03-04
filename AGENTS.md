# Repository Guidelines

## Project Structure & Module Organization
- `index.html`: single-page UI shell and Tailwind utility layer.
- `assets/app.js`: main application logic (question flow, routing, exam/practice behaviors).
- `assets/storage.js`: `localStorage` schema and persistence helpers.
- `data/questions.json`: question bank data loaded at runtime via `fetch`.
- `README.md` and `PROJECT.md`: product context, local preview, and deployment notes.

Keep new browser-side modules under `assets/` and keep data files under `data/`.

## Build, Test, and Development Commands
- `python3 -m http.server 5173`
  - Recommended local preview server from repo root.
  - Open `http://127.0.0.1:5173/`.
- `open http://127.0.0.1:5173/` (macOS optional)
  - Quick way to launch the app after starting the server.

This repository is a static frontend prototype; there is no bundler or build step currently.

## Coding Style & Naming Conventions
- Use 2-space indentation in JavaScript and 4 spaces in existing HTML blocks; follow surrounding file style.
- Prefer `const`/`let`, small pure helpers, and explicit function names (for example `normalizeQuestion`, `updateKnowledgeMastery`).
- Use `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants (for example `LS_KEYS`), and kebab-case for file names where applicable.
- Keep logic in JS modules; avoid large inline scripts in `index.html`.

## Testing Guidelines
- No automated test suite is configured yet.
- Validate changes manually in browser with local server:
  - load questions successfully,
  - answer flow for single/tf/multi modes,
  - persistence keys in `localStorage` (for example `qa.progress`, `qa.wrong`).
- If adding complex logic, include a short manual test checklist in the PR.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat: ...`, `fix: ...`, `docs: ...`.
- Keep commits scoped and descriptive (one logical change per commit).
- PRs should include:
  - concise summary of behavior changes,
  - affected files/areas,
  - manual verification steps,
  - screenshots or short recordings for UI changes.

## Security & Configuration Tips
- Do not commit secrets or private tokens; this is a client-side static app.
- Treat `data/questions.json` as versioned source data; document provenance and transformation rules when replacing it.

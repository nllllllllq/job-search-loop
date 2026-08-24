# V1.4 紧凑公司列表、总览与设置折叠 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏旧数据库的前提下，完成公司列表折叠、总览信息密度提升、流程线精简、设置手风琴和最新安装包发布。

**Architecture:** 保留数据库中的公司别名表但从岗位查询和界面移除别名逻辑；总览公司数直接由岗位原始公司名实时去重。页面改造优先复用现有组件与数据契约，采用紧凑 CSS 和局部状态，不引入新的持久化字段。

**Tech Stack:** Electron、React、TypeScript、SQLite、Zod、Vitest、Vite、electron-builder。

---

### Task 1: 移除公司合并交互并改为可伸缩公司列表

**Files:**
- Modify: `src/main/repositories/positions.ts`
- Modify: `src/main/ipc/positions.ts`, `src/main/ipc/register.ts`, `src/preload/index.ts`, `src/shared/ipc.ts`, `src/shared/domain.ts`, `src/shared/schemas.ts`
- Modify: `src/renderer/features/positions/PositionsPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/main/company-aliases.test.ts`, `tests/main/ipc-contract.test.ts`, `tests/renderer/positions-flow.test.tsx`

- [ ] **Step 1: Write the failing behavior tests**

  - Render grouped positions with two companies and assert only company rows are visible initially.
  - Click a company row and assert its jobs become visible; click again and assert they collapse.
  - Assert no “确认公司别名”“撤销别名” or merge control is rendered.
  - Assert `positions.listGrouped` groups by literal `company` and ignores existing alias rows.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm test -- tests/main/company-aliases.test.ts tests/main/ipc-contract.test.ts tests/renderer/positions-flow.test.tsx
```

Expected: renderer still exposes alias controls and/or groups through confirmed aliases.

- [ ] **Step 3: Implement literal grouping and collapsed UI**

  - Keep V8 tables and migration untouched for compatibility.
  - Make `listGrouped` map each position to its literal company and sort groups/members by `updatedAt DESC`.
  - Remove alias confirm/remove IPC exposure from `JobSearchApi` and renderer usage, while leaving old database tables readable for backup compatibility.
  - Add local `expandedCompanies: Set<string>` state in `PositionsPage`, default empty; toggle the row button and render members only when expanded.
  - Render collapsed row fields: company name, member count, latest update date, and first member’s current stage.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npm test -- tests/main/company-aliases.test.ts tests/main/ipc-contract.test.ts tests/renderer/positions-flow.test.tsx
npm run typecheck
```

Expected: focused tests and typecheck pass; no alias controls remain.

---

### Task 2: 增加投递公司数并压缩总览日期线

**Files:**
- Modify: `src/main/repositories/dashboard.ts`, `src/shared/domain.ts`, `src/shared/schemas.ts`
- Modify: `src/renderer/features/dashboard/DashboardPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/main/dashboard.test.ts`, `tests/main/dashboard-repository.test.ts`, `tests/renderer/dashboard.test.tsx`

- [ ] **Step 1: Write failing summary tests**

  - Create three positions where two have the same literal company and assert `companyCount === 2`.
  - Create more than ten actual/expected process events and assert the returned/rendered date line contains ten newest events in descending date order.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm test -- tests/main/dashboard.test.ts tests/main/dashboard-repository.test.ts tests/renderer/dashboard.test.tsx
```

Expected: summary has no company count and the date line is not capped at ten.

- [ ] **Step 3: Implement summary and compact presentation**

  - Add `companyCount` to the dashboard summary contract and calculate it with `COUNT(DISTINCT company)`.
  - Sort process events by date descending, keep the existing actual/expected marker, and slice to ten before returning.
  - Add the company count statistic card.
  - Reduce dashboard heading padding, stat min-height, panel padding, process-line row padding, and auxiliary font sizes without changing the color system.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
npm test -- tests/main/dashboard.test.ts tests/main/dashboard-repository.test.ts tests/renderer/dashboard.test.tsx
npm run typecheck
```

Expected: all focused tests pass and the new summary schema is accepted by preload.

---

### Task 3: Remove right-click stage deletion and compact the stage delete affordance

**Files:**
- Modify: `src/renderer/features/positions/StageTimeline.tsx`
- Modify: `src/renderer/components/ContextMenu.tsx`
- Modify: `src/renderer/styles/app.css`
- Modify: `tests/renderer/positions-flow.test.tsx`

- [ ] **Step 1: Write the failing interaction tests**

  - Right-clicking a stage must not open a delete menu.
  - Hovering or keyboard-focusing a stage exposes a small labelled delete button near its upper-right edge.
  - Clicking it still opens the existing confirmation and confirmed deletion calls `positions.removeStage`.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm test -- tests/renderer/positions-flow.test.tsx
```

Expected: current context-menu test or delete affordance assertions fail.

- [ ] **Step 3: Implement the compact affordance**

  - Delete the stage context-menu invocation and remove the menu rendering from the timeline.
  - Keep the existing confirmation state and IPC call.
  - Render a `button` with an accessible label inside each stage; CSS makes it 1.1–1.3rem, positioned at the top-right, hidden until hover/focus-within.
  - Preserve keyboard focus and do not cover the stage name/date.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
npm test -- tests/renderer/positions-flow.test.tsx
npm run typecheck
```

Expected: right-click does nothing, compact delete button works, and existing stage tests remain green.

---

### Task 4: Convert settings to a single-open accordion and reduce global header whitespace

**Files:**
- Modify: `src/renderer/features/settings/SettingsPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Modify: `tests/renderer/settings.test.tsx`, `tests/renderer/app-shell.test.tsx`

- [ ] **Step 1: Write failing accordion/layout tests**

  - Assert all settings sections start collapsed.
  - Click one section title and assert only its detail is visible; click a second title and assert the first closes.
  - Assert the emergency recovery warning remains visible while sections are collapsed.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm test -- tests/renderer/settings.test.tsx tests/renderer/app-shell.test.tsx
```

Expected: current settings content is visible without expanding and multiple sections can be open.

- [ ] **Step 3: Implement accordion and compact headers**

  - Store one `openSection: SettingsSection | null`, initialized to `null`.
  - Render each section as a labelled button/summary with a short description; conditionally mount details only for the active section.
  - Keep save state, error state, backup progress and recovery warnings in the same section state; do not reset values when switching sections.
  - Reduce shared page-header top/bottom padding and title margins in `app.css`; keep 1024×700 key controls visible.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
npm test -- tests/renderer/settings.test.tsx tests/renderer/app-shell.test.tsx
npm run typecheck
```

Expected: accordion and compact header tests pass.

---

### Task 5: Update release log, retain only newest installer, and verify release

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `package.json`, `package-lock.json`
- Modify: `docs/superpowers/plans/2026-08-01-ai-intake-validation-backlog.md` only if a newly deferred validation item is identified
- Create: `artifacts/<new-version>/JobSearchLoop-Setup-<new-version>.exe` outside the Git worktree

- [ ] **Step 1: Update version and newest-first changelog**

  - Increment the patch/minor version from the current release.
  - Add a newest-first entry describing company literal grouping/collapse, company count, ten-event date line, accordion settings, compact stage deletion and compressed layout.

- [ ] **Step 2: Run core verification**

```powershell
npm test
npm run typecheck
npm run test:build-output
```

Expected: all tests, typecheck and build-output verification pass.

- [ ] **Step 3: Build and smoke test the Windows installer**

```powershell
npm run package:win
npm run smoke:win
```

Expected: installer and unpacked Electron smoke pass.

- [ ] **Step 4: Remove old installers after resolving exact targets**

List `artifacts\*`, verify every target is an older installer directory, then remove only those older directories and keep the new version directory. Do not remove the artifacts root or unrelated files.

- [ ] **Step 5: Record final hash and commit**

```powershell
Get-FileHash artifacts/<new-version>/JobSearchLoop-Setup-<new-version>.exe -Algorithm SHA256
git add docs package.json package-lock.json src tests
git commit -m "feat: compact company dashboard and settings workflow"
```

Expected: clean worktree, newest-first log, one installer directory, and a recorded SHA-256 hash for handoff.

## Deferred after user trial

- 2,000+ positions and very large expanded company groups.
- Extremely long company names, unusual Unicode, and narrow-window layout matrices.
- Broader Windows accessibility and provider compatibility testing.

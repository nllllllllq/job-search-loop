# 紧凑总览、公司行与设置文案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正设置乱码，并使公司折叠行和总览数字区域更清晰紧凑。

**Architecture:** 仅修改 Renderer 文案、结构和 CSS；公司状态继续使用既有 `StatusBadge`，不更改数据库或 IPC。

**Tech Stack:** React、TypeScript、CSS、Vitest、Vite。

---

### Task 1: 修正设置手风琴中文文案

**Files:**
- Modify: `src/renderer/features/settings/SettingsPage.tsx`
- Test: `tests/renderer/settings.test.tsx`

- [ ] **Step 1: 更新渲染测试**

断言三组入口可见且包含 `AI 服务配置`、`Prompt 模板`、`本地备份与恢复`。

- [ ] **Step 2: 修正文案**

将 `sectionToggle` 调用统一改为：

```tsx
sectionToggle('provider', 'PROVIDER / 外部服务', 'AI 服务配置')
sectionToggle('prompts', 'WORKING INSTRUCTIONS / 工作指令', 'Prompt 模板')
sectionToggle('backup', 'ARCHIVE / 本地归档', '本地备份与恢复')
```

- [ ] **Step 3: 验证**

```powershell
npm test -- tests/renderer/settings.test.tsx
```

Expected: PASS。

### Task 2: 结构化公司折叠行并复用 Stage 徽标

**Files:**
- Modify: `src/renderer/features/positions/PositionsPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/positions-flow.test.tsx`

- [ ] **Step 1: 更新测试**

断言折叠公司行包含岗位数量、最近更新和 `StatusBadge` 的状态文本；无状态时显示 `未设置`。

- [ ] **Step 2: 实现**

将公司行拆为含 `position-group-toggle__identity` 和 `position-group-toggle__meta` 的区域；使用：

```tsx
<StatusBadge stage={latest?.currentStage ?? undefined} />
```

并为无阶段补充 `未设置` 文案。新增箭头与四列紧凑布局 CSS。

- [ ] **Step 3: 验证**

```powershell
npm test -- tests/renderer/positions-flow.test.tsx
```

Expected: PASS。

### Task 3: 压缩总览统计区域

**Files:**
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/dashboard.test.tsx`

- [ ] **Step 1: 保留现有字段测试并增加容器断言**

断言统计卡仍展示公司数量、累计岗位、进入面试和完成复盘。

- [ ] **Step 2: 压缩样式**

降低 `.dashboard-stats` 间距、`.dashboard-stat` 最小高度和内边距，并减小数字字号上限；不改变响应式网格。

- [ ] **Step 3: 验证**

```powershell
npm test -- tests/renderer/dashboard.test.tsx
npm run typecheck
npm run test:build-output
```

Expected: PASS。

### Task 4: 记录并发布

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: 更新版本和最新优先日志**

版本升至 `1.4.2`，记录乱码修复、公司状态徽标和总览紧凑化。

- [ ] **Step 2: 打包与 smoke**

```powershell
npm test
npm run package:win
npm run smoke:win
```

Expected: 核心测试、安装包和 Windows smoke 通过。

- [ ] **Step 3: 仅保留最新安装包并提交**

将最新安装包复制到 `C:\Users\Administrator\Desktop\Project\job_record\artifacts\v1.4.2`，删除旧 `v1.4.1` 目录后记录 SHA-256，并提交本轮改动。

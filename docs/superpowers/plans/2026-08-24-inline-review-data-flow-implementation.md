# 模块内复盘与主动纳入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让面试复盘固定归属于流程节点并在原处展示，用户逐条确认后才纳入其他模块，同时移除全局待确认建议入口。

**Architecture:** 先由岗位/面试模块建立 `position → stage → interview → review snapshot` 主关系和新的复盘输出契约；首页随后删除全局待确认入口；项目与知识模块最后接入来源明确的确认保存动作。旧 proposal 数据只做兼容，不删除，不再由新复盘生成 pending 记录。

**Tech Stack:** Electron、React、TypeScript、SQLite、Zod、Vitest/Testing Library。

---

## 文件所有权与实施顺序

| 阶段 | 对话 | 独占范围 | 依赖 |
| --- | --- | --- | --- |
| A1 | 02 岗位投递、准备、面试与复盘 | 面试/流程数据关系、复盘服务与岗位详情呈现 | 无 |
| A2 | 01 首页与整体交互 | 删除全局待确认 UI 与首页相关入口 | 可与 A1 并行；不得改共享契约 |
| B1 | 03 项目档案与项目 AI 整理 | “纳入项目档案”确认表单与保存 | A1 输出契约稳定 |
| B2 | 04 问题库、能力与知识沉淀 | 问题/能力/心得确认表单；能力分析停止产生 pending | A1 输出契约稳定 |
| C1 | 06 设置、本地数据与备份恢复 | V12 迁移/备份兼容验证 | A1 完成 |
| C2 | 07 版本发布、测试与安装包 | 全量回归、日志、版本与安装包 | A1-A2-B1-B2-C1 完成 |

### Task 1: 绑定面试与流程节点

**Files:**
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/migrations.ts`
- Modify: `src/main/repositories/interviews.ts`
- Modify: `src/main/ipc/reviews.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/main/database.test.ts`
- Test: `tests/main/interview-review.test.ts`
- Test: `tests/main/ipc-contract.test.ts`

- [ ] **Step 1: 写失败测试**

新增主路径断言：新建面试可携带 `stageId`，读取后仍指向同一岗位的该节点；旧记录的 `stageId` 为 `null`；其他岗位的节点会被拒绝。

- [ ] **Step 2: 运行聚焦测试确认失败**

Run: `npm test -- tests/main/database.test.ts tests/main/interview-review.test.ts tests/main/ipc-contract.test.ts --run`

Expected: FAIL，原因是 schema、数据库列或 repository 尚不支持 `stageId`。

- [ ] **Step 3: 实现最小 V12 迁移和关系校验**

只增加 `interviews.stage_id TEXT NULL` 与必要索引；保存时若 `stageId` 非空，验证节点属于同一 `positionId`。不删除或回填旧数据。

- [ ] **Step 4: 重新运行聚焦测试**

Expected: PASS，旧数据与新绑定路径都通过。

### Task 2: 把复盘输出改为来源内结果

**Files:**
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/services/interview-review.ts`
- Modify: `src/main/ipc/register.ts`
- Test: `tests/main/interview-review.test.ts`
- Test: `tests/shared/schemas.test.ts`

- [ ] **Step 1: 写失败测试**

断言复盘结果包含 `overview`、`questionAnswers`、`strengthsAndRisks`、`nextRoundPreparation`、`reusableItems`；确认复盘后仅保存快照，返回结果不含 pending proposals，proposal repository 不被调用。

- [ ] **Step 2: 运行聚焦测试确认失败**

Run: `npm test -- tests/main/interview-review.test.ts tests/shared/schemas.test.ts --run`

Expected: FAIL，旧输出仍以 `summary/strengths/gaps/proposals` 为主并调用 `commitReview`。

- [ ] **Step 3: 修改默认 Prompt 与严格输出 schema**

Prompt 明确生成五个模块，并让每条 `reusableItem` 携带建议目标 `project | question | capability | insight`、标题和正文。服务验证后写入 `review_snapshot_json`，删除复盘确认过程对 `proposals.commitReview` 的依赖。

- [ ] **Step 4: 保留旧快照兼容读取**

旧 `summary/strengths/gaps/proposals` 快照继续只读展示；不把它们转换成新 pending 数据。

- [ ] **Step 5: 重新运行聚焦测试**

Expected: PASS。

### Task 3: 在流程节点下展示面试与复盘

**Files:**
- Modify: `src/renderer/features/positions/PositionDetailPage.tsx`
- Modify: `src/renderer/features/positions/StageTimeline.tsx`
- Modify: `src/renderer/features/interviews/InterviewPanel.tsx`
- Modify: `src/renderer/features/interviews/InterviewEditor.tsx`
- Test: `tests/renderer/positions-flow.test.tsx`
- Test: `tests/renderer/review-flow.test.tsx`

- [ ] **Step 1: 写失败测试**

覆盖：新增面试时绑定当前节点；该面试只在节点下出现；复盘后五个模块出现在同一位置；旧 `stageId=null` 记录进入“未关联流程记录”；未点击纳入时没有待处理状态。

- [ ] **Step 2: 运行聚焦测试确认失败**

Run: `npm test -- tests/renderer/positions-flow.test.tsx tests/renderer/review-flow.test.tsx --run`

Expected: FAIL，当前 InterviewPanel 仍是岗位级面板并显示“生成待确认变更”。

- [ ] **Step 3: 最小调整现有组件**

复用现有 InterviewPanel/Modal，不创建第二套面试页面。节点展开区只传当前 `stageId`；文案改为“复盘完成”；五个结果区使用普通 section/card 展示。

- [ ] **Step 4: 重新运行聚焦测试**

Expected: PASS。

### Task 4: 删除首页全局待确认入口

**Files:**
- Modify: `src/renderer/features/dashboard/DashboardPage.tsx`
- Modify: `src/renderer/App.tsx`
- Modify only if now unused: `src/renderer/features/dashboard/ReviewDrawer.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/dashboard.test.tsx`
- Test: `tests/renderer/dashboard-drawer-resilience.test.tsx`
- Test: `tests/renderer/navigation.test.tsx`

- [ ] **Step 1: 写失败测试**

断言首页没有“待确认建议”统计卡、快捷入口或抽屉；旧 `/reviews` 只跳转首页，不自动打开抽屉。

- [ ] **Step 2: 运行聚焦测试确认失败**

Run: `npm test -- tests/renderer/dashboard.test.tsx tests/renderer/dashboard-drawer-resilience.test.tsx tests/renderer/navigation.test.tsx --run`

Expected: FAIL，旧入口仍存在。

- [ ] **Step 3: 删除 UI 入口和不可达状态**

只删除首页消费逻辑；不在本任务修改 `DashboardSummary` 数据结构或后端统计，以免与 Task 1-3 交叉。后端旧字段由后续兼容阶段清理。

- [ ] **Step 4: 重新运行聚焦测试**

Expected: PASS。

### Task 5: 主动纳入项目档案

**Files:**
- Modify: `src/renderer/features/projects/ProjectEditor.tsx`
- Modify: `src/renderer/features/projects/ProjectsPage.tsx`
- Create only if reuse is impossible: `src/renderer/features/projects/ReviewToProjectModal.tsx`
- Test: `tests/renderer/assets-flow.test.tsx`

- [ ] **Step 1: 写失败测试**

从一个 `reusableItem(targetType='project')` 打开项目字段表单，编辑后保存；取消时不写入；保存失败时保留表单内容。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/renderer/assets-flow.test.tsx --run`

- [ ] **Step 3: 复用 ProjectEditor 和现有保存 API**

禁止引入通用 proposal builder；只把来源条目映射成 ProjectEditor 初值，确认后调用现有 `assets.projects.save`。

- [ ] **Step 4: 重新运行测试**

Expected: PASS。

### Task 6: 主动纳入问题、能力与心得

**Files:**
- Modify: `src/renderer/features/questions/QuestionsPage.tsx`
- Modify: `src/renderer/features/insights/InsightsPage.tsx`
- Modify capability components under: `src/renderer/features/dashboard/`
- Modify: `src/main/services/capability-analysis.ts`
- Test: `tests/renderer/assets-flow.test.tsx`
- Test: `tests/main/capability-analysis.test.ts`

- [ ] **Step 1: 写失败测试**

分别覆盖三个目标的编辑确认保存和取消；能力分析完成后不产生 pending proposal，只保留本模块输出。

- [ ] **Step 2: 运行聚焦测试确认失败**

Run: `npm test -- tests/renderer/assets-flow.test.tsx tests/main/capability-analysis.test.ts --run`

- [ ] **Step 3: 复用现有编辑器和保存 API**

问题、能力、心得各自使用已有 schema；不新增统一表单抽象。能力分析移除 `commitCapabilityAnalysis` 的 pending 写入路径。

- [ ] **Step 4: 重新运行聚焦测试**

Expected: PASS。

### Task 7: 兼容性与发布验收

**Files:**
- Modify if required: `src/main/services/backup.ts`
- Modify: `tests/main/backup.test.ts`
- Modify: `docs/CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 验证旧库、旧备份与 V12**

Run: `npm test -- tests/main/database.test.ts tests/main/backup.test.ts --run`

Expected: PASS；旧 interview 的 `stageId` 为 null，旧 proposal 和旧快照不丢失。

- [ ] **Step 2: 运行主要回归**

Run: `npm test -- --run`

Run: `npm run typecheck`

Run: `npm run build`

Expected: 全部 exit 0。只修主要闭环失败，不扩展极限压力矩阵。

- [ ] **Step 3: 更新日志和安装包**

变更日志写清：面试复盘原地展示、取消全局待确认入口、主动纳入、旧数据兼容。版本号与安装包只在全部模块验收后由发布任务修改。

## 自检

- 规格覆盖：面试绑定、五块复盘、主动确认、首页移除、模块分流、旧数据兼容均有任务。
- 范围检查：A1/A2 文件不重叠；B1/B2 等 A1 契约稳定后再启动；发布文件只归 Task 7。
- 简化检查：不新增全局中心、不删除旧表、不重做各资产模型、不引入依赖。

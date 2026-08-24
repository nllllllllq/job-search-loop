# V1.5 Position Workflow and Connected Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved compact position workflow, stage-aware dates, future-only dashboard schedule, and Doubao Web Search preparation flow.

**Architecture:** Keep the existing SQLite schema and reinterpret the two stage date columns through a shared canonical-stage policy. Sort literal company groups in the repository, keep intake confirmation in the renderer, and isolate Doubao Responses/Web Search in a new AI client method used only by preparation generation. Preserve historical preparation snapshots through a three-version union while writing only the new five-section format.

**Tech Stack:** Electron 43, React 19, TypeScript 5.9, SQLite, Zod 4, Vitest, Vite, electron-builder.

---

## File map and worker boundaries

Each implementation task starts from a clean commit. No two workers may modify the same files concurrently. Luna receives exactly the files listed in that task; if Luna is unavailable, the task returns to Sol.

- Shared stage semantics: `src/shared/stage-policy.ts`
- Position grouping and defaults: `src/main/repositories/positions.ts`, `src/shared/defaults.ts`
- Position list UI: `src/renderer/features/positions/PositionsPage.tsx`, `src/renderer/styles/app.css`
- Intake UI: `src/renderer/features/positions/PositionIntakePanel.tsx`
- Stage editor/timeline: `src/renderer/features/positions/StageEditor.tsx`, `src/renderer/features/positions/StageTimeline.tsx`
- Dashboard query/UI: `src/main/repositories/dashboard.ts`, `src/renderer/features/dashboard/DashboardPage.tsx`, `src/renderer/features/dashboard/ProcessTimeline.tsx`
- Preparation contract: `src/shared/domain.ts`, `src/shared/schemas.ts`, `src/shared/defaults.ts`
- Preparation transport/service: `src/main/services/ai-client.ts`, `src/main/services/preparation.ts`
- Preparation UI: `src/renderer/features/preparations/GeneratePreparationModal.tsx`, `src/renderer/features/preparations/PreparationPanel.tsx`
- Prompt upgrade: `src/main/repositories/prompts.ts`
- Release record: `package.json`, `package-lock.json`, `docs/CHANGELOG.md`

## Task 1: Shared stage policy and two-level position sorting

**Allowed files:**
- Create: `src/shared/stage-policy.ts`
- Modify: `src/main/repositories/positions.ts`
- Modify: `src/renderer/features/positions/PositionsPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/main/positions-repository.test.ts`
- Test: `tests/renderer/positions-flow.test.tsx`

**Forbidden scope:** No company aliases, database migration, detail-page sorting, dashboard changes, or preparation changes.

- [ ] **Step 1: Add failing repository and renderer assertions**

Add a repository case with companies whose fastest stages are offer, interview, assessment, applied, and interested. Assert company groups and members use that order, with updated time as the tie breaker. In the renderer test, expand a company and assert the row contains the role and location but does not repeat the company name inside the role link.

```ts
expect(groups.map((group) => group.canonicalName)).toEqual([
  'Offer Co', 'Interview Co', 'Assessment Co', 'Applied Co', 'Interested Co',
]);
expect(groups[0]?.members.map((item) => item.currentStage)).toEqual(['offer', 'interview']);
expect(within(roleLink).getByText('AI 产品经理')).toBeVisible();
expect(within(roleLink).getByText('上海 · 混合办公')).toBeVisible();
expect(within(roleLink).queryByText('示例公司')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/positions-repository.test.ts tests/renderer/positions-flow.test.tsx --run`

Expected: failures show existing updated-time group ordering and repeated company name/location omission.

- [ ] **Step 3: Add the shared priority and sort repository results**

Create the shared helper and use it after literal-name grouping:

```ts
const STAGE_PRIORITY: Record<CanonicalStage, number> = {
  offer: 0,
  interview: 1,
  assessment: 2,
  applied: 3,
  interested: 4,
  rejected: 5,
  withdrawn: 5,
};

export function stagePriority(stage: CanonicalStage | null | undefined): number {
  return stage ? STAGE_PRIORITY[stage] : 5;
}
```

Sort members by priority then `updatedAt` descending. Sort groups by their first member's priority, then group latest update descending, then `canonicalName.localeCompare`.

- [ ] **Step 4: Render role-first rows**

Change the member link to render the title as the primary `<strong>` and location as the secondary text. Keep preparation task state in `<small>`. Do not render `position.company` inside the expanded member row.

- [ ] **Step 5: Tighten the company member CSS and verify GREEN**

Add only selectors needed for a compact role/location stack. Run the focused command from Step 2 and expect both files to pass.

- [ ] **Step 6: Sol review and commit**

Sol checks `git diff --check`, inspects both sort levels, reruns the focused tests, and commits only the allowed files with `feat: sort position groups by progress`.

## Task 2: Screenshot-first position intake and precise missing fields

**Allowed files:**
- Modify: `src/renderer/features/positions/PositionIntakePanel.tsx`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/services/position-image-import.ts`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/main/position-image-import.test.ts`
- Test: `tests/renderer/positions-flow.test.tsx`
- Test: `tests/renderer/position-image-limits.test.tsx`

**Forbidden scope:** No main-process OCR rewrite, URL import, location-required schema, automatic database save, or modal dismissal changes.

- [ ] **Step 1: Write failing intake tests**

Assert that opening the modal selects “截图识别”, the pre-recognition dialog has no “保存岗位”, the AI button is inside a right-aligned action container, and manual fields only appear after clicking “手动录入”. Add a main-service case proving the recognition schema accepts empty strings as a partial preview. Mock an AI preview missing company and JD and assert the visible alert names both fields while location remains a nonblocking warning.

```ts
expect(screen.getByRole('tab', { name: '截图识别' })).toHaveAttribute('aria-selected', 'true');
expect(screen.queryByRole('button', { name: '保存岗位' })).not.toBeInTheDocument();
expect(await screen.findByRole('alert')).toHaveTextContent('缺少：公司名称、完整 JD');
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/position-image-import.test.ts tests/renderer/positions-flow.test.tsx tests/renderer/position-image-limits.test.tsx --run`

Expected: the default tab and footer assertions fail.

- [ ] **Step 3: Implement screenshot-first state and conditional footer**

Initialize and reset `tab` to `images`. Render no modal footer before image recognition. After `preview` exists, render a submit button labelled “确认录入岗位”. Manual mode retains “保存岗位”. Place the AI trigger in `.import-source__actions`.

- [ ] **Step 4: Compute required-field diagnostics**

Derive missing fields from the preview value:

```ts
const missingRequired = [
  !value.company.trim() ? '公司名称' : null,
  !value.title.trim() ? '岗位名称' : null,
  !value.rawJd.trim() ? '完整 JD' : null,
].filter((item): item is string => item !== null);
```

Show `缺少：${missingRequired.join('、')}` in an alert and seed field errors for those fields. Append “工作位置未识别，可稍后补充” only as a warning.

- [ ] **Step 5: Allow safe partial AI previews and improve error copy**

Change only the AI recognition preview schema's company, title, and rawJd fields from `min(1)` to empty-string-permitted bounded strings. Keep the final `positionInputSchema` strict, so only the renderer confirmation form can fill the missing values. Map `AI_INPUT_UNSUPPORTED`, `AI_INVALID_OUTPUT`, provider errors, and local validation failures to actionable Chinese messages without exposing API keys or raw provider bodies.

- [ ] **Step 6: Verify and commit**

Run the focused tests, `npm run typecheck`, and `git diff --check`. Sol reviews the actual modal behavior and commits `feat: make screenshot intake the default`.

## Task 3: Fixed stage date semantics and aligned node deletion

**Allowed files:**
- Modify: `src/shared/stage-policy.ts`
- Modify: `src/main/repositories/positions.ts`
- Modify: `src/renderer/features/positions/StageEditor.tsx`
- Modify: `src/renderer/features/positions/StageTimeline.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/main/positions-repository.test.ts`
- Test: `tests/renderer/positions-flow.test.tsx`
- Test: `tests/renderer/position-layout-css.test.ts`

**Forbidden scope:** No new date columns, reminder system, overdue state, free choice of date policy, or global default-stage customization.

- [ ] **Step 1: Write failing date-policy tests**

Assert new positions create an applied stage dated today, interested is not part of the default process, assessment/interview show “收到通知时间” plus stage-specific “进行时间”, offer shows only “收到 Offer 时间”, and delete-button CSS positions the small control over the node dot.

```ts
expect(created.stages.map((stage) => stage.canonicalStage)).toEqual([
  'applied', 'assessment', 'interview', 'offer',
]);
expect(created.stages[0]?.actualDate).toBe('2026-08-08');
expect(screen.getByLabelText('收到通知时间')).toBeVisible();
expect(screen.getByLabelText('面试进行时间')).toBeVisible();
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/positions-repository.test.ts tests/renderer/positions-flow.test.tsx tests/renderer/position-layout-css.test.ts --run`

- [ ] **Step 3: Define fixed date policies**

Extend `stage-policy.ts` with a pure function returning one of:

```ts
type StageDatePolicy =
  | { kind: 'single'; actualLabel: string; autoToday: boolean }
  | { kind: 'notice-and-event'; expectedLabel: '收到通知时间'; actualLabel: string };
```

Map assessment/interview to two dates, applied/interested to auto-today single dates, offer to “收到 Offer 时间”, and closed states to “记录时间”.

- [ ] **Step 4: Make applied the default first stage**

Keep the existing default stages applied, assessment, interview, and offer. During `positions.create`, compute one local `YYYY-MM-DD` value and assign it to the applied stage `actualDate`; leave all other dates null. Keep optional interested stages user-addable.

- [ ] **Step 5: Render policy-specific fields**

StageEditor uses the selected canonical stage's policy and never displays “实际日期/预计日期”. When canonical stage changes, retain values but relabel them; saving continues through the existing `ProcessStageInput` schema.

- [ ] **Step 6: Align the delete control**

Anchor the delete button to the node element with absolute positioning, horizontal center transform, smaller hit visual, and preserved keyboard focus styling.

- [ ] **Step 7: Verify and commit**

Run focused tests and typecheck. Sol checks default creation and date labels, then commits `feat: apply fixed stage date rules`.

## Task 4: Compact dashboard and future-only schedule

**Allowed files:**
- Modify: `src/main/repositories/dashboard.ts`
- Modify: `src/renderer/features/dashboard/DashboardPage.tsx`
- Modify: `src/renderer/features/dashboard/ProcessTimeline.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/main/dashboard.test.ts`
- Test: `tests/main/dashboard-repository.test.ts`
- Test: `tests/renderer/dashboard.test.tsx`

**Forbidden scope:** No reminders, recent-position replacement, overdue display, history timeline, capability drawer rewrite, or performance stress tests.

- [ ] **Step 1: Replace the stale baseline expectation with future-only tests**

Use an injected `today` dependency in the repository fixture. Insert past, today, and future stages across several canonical stages. Assert only assessment/interview `actual_date >= today` rows remain, sorted ascending and limited to ten.

```ts
expect(summary.processEvents.map(({ canonicalStage, date }) => ({ canonicalStage, date })))
  .toEqual([
    { canonicalStage: 'assessment', date: '2026-08-08' },
    { canonicalStage: 'interview', date: '2026-08-09' },
  ]);
```

- [ ] **Step 2: Run dashboard tests and verify RED**

Run: `npm test -- tests/main/dashboard.test.ts tests/main/dashboard-repository.test.ts tests/renderer/dashboard.test.tsx --run`

- [ ] **Step 3: Implement the query**

Let `createDashboardRepository(db, { today = localDate })` bind `today()` into SQL:

```sql
SELECT s.position_id, p.company, p.title, s.name, s.canonical_stage,
       s.actual_date AS event_date, 'actual' AS date_type
FROM process_stages s
JOIN positions p ON p.id = s.position_id
WHERE s.canonical_stage IN ('assessment', 'interview')
  AND s.actual_date IS NOT NULL
  AND s.actual_date >= ?
ORDER BY s.actual_date ASC, s.order_index ASC, s.id ASC
LIMIT 10
```

- [ ] **Step 4: Simplify the dashboard UI**

Remove the dashboard heading and recent positions section. Keep five summary items in one grid row. Move the analysis button into the capability shortcut. Rename the wide panel to “待完成安排” with copy explaining it only shows upcoming assessment/interview times.

- [ ] **Step 5: Compact the five-item CSS**

Set `.dashboard-stats` to five equal columns at the supported width, reduce card padding/min-height, and keep value/index/label on one compact horizontal baseline. Add one responsive rule below the supported minimum only.

- [ ] **Step 6: Verify and commit**

Run dashboard focused tests, typecheck, and diff check. Sol verifies the previous baseline failure is now replaced by the intended contract and commits `feat: show upcoming interview schedule`.

## Task 5: New preparation contract and detailed default prompt

**Allowed files:**
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/shared/defaults.ts`
- Modify: `src/main/repositories/prompts.ts`
- Test: `tests/shared/preparation-output-schema.test.ts`
- Test: `tests/shared/preparation-preview-schema.test.ts`
- Test: `tests/main/prompts-repository.test.ts`
- Test: `tests/main/preload-preparations.test.ts`

**Forbidden scope:** No AI transport, renderer, database migration, project import prompt, or user-custom prompt overwrite.

- [ ] **Step 1: Write failing contract tests**

Define a complete five-section fixture and assert the new schema accepts exactly five ranked competencies and exactly three action questions. Assert historical current and legacy snapshots remain valid. Assert a database containing the exact old shipped default is upgraded while a custom prompt remains unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/shared/preparation-output-schema.test.ts tests/shared/preparation-preview-schema.test.ts tests/main/prompts-repository.test.ts tests/main/preload-preparations.test.ts --run`

- [ ] **Step 3: Add the V1.5 output types and schemas**

Create `ConnectedPreparationOutput` with these strict top-level keys:

```ts
{
  companyAndProductResearch,
  competencyMap,
  companyMap,
  dreamCandidateAvatar,
  actionGuide,
}
```

The research object contains `businessAndUsers`, `coreProducts`, `businessModel`, `recentDirection`, `roleProductHypothesis`, and `verificationNotes`. Competencies contain `rank`, `name`, `jdEvidence`, `roleUsage`, and `proofSuggestion`. Action guide contains `selfIntroTagline`, `cultureFitPhrase`, a tuple of three questions, and `verificationChecklist`.

Set `PreparationHistoricalOutput` to a union of V1.5, current V1.4, and legacy V1 formats.

Change `preparationGenerateSchema` and `PreparationGenerateInput` to contain only `{ positionId }`. Keep the outbound preview's compatibility asset structure empty, but build `jobDataJson` from position fields only so no project/question structure is sent.

- [ ] **Step 4: Replace the shipped default prompt**

Write a detailed Chinese prompt specifying Web Search, the five output groups, exact counts, field meanings, factual limits, “待核实” behavior, no personal-project invention, and JSON-only output.

- [ ] **Step 5: Upgrade only untouched defaults**

In prompt repository initialization, insert missing defaults and update preparation content only when it exactly matches a known prior shipped preparation default. Do not alter any other content.

- [ ] **Step 6: Verify and commit**

Run focused tests and typecheck. Sol inspects the schema/default consistency and commits `feat: define connected preparation output`.

## Task 6: Doubao Responses Web Search and simplified preparation UI

**Allowed files:**
- Modify: `src/main/services/ai-client.ts`
- Modify: `src/main/services/preparation.ts`
- Modify: `src/renderer/features/preparations/GeneratePreparationModal.tsx`
- Modify: `src/renderer/features/preparations/PreparationPanel.tsx`
- Modify: `tests/helpers/bridge.ts`
- Test: `tests/main/ai-client.test.ts`
- Test: `tests/main/preparation-service.test.ts`
- Test: `tests/main/preparation-tasks.test.ts`
- Test: `tests/renderer/preparation-flow.test.tsx`

**Forbidden scope:** No migration of other AI calls, no source-link persistence/display, no project/question selection, no provider-wide refactor, no real paid API call in automated tests.

- [ ] **Step 1: Write failing Responses transport tests**

Assert the client posts to `${baseUrl}/responses` with `tools: [{ type: 'web_search' }]`, `store: false`, current model, and input messages. Return a fixture whose `output` includes tool activity plus a final message containing `output_text`; assert fenced JSON is parsed and validated. Add one failure case that preserves safe HTTP diagnostics.

- [ ] **Step 2: Write failing preparation service and UI tests**

Assert preview and generation accept only `positionId`, send no project/question data, call the new Web Search method, persist an empty asset snapshot, render five sections, and show a simple confirmation modal without asset checkboxes.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- tests/main/ai-client.test.ts tests/main/preparation-service.test.ts tests/main/preparation-tasks.test.ts tests/renderer/preparation-flow.test.tsx --run`

- [ ] **Step 4: Implement `completeJsonWithWebSearch`**

Add a dedicated AI client method that reuses timeout, authentication, rate-limit, redaction, and request-ID diagnostics. Normalize a base URL ending in `/v1` or `/api/v3` without changing other calls, append `/responses`, and send non-streaming Responses input plus Web Search. Extract the final `output_text`, remove only an outer JSON fence, parse JSON, and validate through the supplied Zod schema.

- [ ] **Step 5: Simplify preparation assembly**

Remove project/question repository reads and references from the new generation path. Build `jobDataJson` from position fields only. Use the new five-section output contract and `completeJsonWithWebSearch`. Persist `assetsSnapshot` as `{"projects":[],"questions":[]}` for compatibility.

- [ ] **Step 6: Simplify the modal and render new output**

Remove asset lists and selector state. The confirmation view states that company, role, optional location, full JD, Prompt, and output contract are sent to Doubao and that the model will use Web Search. Keep background task behavior and safe failure diagnostics. Add five-section renderers while leaving legacy renderers untouched.

- [ ] **Step 7: Verify and commit**

Run the focused tests, typecheck, and diff check. Sol inspects the actual request body to confirm no project/question data and commits `feat: add connected Doubao preparation`.

## Task 7: Integrated verification, release log, version, and latest installer

**Allowed files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/CHANGELOG.md`
- Generated: latest `release/JobSearchLoop-Setup-1.5.0.exe`

**Forbidden scope:** No old installer preservation, signing, publishing, remote upload, destructive cleanup outside the release directory, or exhaustive performance/edge testing.

- [ ] **Step 1: Run focused integration verification**

Run:

```powershell
npm test -- tests/main/positions-repository.test.ts tests/renderer/positions-flow.test.tsx tests/renderer/position-image-limits.test.tsx tests/main/dashboard.test.ts tests/main/dashboard-repository.test.ts tests/renderer/dashboard.test.tsx tests/main/ai-client.test.ts tests/main/preparation-service.test.ts tests/main/preparation-tasks.test.ts tests/renderer/preparation-flow.test.tsx --run
npm run typecheck
```

Expected: all selected files pass and both TypeScript projects report no errors.

- [ ] **Step 2: Run the full core suite and production build**

Run `npm test` and `npm run build`. Record exact pass/fail counts. Do not add performance stress or complex provider matrices.

- [ ] **Step 3: Update version and reverse-chronological log**

Set package version to `1.5.0` through `npm version 1.5.0 --no-git-tag-version`. Add the newest V1.5 entry at the top of `docs/CHANGELOG.md`, covering list ordering/location, screenshot-first intake, fixed stage dates, compact future-only dashboard, and Doubao connected preparation.

- [ ] **Step 4: Build only the latest installer**

After Sol verifies the exact `release` path, remove only older `JobSearchLoop-Setup-*.exe` files inside that release directory, then run `npm run package:win`. Verify the 1.5.0 installer exists and report its size and SHA256. This destructive step remains with Sol and is never delegated to Luna.

- [ ] **Step 5: Final Sol acceptance**

Sol rereads the approved spec line by line, inspects `git diff`, reruns the primary commands, records deferred validation, and commits the tracked release metadata with `chore: release desktop v1.5.0`.

## Deferred post-trial validation

- Very large JD and thousands of grouped positions.
- Complex time-zone transitions and malformed legacy date strings.
- Providers other than the configured Doubao/Ark Responses implementation.
- Repeated Web Search generation under rate limits and prolonged outages.
- Clean-machine signing, upgrade, and uninstall matrices.

# AI Intake, Background Workflow, and Position Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make preparation generation non-blocking and diagnosable, simplify position workflow operations and company grouping, and add AI-native image/file intake with user-confirmed factual project enrichment.

**Architecture:** Add a narrow main-process AI task runtime for preparation jobs, a multimodal structured-completion adapter for image/file imports, and focused repositories for task state and company aliases. Existing position/project/preparation services remain the owners of business writes; AI outputs only create previews or immutable preparation versions after local validation.

**Tech Stack:** Electron, React 19, TypeScript, Node `node:sqlite`, Zod, Vitest, Playwright, electron-builder.

---

## Delivery policy for this plan

- Deliver the three primary user workflows first; each task has only focused main-path tests.
- Run full regression/typecheck/build only at phase checkpoints and release packaging.
- Defer extreme file sizes, stress volume, provider fault matrices, restart races and high-DPI interaction matrices to `docs/superpowers/plans/2026-08-01-ai-intake-validation-backlog.md` after user trial.
- Do not defer data-loss, credential-redaction, migration atomicity, or explicit user-confirmation checks.

## File structure and responsibility map

| Path | Responsibility |
|---|---|
| `AGENTS.md` | Repository-wide core-first delivery policy. |
| `src/main/services/ai-client.ts` | Text and multimodal structured completions; safe provider error metadata. |
| `src/main/repositories/ai-tasks.ts` | Minimal preparation task persistence and state transitions. |
| `src/main/services/preparation-tasks.ts` | Background preparation orchestration; publishes state changes. |
| `src/main/repositories/company-aliases.ts` | Canonical company and confirmed alias relationships. |
| `src/main/services/position-image-import.ts` | Image-native position preview and user-selected text fallback. |
| `src/main/services/project-import-ai.ts` | File-native project classification, provenance-aware enrichment and fallback. |
| `src/main/ipc/tasks.ts` | Narrow task query/retry IPC endpoints. |
| `src/main/ipc/imports.ts` | Import capability checks and preview endpoints. |
| `src/main/migrations.ts` | V7+ transactional schema additions. |
| `src/shared/domain.ts`, `src/shared/schemas.ts`, `src/shared/ipc.ts` | Shared domain models, Zod contracts and IPC surface. |
| `src/preload/index.ts` | Validated bridge APIs only. |
| `src/renderer/features/preparations/*` | Submit-and-close flow; task badges and safe error details. |
| `src/renderer/features/positions/*` | Grouped list, explicit modal behavior, default stages and direct node deletion. |
| `src/renderer/features/projects/*` | Project classification and per-field suggestion confirmation. |
| `src/renderer/features/settings/PromptTemplatesSection.tsx` | Independent position-image prompt. |
| `tests/main/*`, `tests/renderer/*` | Main-path focused coverage for each phase. |

## Phase 0: Establish the delivery rule

### Task 1: Record the repository delivery policy

**Files:**
- Create: `AGENTS.md`
- Create: `docs/superpowers/plans/2026-08-01-ai-intake-validation-backlog.md`
- Test: none; this is an instruction/documentation change.

- [ ] **Step 1: Add the policy file**

Create `AGENTS.md` with the following non-negotiable rule:

```md
# Delivery Policy

For every feature, first implement and verify the primary user workflow. Keep tests focused on that workflow while the user is iterating. Defer boundary-condition, extreme-environment, stress and compatibility matrices to the validation backlog until the user asks for release hardening after trial.

Never defer checks that protect data integrity, migrations, user confirmation, credentials, or destructive actions.
```

- [ ] **Step 2: Add a deferred-validation backlog**

Create the backlog with sections for provider compatibility matrix, large/complex file corpus, task restart races, company-alias fuzzy-match corpus, and large position-list performance. Mark all as post-trial; do not create tests for them in this release.

- [ ] **Step 3: Commit**

```powershell
git add AGENTS.md docs/superpowers/plans/2026-08-01-ai-intake-validation-backlog.md
git commit -m "docs: adopt core-first delivery policy"
```

## Phase 1: Preparation diagnostics and background execution

### Task 2: Preserve safe provider error details

**Files:**
- Modify: `src/main/services/ai-settings.ts`
- Modify: `src/main/services/ai-client.ts`
- Modify: `src/shared/ipc.ts`
- Test: `tests/main/ai-client.test.ts`

- [ ] **Step 1: Write failing provider-error tests**

Add tests for a non-2xx provider response with JSON/text body and request ID header. Assert that the thrown `AiServiceError` exposes only:

```ts
expect(error).toMatchObject({
  code: 'AI_PROVIDER_ERROR',
  providerMessage: 'model does not support vision',
  httpStatus: 400,
  requestId: 'req_demo',
});
expect(JSON.stringify(error)).not.toContain('Bearer');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/main/ai-client.test.ts`  
Expected: FAIL because `AiServiceError` has no safe diagnostic metadata.

- [ ] **Step 3: Implement safe error metadata**

Extend `AiServiceError` with optional `providerMessage`, `httpStatus`, and `requestId`. In `ai-client.ts`, read response text once, extract a bounded provider message, read `x-request-id`/`request-id`, and never include request headers, request body, API key or raw business data.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/main/ai-client.test.ts`  
Expected: PASS.

```powershell
git add src/main/services/ai-settings.ts src/main/services/ai-client.ts src/shared/ipc.ts tests/main/ai-client.test.ts
git commit -m "feat: expose safe AI diagnostics"
```

### Task 3: Add persistent preparation task state

**Files:**
- Modify: `src/main/migrations.ts`
- Create: `src/main/repositories/ai-tasks.ts`
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Test: `tests/main/database.test.ts`
- Test: `tests/main/ai-tasks-repository.test.ts`

- [ ] **Step 1: Write failing repository and migration tests**

Cover the primary state transitions:

```ts
const task = tasks.createPreparation({ positionId });
expect(task.status).toBe('queued');
expect(tasks.markRunning(task.id).status).toBe('running');
expect(tasks.markFailed(task.id, safeError).status).toBe('failed');
expect(tasks.interruptRunningOnStartup(positionId).status).toBe('interrupted');
```

Assert the persisted row has no request body, prompt, JD, asset snapshot or file bytes.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/ai-tasks-repository.test.ts tests/main/database.test.ts`  
Expected: FAIL because the table and repository do not exist.

- [ ] **Step 3: Implement V7 migration and repository**

Create a strict `ai_tasks` table with `id`, `kind`, `position_id`, `status`, `safe_error_json`, `created_at`, and `updated_at`. Add only `preparation` task kind in this phase. At startup, transition `queued`/`running` rows to `interrupted` in one transaction. Parse every row through Zod before returning it.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/main/ai-tasks-repository.test.ts tests/main/database.test.ts`  
Expected: PASS.

```powershell
git add src/main/migrations.ts src/main/repositories/ai-tasks.ts src/shared/domain.ts src/shared/schemas.ts tests/main/database.test.ts tests/main/ai-tasks-repository.test.ts
git commit -m "feat: persist preparation task state"
```

### Task 4: Run preparation generation after modal submission

**Files:**
- Create: `src/main/services/preparation-tasks.ts`
- Create: `src/main/ipc/tasks.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/main/ipc/positions.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/main/preparation-tasks.test.ts`
- Test: `tests/main/ipc-contract.test.ts`

- [ ] **Step 1: Write failing background-task tests**

Define and test this public contract:

```ts
const started = await api.preparations.start({ positionId, projectIds: [], questionIds: [] });
expect(started.status).toBe('queued');
await runtime.drainForTest();
expect(await api.tasks.listByPosition(positionId)).toContainEqual(
  expect.objectContaining({ id: started.id, status: 'succeeded' }),
);
```

Test failed generation stores redacted diagnostics and creates no `preparation_materials` row.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/preparation-tasks.test.ts tests/main/ipc-contract.test.ts`  
Expected: FAIL because the start/list contract does not exist.

- [ ] **Step 3: Implement the runtime**

Create `PreparationTaskRuntime.start(input)`: create `queued`, return immediately, schedule the existing `createPreparationService().generate(input)`, transition to `running`, then `succeeded` or `failed`. Convert only safe diagnostic fields to JSON. Inject a publish callback for Renderer updates; do not persist the input payload. Register `preparations.start`, `tasks.listByPosition`, and `tasks.get` with strict schemas.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/main/preparation-tasks.test.ts tests/main/ipc-contract.test.ts tests/main/preparation-service.test.ts`  
Expected: PASS.

```powershell
git add src/main/services/preparation-tasks.ts src/main/ipc/tasks.ts src/main/ipc/register.ts src/main/ipc/positions.ts src/shared/ipc.ts src/preload/index.ts tests/main/preparation-tasks.test.ts tests/main/ipc-contract.test.ts
git commit -m "feat: run preparation generation in background"
```

### Task 5: Replace the blocking preparation submit flow

**Files:**
- Modify: `src/renderer/features/preparations/GeneratePreparationModal.tsx`
- Modify: `src/renderer/features/preparations/PreparationPanel.tsx`
- Modify: `src/renderer/features/positions/PositionsPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/preparation-flow.test.tsx`
- Test: `tests/renderer/positions-flow.test.tsx`

- [ ] **Step 1: Write failing Renderer tests**

Assert confirming generation calls `preparations.start`, closes the modal immediately, renders `生成中` in `PreparationPanel`, and shows a failed task with provider message/status/request ID but not the mocked API key.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/renderer/preparation-flow.test.tsx tests/renderer/positions-flow.test.tsx`  
Expected: FAIL because the UI waits for `preparations.generate`.

- [ ] **Step 3: Implement the UI state**

Keep the outbound confirmation step. Replace direct generation with `preparations.start`, close after a successful start response, poll/list task state on the preparation panel and position list reload, and render `生成中`/`失败`/`上次生成已中断`. Render diagnostics in an expandable detail block with only the safe fields returned by IPC. Retry reopens the existing selector; it does not resend automatically.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/renderer/preparation-flow.test.tsx tests/renderer/positions-flow.test.tsx`  
Expected: PASS.

```powershell
git add src/renderer/features/preparations src/renderer/features/positions/PositionsPage.tsx src/renderer/styles/app.css tests/renderer/preparation-flow.test.tsx tests/renderer/positions-flow.test.tsx
git commit -m "feat: show preparation task status outside modal"
```

## Phase 2: Position workflow and list efficiency

### Task 6: Change defaults and add direct stage deletion

**Files:**
- Modify: `src/shared/defaults.ts`
- Modify: `src/main/repositories/positions.ts`
- Modify: `src/renderer/features/positions/StageTimeline.tsx`
- Modify: `src/renderer/features/positions/StageEditor.tsx`
- Create: `src/renderer/components/ContextMenu.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/main/positions-repository.test.ts`
- Test: `tests/renderer/positions-flow.test.tsx`

- [ ] **Step 1: Write failing default-stage and direct-delete tests**

Assert position creation produces canonical stages `[applied, assessment, interview, offer]`, with the applied actual date equal to the creation date. Assert right click and focused delete button open a confirmation dialog, and successful confirmation calls `removeStage` without opening `StageEditor`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/positions-repository.test.ts tests/renderer/positions-flow.test.tsx`  
Expected: FAIL because interested is created by default and deletion is editor-only.

- [ ] **Step 3: Implement minimal workflow changes**

Set default stages to applied/assessment/interview/offer and give applied `actualDate` from the repository creation timestamp. In `StageTimeline`, add keyboard-accessible context-menu invocation and a visible-on-hover/focus delete button. Both set a dedicated confirmation state. Remove delete controls from `StageEditor`; keep its existing edit/save/order responsibilities.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/main/positions-repository.test.ts tests/renderer/positions-flow.test.tsx`  
Expected: PASS.

```powershell
git add src/shared/defaults.ts src/main/repositories/positions.ts src/renderer/features/positions src/renderer/components/ContextMenu.tsx src/renderer/styles/app.css tests/main/positions-repository.test.ts tests/renderer/positions-flow.test.tsx
git commit -m "feat: streamline default position progress"
```

### Task 7: Make intake/edit modal closure explicit

**Files:**
- Modify: `src/renderer/components/Modal.tsx`
- Modify: `src/renderer/features/positions/PositionIntakePanel.tsx`
- Modify: `src/renderer/features/positions/PositionEditor.tsx`
- Modify: `src/renderer/features/projects/ProjectEditor.tsx`
- Modify: `src/renderer/features/questions/QuestionEditor.tsx`
- Modify: `src/renderer/features/interviews/InterviewEditor.tsx`
- Test: `tests/renderer/modal.test.tsx`
- Test: `tests/renderer/positions-flow.test.tsx`

- [ ] **Step 1: Write failing closure-policy tests**

Test that intake/edit dialogs do not close on backdrop click or Escape, have no footer cancel button, and close only through the labelled close button. Test delete confirmation still exposes cancel and confirm controls.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/renderer/modal.test.tsx tests/renderer/positions-flow.test.tsx`  
Expected: FAIL because current dialogs allow backdrop/Escape close and expose cancel footer buttons.

- [ ] **Step 3: Implement an explicit modal variant**

Add a `dismissal="close-button-only" | "standard"` prop. For close-button-only, suppress backdrop/Escape closure and render no caller-provided cancel action. Apply it only to intake/edit dialogs; keep delete confirmations standard. Audit position-list event handlers so only the explicit intake button sets `editorOpen`.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/renderer/modal.test.tsx tests/renderer/positions-flow.test.tsx`  
Expected: PASS.

```powershell
git add src/renderer/components/Modal.tsx src/renderer/features/positions src/renderer/features/projects/ProjectEditor.tsx src/renderer/features/questions/QuestionEditor.tsx src/renderer/features/interviews/InterviewEditor.tsx tests/renderer/modal.test.tsx tests/renderer/positions-flow.test.tsx
git commit -m "feat: require explicit close for intake dialogs"
```

### Task 8: Group positions by confirmed company identity

**Files:**
- Modify: `src/main/migrations.ts`
- Create: `src/main/repositories/company-aliases.ts`
- Modify: `src/main/repositories/positions.ts`
- Modify: `src/main/ipc/positions.ts`
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/features/positions/PositionsPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/main/company-aliases.test.ts`
- Test: `tests/renderer/positions-flow.test.tsx`

- [ ] **Step 1: Write failing grouping tests**

Create positions for one exact company and one confirmed alias. Assert one `CompanyPositionGroup` ordered by latest member update, with members ordered by `updatedAt DESC`. Assert removing an alias returns the affected position to its literal company group.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/company-aliases.test.ts tests/renderer/positions-flow.test.tsx`  
Expected: FAIL because list returns a flat array and no alias repository exists.

- [ ] **Step 3: Implement V8 grouping**

Create strict canonical-company and alias tables. Normalize only whitespace, case and punctuation to propose candidates; never auto-merge. Add `positions.listGrouped`, `companyAliases.confirm`, and `companyAliases.remove`. Render group headers with canonical name/count and group members. Recompute grouping after each list reload.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/main/company-aliases.test.ts tests/renderer/positions-flow.test.tsx`  
Expected: PASS.

```powershell
git add src/main/migrations.ts src/main/repositories/company-aliases.ts src/main/repositories/positions.ts src/main/ipc/positions.ts src/shared src/preload/index.ts src/renderer/features/positions/PositionsPage.tsx src/renderer/styles/app.css tests/main/company-aliases.test.ts tests/renderer/positions-flow.test.tsx
git commit -m "feat: group positions by confirmed company"
```

## Phase 3: AI-native structured intake

### Task 9: Extend the AI client with explicit input capabilities

**Files:**
- Modify: `src/main/services/ai-client.ts`
- Modify: `src/main/services/ai-settings.ts`
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Test: `tests/main/ai-client.test.ts`

- [ ] **Step 1: Write failing multimodal tests**

Test `completeStructured` with a `text` part and an `image`/`file` part. Assert outgoing JSON uses the configured model and contains raw bytes only in that request. Test unsupported capability returns `AI_INPUT_UNSUPPORTED` before fetch.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/ai-client.test.ts`  
Expected: FAIL because messages only accept strings and input capability is absent.

- [ ] **Step 3: Implement capability-aware content parts**

Define `AiInputPart = TextPart | ImagePart | FilePart`; add explicit model capabilities to settings and validate them locally. Map images to OpenAI-compatible image content parts and files to the configured supported file part protocol. Keep byte arrays scoped to the fetch body; never log or persist them. Add `AI_INPUT_UNSUPPORTED` to `AppError`.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/main/ai-client.test.ts`  
Expected: PASS.

```powershell
git add src/main/services/ai-client.ts src/main/services/ai-settings.ts src/shared/domain.ts src/shared/schemas.ts tests/main/ai-client.test.ts
git commit -m "feat: support capability-aware AI input parts"
```

### Task 10: Build image-native position preview

**Files:**
- Create: `src/main/services/position-image-import.ts`
- Modify: `src/main/ipc/imports.ts`
- Modify: `src/shared/defaults.ts`
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/renderer/features/settings/PromptTemplatesSection.tsx`
- Modify: `src/renderer/features/positions/PositionIntakePanel.tsx`
- Test: `tests/main/position-image-import.test.ts`
- Test: `tests/renderer/import-flow.test.tsx`
- Test: `tests/renderer/settings.test.tsx`

- [ ] **Step 1: Write failing structured-preview tests**

Test that a supported image model receives ordered image bytes and returns a validated preview with company/title/location/full raw JD. Test unsupported input returns a fallback choice, not an automatic OCR request. Test confirmation is still required before `positions.create`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/position-image-import.test.ts tests/renderer/import-flow.test.tsx tests/renderer/settings.test.tsx`  
Expected: FAIL because image import only uses local OCR/rules and no `position-image` prompt exists.

- [ ] **Step 3: Implement the image path and choice UI**

Add `position-image` PromptKind/default prompt. Use a strict schema for `{ company, title, location, rawJd, confidence, warnings }`. In the intake panel, make AI image recognition the primary action. On `AI_INPUT_UNSUPPORTED`, present exactly two actions: text fallback (local OCR then AI text structuring) or cancel. Preserve multi-image ordering and release import session data on finish.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- tests/main/position-image-import.test.ts tests/renderer/import-flow.test.tsx tests/renderer/settings.test.tsx`  
Expected: PASS.

```powershell
git add src/main/services/position-image-import.ts src/main/ipc/imports.ts src/shared src/renderer/features/settings/PromptTemplatesSection.tsx src/renderer/features/positions/PositionIntakePanel.tsx tests/main/position-image-import.test.ts tests/renderer/import-flow.test.tsx tests/renderer/settings.test.tsx
git commit -m "feat: use AI to structure position screenshots"
```

### Task 11: Add project classification, provenance and suggestion confirmation

**Files:**
- Modify: `src/main/services/project-import-ai.ts`
- Modify: `src/main/ipc/imports.ts`
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/renderer/features/projects/ProjectImportWizard.tsx`
- Modify: `src/renderer/features/settings/PromptTemplatesSection.tsx`
- Test: `tests/main/project-import-ai.test.ts`
- Test: `tests/renderer/import-flow.test.tsx`
- Test: `tests/renderer/settings.test.tsx`

- [ ] **Step 1: Write failing classification/provenance tests**

Cover these main paths:

```ts
expect(result.classification).toBe('no-valid-project');
expect(result.segments).toEqual([]);
expect(projectField.provenance).toBe('ai-suggestion');
expect(projectField.evidence).toContain('source line');
```

For a valid project, assert a suggestion is not included in the final `ProjectInput` until the update operation explicitly accepts it.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/main/project-import-ai.test.ts tests/renderer/import-flow.test.tsx tests/renderer/settings.test.tsx`  
Expected: FAIL because the result has no classification or field provenance.

- [ ] **Step 3: Implement the structured project contract**

Send the original file through the new file capability when supported, plus locally extracted indexed text only as an evidence index. Require AI output to include document classification, accepted project boundaries, missing fields, unused content/reason, and per-field `{ value, provenance, evidence }`. Permit `ai-rewrite` and `ai-suggestion`; reject invented quantitative/business facts through prompt instruction and a confirmation-only suggestion model. If no valid project exists, return a preview with no save path and an explanation. If file input is unsupported, show text-fallback/cancel choice.

- [ ] **Step 4: Implement field-level confirmation UI**

In `ProjectImportWizard`, render origin badges and evidence disclosure for every enriched field. Provide accept, edit, restore-source and accept-all actions. Build the save payload from source facts, rewrites and explicitly accepted suggestions only.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- tests/main/project-import-ai.test.ts tests/renderer/import-flow.test.tsx tests/renderer/settings.test.tsx`  
Expected: PASS.

```powershell
git add src/main/services/project-import-ai.ts src/main/ipc/imports.ts src/shared src/renderer/features/projects/ProjectImportWizard.tsx src/renderer/features/settings/PromptTemplatesSection.tsx tests/main/project-import-ai.test.ts tests/renderer/import-flow.test.tsx tests/renderer/settings.test.tsx
git commit -m "feat: classify and enrich imported project files"
```

## Phase 4: Core release verification only

### Task 12: Verify core workflows, build and package

**Files:**
- Modify only if focused tests expose a primary-workflow regression.
- Test: all relevant existing and new tests.

- [ ] **Step 1: Run focused workflow suites**

Run:

```powershell
npm test -- tests/main/preparation-tasks.test.ts tests/main/ai-tasks-repository.test.ts tests/main/positions-repository.test.ts tests/main/company-aliases.test.ts tests/main/position-image-import.test.ts tests/main/project-import-ai.test.ts tests/renderer/preparation-flow.test.tsx tests/renderer/positions-flow.test.tsx tests/renderer/import-flow.test.tsx
```

Expected: PASS; fix only primary workflow failures before proceeding.

- [ ] **Step 2: Run project regression and production build**

Run:

```powershell
npm test
npm run typecheck
npm run test:build-output
npm run package:win
npm run smoke:win
```

Expected: all commands exit 0.

- [ ] **Step 3: Publish a validation backlog instead of expanding test scope**

Record any untested extreme/compatibility cases in `docs/superpowers/plans/2026-08-01-ai-intake-validation-backlog.md`. Do not add those tests until user trial requests hardening.

- [ ] **Step 4: Commit release verification updates only if files changed**

```powershell
git add docs/superpowers/plans/2026-08-01-ai-intake-validation-backlog.md
git commit -m "docs: record deferred validation backlog"
```

## Plan self-review

- Spec coverage: Tasks 2–5 implement background generation and diagnostic disclosure; Tasks 6–8 implement defaults, deletion, closure and grouping; Tasks 9–11 implement image/file input and project confirmation; Task 12 verifies only core paths.
- Data protection: Tasks 2–4 and 9–11 prohibit persistence/logging of raw inputs and protect error details.
- Delivery scope: no task adds automatic retries, an always-running service, a global task center, or extreme-condition test matrices.
- Type consistency: `AiTask`, `AiInputPart`, `CompanyPositionGroup`, provenance fields and `AI_INPUT_UNSUPPORTED` are introduced in their owning shared contracts before consumers use them.

# V1.1–V1.2 Usability, Import, and Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop app faster to enter and review data while hardening audit, proposal, backup, and release behavior.

**Architecture:** Extend the existing local SQLite domain through an explicit migration, then expose narrow typed IPC services for local imports and recovery. Import services return expiring previews only; final records continue through existing position and asset repositories. UI work reuses the current shell and editors while consolidating navigation and reducing layout density.

**Tech Stack:** Electron 43, React 19, TypeScript, node:sqlite, Zod, Vitest, Playwright Electron, Tesseract.js, pdfjs-dist, Mammoth, electron-builder.

---

### Task 1: Schema V5 and audit integrity

**Files:**
- Modify: `src/main/migrations.ts`
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/repositories/interviews.ts`
- Modify: `src/main/repositories/proposals.ts`
- Modify: `src/main/services/capability-analysis.ts`
- Test: `tests/main/database.test.ts`
- Test: `tests/main/interviews-repository.test.ts`
- Test: `tests/main/proposals-repository.test.ts`
- Test: `tests/main/capability-analysis.test.ts`

- [ ] Write failing migration tests for `location`, `unclassified_notes`, `capability_analysis_runs`, and `analysis_run_id`; prove a V4 fixture upgrades without losing records.
- [ ] Add the transactional V5 migration and update required backup tables.
- [ ] Add `location` and `unclassifiedNotes` to domain, CRUD, snapshots, versions, proposals, and strict schemas.
- [ ] Write failing tests showing reviewed interviews cannot be edited and mixed valid/corrupt audit rows remain listable.
- [ ] Implement conditional interview updates and `none | valid | invalid` audit DTOs.
- [ ] Write failing tests showing corrupt proposals are isolated and current payloads reject unknown or missing fields.
- [ ] Implement strict proposal decoding and read-only corrupt list items.
- [ ] Write the failing batch audit test:

```ts
expect(run).toMatchObject({
  selectedPositionIds: [positionA, positionB],
  promptSnapshot: exactPrompt,
  providerOrigin: 'https://api.example.com',
  model: 'model-a',
});
expect(proposals.every((item) => item.analysisRunId === run.id)).toBe(true);
```

- [ ] Persist the analysis run and all pending capability proposals in one transaction.
- [ ] Run focused tests, full tests, typecheck, build, build-output, and `git diff --check`.
- [ ] Commit: `feat: harden audit data and add import fields`

### Task 2: Typed proposal editing and dashboard drawers

**Files:**
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/repositories/proposals.ts`
- Modify: `src/renderer/features/dashboard/DashboardPage.tsx`
- Create: `src/renderer/features/dashboard/ReviewDrawer.tsx`
- Create: `src/renderer/features/dashboard/CapabilityDrawer.tsx`
- Modify: `src/renderer/components/ProposalCard.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/AppShell.tsx`
- Test: `tests/renderer/dashboard.test.tsx`
- Test: `tests/renderer/review-flow.test.tsx`

- [ ] Write failing tests for six navigation items and redirects from `/reviews` and `/capabilities` to dashboard drawer state.
- [ ] Return proposal list items with `{ company, title, interviewRound, interviewDate }` in one query and prove no per-card IPC calls occur.
- [ ] Build pending/history review drawer and capability summary/editor drawer.
- [ ] Replace default JSON editing with project, question, capability, and insight forms; keep JSON behind an “advanced view” disclosure.
- [ ] Validate fields locally with Zod and `aria-describedby`; preserve failed input and prevent duplicate submissions.
- [ ] Cover accept/ignore failures, toasts, relation selectors, integer validation, and merge arrays whose only difference is order.
- [ ] Run focused/full verification and commit: `feat: consolidate reviews and capabilities on dashboard`

### Task 3: Recoverable backup workflow

**Files:**
- Modify: `src/main/services/backup.ts`
- Modify: `src/main/ipc/system.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/renderer/features/settings/BackupSection.tsx`
- Test: `tests/main/backup.test.ts`
- Test: `tests/renderer/backup.test.tsx`

- [ ] Define a versioned restore marker stored beside the live database:

```ts
type RestoreMarker = {
  version: 1;
  phase: 'staged' | 'live-closed' | 'live-displaced' | 'replacement-installed';
  livePath: string;
  stagedPath: string;
  rollbackPath: string;
  startedAt: string;
};
```

- [ ] Write fault-injection tests for each restore phase, file locks, read-only targets, low disk space, and reopen failures.
- [ ] Implement startup recovery choices: continue, restore rollback, or preserve files and exit recovery mode.
- [ ] List validated rollback copies and retain the newest three; delete only confirmed files inside the app data directory.
- [ ] Add backup progress events, cancellation before replacement, and optional `integrity_check`.
- [ ] Ensure paths remain in the main process and renderer messages contain only safe labels.
- [ ] Run focused/full verification and commit: `feat: add recoverable backup transactions`

### Task 4: Compact shell and position workspace

**Files:**
- Modify: `src/renderer/components/AppShell.tsx`
- Modify: `src/renderer/features/positions/PositionsPage.tsx`
- Modify: `src/renderer/features/positions/PositionEditor.tsx`
- Modify: `src/renderer/features/positions/PositionDetailPage.tsx`
- Modify: `src/renderer/features/positions/StageTimeline.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/navigation.test.tsx`
- Test: `tests/renderer/positions-flow.test.tsx`

- [ ] Write failing tests for location display/search and the direct-JD single-page detail.
- [ ] Add location to create/edit/list/search without adding a location filter.
- [ ] Remove overview tabs and render header, JD, wrapped horizontal process, preparation, and interviews on one page.
- [ ] Keep standard stages automatic; move custom stage creation and reorder into “更多流程设置”.
- [ ] Reduce card padding, decorative labels, gaps, and empty states while preserving colors and typography.
- [ ] Add a Playwright viewport assertion at 1024×700 for sidebar, drawers, forms, and process wrapping.
- [ ] Run focused/full verification and commit: `feat: streamline position workspace`

### Task 5: Local document import foundation

**Files:**
- Create: `src/main/services/import-sessions.ts`
- Create: `src/main/services/document-import.ts`
- Create: `src/main/services/import-classifier.ts`
- Create: `src/main/ipc/imports.ts`
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/features/projects/ProjectImportWizard.tsx`
- Test: `tests/main/document-import.test.ts`
- Test: `tests/renderer/project-import.test.tsx`

- [ ] Add dependencies for Mammoth and pdfjs-dist with exact lockfile resolution.
- [ ] Define preview-only interfaces:

```ts
type ImportSessionId = string;
type ProjectSegmentPreview = {
  tempId: string;
  name: string;
  sourceText: string;
  suggested: ProjectInput;
  warnings: string[];
};
```

- [ ] Write RED tests for DOCX headings, text PDF, scanned PDF fallback request, TXT, MD, 30-project cap, split, merge, reorder, and expiry.
- [ ] Implement byte-signature/size validation and pure-text extraction; never render imported HTML.
- [ ] Implement deterministic project segmentation and field mapping; route unmatched text to `unclassifiedNotes`.
- [ ] Build the two-step segment/editor wizard and partial batch retry without duplicate saves.
- [ ] Prove cancel/expiry release buffers and no original attachment enters database or backup.
- [ ] Run focused/full verification and commit: `feat: import multi-project documents locally`

### Task 6: Offline screenshot OCR and unified position intake

**Files:**
- Create: `src/main/services/ocr.ts`
- Create: `src/main/services/position-import.ts`
- Modify: `src/main/ipc/imports.ts`
- Create: `src/renderer/features/positions/PositionIntakePanel.tsx`
- Modify: `package.json`
- Test: `tests/main/position-import.test.ts`
- Test: `tests/renderer/position-intake.test.tsx`

- [ ] Add pinned Tesseract.js, WASM, `eng`, and `chi_sim` assets; configure paths without runtime downloads.
- [ ] Write RED tests for one image, ordered multiple images, bilingual text, low-confidence warnings, 10-file/12MB/40MP limits, progress, cancel, and timeout.
- [ ] Run OCR in a worker and classify company, title, location, and JD using deterministic field/title/body rules.
- [ ] Build one panel with manual, paste, screenshot, and disabled-until-Task-7 link tabs.
- [ ] Default interest to 3, display field confidence, and require the existing position schema before save.
- [ ] Package and run an offline smoke proving OCR assets load with network disabled.
- [ ] Run focused/full verification and commit: `feat: add offline screenshot job intake`

### Task 7: Public HTTPS job-link import

**Files:**
- Create: `src/main/services/url-safety.ts`
- Create: `src/main/services/job-link-import.ts`
- Modify: `src/main/ipc/imports.ts`
- Modify: `src/renderer/features/positions/PositionIntakePanel.tsx`
- Test: `tests/main/job-link-import.test.ts`
- Test: `tests/renderer/position-intake.test.tsx`

- [ ] Write RED tests for JobPosting JSON-LD, static fallback, credentials, HTTP, localhost, private/reserved IPs, DNS rebinding, redirects, timeout, and 3MB limit.
- [ ] Validate DNS before every request and redirect, allow only public HTTPS, disable script execution, and parse JSON-LD before static text.
- [ ] Return only a preview; never persist the URL.
- [ ] Enable the link tab and provide explicit screenshot/paste fallback messages.
- [ ] Run focused/full verification and commit: `feat: import public job links safely`

### Task 8: Performance and Windows release acceptance

**Files:**
- Modify: `tests/e2e/closed-loop.spec.ts`
- Create: `tests/e2e/import-workflows.spec.ts`
- Create: `tests/performance/personal-scale.test.ts`
- Modify: `scripts/smoke-win.mjs`
- Modify: `package.json`
- Modify: `README.md`

- [ ] Seed 2,000 positions, 500 proposals, and 200 preparation versions; assert bounded query counts and no proposal N+1.
- [ ] Add Electron E2E for multi-image job intake, multi-project document import, dashboard drawers, link import, backup recovery, and persistence after restart.
- [ ] Add failure traces/screenshots and a command that runs the closed loop 20 consecutive times without business assertion retries.
- [ ] Package OCR assets into asar/unpacked resources and verify offline startup/import.
- [ ] Add application icon/version resources and deterministic dependency/hash checks.
- [ ] Run full tests, typecheck, build, build-output, E2E, 20-run stability, `package:win`, unpacked smoke, and `git diff --check`.
- [ ] Record signing certificate and two-clean-Windows results as external release gates.
- [ ] Commit: `test: verify V1.2 imports and Windows release`

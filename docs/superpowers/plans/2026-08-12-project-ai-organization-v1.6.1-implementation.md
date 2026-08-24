# V1.6.1 Project AI Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify manual project entry, reuse the existing audited AI preview to organize an existing project, and make document project extraction AI-only with explicit failures.

**Architecture:** Add one backward-compatible project-time column and keep the existing raw-content column. Reuse the current project-import preview/session and project save IPC instead of adding another AI endpoint. Remove local fallback from the service and UI while keeping trust-boundary validation and confirmation-only AI suggestions.

**Tech Stack:** Electron, React, TypeScript, node:sqlite, Zod, Vitest.

---

### Task 1: Project data and AI-only parsing

**Files:**
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/main/migrations.ts`
- Modify: `src/main/repositories/assets.ts`
- Modify: `src/shared/defaults.ts`
- Modify: `src/main/repositories/prompts.ts`
- Modify: `src/main/services/project-import-ai.ts`
- Test: `tests/main/project-import-ai.test.ts`
- Test: `tests/main/assets-repository.test.ts`
- Test: `tests/main/database.test.ts`
- Test: `tests/main/prompts-repository.test.ts`
- Test: `tests/shared/schemas.test.ts`

- [ ] Add failing tests for `projectTime` migration/persistence/version equality and for excluding resume headers from the AI project contract.
- [ ] Add failing tests that local mode, missing AI, oversized text, provider failure and invalid output produce explicit errors instead of local segments.
- [ ] Run the focused tests and confirm the new assertions fail for the missing behavior.
- [ ] Add schema version 11 with `projects.project_time TEXT NOT NULL DEFAULT ''`, decode/save/version the field, and default it in the payload schema.
- [ ] Strengthen the default prompt and exact-default upgrade while preserving customized prompts.
- [ ] Remove `classifyProjectText` fallback from `analyzeProjectImport`; preserve typed AI errors and convert invalid model structure to `AI_INVALID_OUTPUT`.
- [ ] Normalize simple string fields to confirmation-only suggestions and downgrade unverifiable evidence to suggestions instead of accepting it as fact.
- [ ] Run: `npm test -- tests/main/project-import-ai.test.ts tests/main/assets-repository.test.ts tests/main/database.test.ts tests/main/prompts-repository.test.ts tests/shared/schemas.test.ts --run`.

### Task 2: Simple editor and existing-project AI organization

**Files:**
- Modify: `src/renderer/features/projects/ProjectEditor.tsx`
- Modify: `src/renderer/features/projects/ProjectImportWizard.tsx`
- Modify: `src/renderer/features/projects/ProjectsPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/project-import-wizard-v16.test.tsx`
- Test: `tests/renderer/assets-flow.test.tsx`

- [ ] Add failing tests that the manual editor exposes only name, role, time and raw content, while hidden structured fields survive editing.
- [ ] Add failing tests that project file import has no local button and surfaces AI errors without closing or saving.
- [ ] Add failing tests that “AI 整理” sends one in-memory TXT preview, displays audited changes, updates the existing ID, and preserves raw content.
- [ ] Run the focused renderer tests and confirm the new assertions fail for the missing behavior.
- [ ] Simplify `ProjectEditor`, add the project-time presentation, and retain hidden structured values.
- [ ] Extend `ProjectImportWizard` with an optional existing-project mode that reuses the AI preview and saves exactly one accepted result to that project ID.
- [ ] Remove local parsing UI/copy, add safe AI error mapping, and keep source input available after failure.
- [ ] Add the detail action and refresh the selected project after confirmation.
- [ ] Run: `npm test -- tests/renderer/project-import-wizard-v16.test.tsx tests/renderer/assets-flow.test.tsx --run`.

### Task 3: Sol verification, real provider check, release

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Inspect the complete diff and confirm no unrelated file was overwritten.
- [ ] Independently rerun both focused suites, `npm run typecheck`, the full test suite, production build, build-output tests and Electron closed-loop E2E.
- [ ] Run a privacy-safe real-provider diagnostic through the same document extraction and AI project analysis services. Print only safe counts/status, never the API key or source text.
- [ ] Set version `1.6.1`, update the newest-first changelog, rebuild the single latest installer, and verify its checksum and Windows unpacked smoke path.

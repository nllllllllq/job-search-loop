# Desktop V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Windows desktop version of the local-first job-search loop assistant, from job intake through AI-reviewed knowledge reuse.

**Architecture:** Use Electron with a sandboxed React renderer and a narrow `contextBridge` API. Keep all persistence, AI calls, encrypted settings, backup, and file access in the Electron main process; keep domain contracts in a shared package and store user data in a local SQLite database under Electron's `userData` directory.

**Tech Stack:** Electron 43.2, React 19.2, TypeScript 5.9, Vite 8.1, `node:sqlite`, Zod 4, Vitest 4.1, React Testing Library, Playwright Electron, electron-builder.

---

## 1. Scope and delivery rules

This plan implements only Stage 1 from the approved design:

- Windows desktop application.
- Local SQLite database.
- Jobs, raw JD text, custom process stages, actual dates, and expected dates.
- On-demand AI preparation materials.
- Text interview records and AI summaries.
- Review-before-write proposals.
- Project records, interviewer questions, candidate questions, capability themes, and insights.
- Overview statistics.
- Configurable OpenAI-compatible API endpoint, model, and encrypted API key.
- Local backup and restore.

It does not implement mobile, screenshot OCR, recording transcription, LAN sync, reminders, calendar integration, resume editing, automatic applications, or cloud storage.

Implementation follows these rules:

- Write a failing test before each behavior change.
- Renderer code never imports `electron`, `node:*`, or database modules.
- AI output never mutates assets directly.
- Historical preparation and interview records remain immutable snapshots.
- Each task ends with passing focused tests and a small commit.

## 2. File map

```text
job_record/
├─ package.json                       # scripts, dependencies, electron-builder config
├─ package-lock.json                  # locked dependency graph
├─ index.html                         # Vite renderer entry
├─ vite.config.ts                     # React renderer build and Vitest DOM project
├─ vitest.config.ts                   # node and jsdom test projects
├─ tsconfig.json                      # shared and renderer TypeScript
├─ tsconfig.electron.json             # main/preload CommonJS output
├─ playwright.config.ts               # Electron end-to-end settings
├─ src/
│  ├─ shared/
│  │  ├─ domain.ts                    # domain models and input types
│  │  ├─ schemas.ts                   # Zod validation for IPC and AI output
│  │  ├─ ipc.ts                       # channel names and public bridge contract
│  │  └─ defaults.ts                  # default stages and prompt templates
│  ├─ main/
│  │  ├─ index.ts                     # Electron lifecycle and secure BrowserWindow
│  │  ├─ database.ts                  # SQLite connection and migration runner
│  │  ├─ migrations.ts                # schema migrations
│  │  ├─ repositories/
│  │  │  ├─ positions.ts              # job and stage persistence
│  │  │  ├─ preparations.ts           # preparation snapshots
│  │  │  ├─ interviews.ts             # interview records
│  │  │  ├─ proposals.ts              # review queue and atomic acceptance
│  │  │  ├─ assets.ts                 # projects, questions, capabilities, insights
│  │  │  ├─ prompts.ts                # editable prompt templates
│  │  │  └─ dashboard.ts              # aggregate read models
│  │  ├─ services/
│  │  │  ├─ ai-settings.ts            # encrypted endpoint/model/key storage
│  │  │  ├─ ai-client.ts              # OpenAI-compatible HTTP adapter
│  │  │  ├─ preparation.ts            # prompt assembly and snapshot creation
│  │  │  ├─ interview-review.ts       # summary/proposal generation
│  │  │  ├─ capability-analysis.ts     # explicit multi-JD analysis
│  │  │  └─ backup.ts                 # SQLite backup and validated restore
│  │  └─ ipc/
│  │     ├─ register.ts                # handler composition
│  │     ├─ positions.ts               # position/stage handlers
│  │     ├─ assets.ts                  # asset handlers
│  │     ├─ ai.ts                      # AI/settings handlers
│  │     ├─ reviews.ts                 # interview/proposal handlers
│  │     └─ system.ts                  # dashboard and backup handlers
│  ├─ preload/
│  │  └─ index.ts                     # narrow contextBridge implementation
│  └─ renderer/
│     ├─ main.tsx                      # React bootstrap
│     ├─ App.tsx                       # hash router and layout
│     ├─ global.d.ts                   # typed window.jobSearch API
│     ├─ styles/
│     │  ├─ tokens.css                 # colors, typography, spacing
│     │  └─ app.css                    # layout and component primitives
│     ├─ components/
│     │  ├─ AppShell.tsx               # sidebar, header, content frame
│     │  ├─ EmptyState.tsx             # consistent empty states
│     │  ├─ Field.tsx                  # accessible form wrapper
│     │  ├─ Modal.tsx                  # dialog primitive
│     │  ├─ StatusBadge.tsx            # stage/result badges
│     │  └─ ProposalCard.tsx           # accept/edit/ignore proposal UI
│     ├─ hooks/
│     │  ├─ useAsyncResource.ts        # loading/error/reload state
│     │  └─ useToast.tsx               # transient feedback
│     └─ features/
│        ├─ dashboard/                 # overview page and charts
│        ├─ positions/                 # list, editor, detail, stage timeline
│        ├─ preparations/              # material generation and versions
│        ├─ interviews/                # interview editor and summary
│        ├─ reviews/                   # proposal review center
│        ├─ projects/                  # project records and versions
│        ├─ questions/                 # interviewer/candidate question library
│        ├─ capabilities/              # capability themes and evidence
│        ├─ insights/                  # free-form notes
│        └─ settings/                  # AI, prompts, backup/restore
├─ tests/
│  ├─ setup-dom.ts                     # Testing Library cleanup and matchers
│  ├─ helpers/
│  │  ├─ database.ts                   # disposable in-memory SQLite
│  │  └─ bridge.ts                     # typed renderer API fake
│  ├─ main/                            # repository and service tests
│  ├─ renderer/                        # component and feature tests
│  └─ e2e/
│     └─ closed-loop.spec.ts            # full desktop acceptance scenario
└─ docs/
   ├─ superpowers/specs/...            # approved product design
   └─ superpowers/plans/...            # this plan
```

## Task 1: Scaffold the secure Electron and React application

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.electron.json`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/global.d.ts`
- Create: `src/renderer/styles/tokens.css`
- Create: `src/renderer/styles/app.css`
- Create: `tests/renderer/app-shell.test.tsx`
- Create: `tests/setup-dom.ts`

- [ ] **Step 1: Create the package manifest and tool configuration**

Use these scripts and dependency families:

```json
{
  "name": "job-search-loop",
  "version": "0.1.0",
  "private": true,
  "description": "Local-first job-search planning and learning loop",
  "main": "dist-electron/main/index.js",
  "scripts": {
    "dev:renderer": "vite --host 127.0.0.1",
    "dev:electron": "tsc -p tsconfig.electron.json --watch",
    "dev:app": "wait-on tcp:5173 dist-electron/main/index.js && electron .",
    "dev": "concurrently -k \"npm:dev:renderer\" \"npm:dev:electron\" \"npm:dev:app\"",
    "build": "tsc -p tsconfig.electron.json && vite build",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.electron.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "npm run build && playwright test",
    "package:win": "npm run build && electron-builder --win nsis"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.59.0",
    "@testing-library/dom": "^10.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^6.0.0",
    "concurrently": "^9.0.0",
    "electron": "43.2.0",
    "electron-builder": "^26.0.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.9.0",
    "vite": "^8.1.0",
    "vitest": "^4.1.0",
    "wait-on": "^8.0.0"
  },
  "build": {
    "appId": "local.jobsearch.loop",
    "productName": "求职闭环",
    "files": ["dist/**/*", "dist-electron/**/*", "package.json"],
    "directories": {"output": "release"},
    "win": {"target": "nsis"},
    "nsis": {"oneClick": false, "allowToChangeInstallationDirectory": true}
  }
}
```

Run: `npm install`

Expected: a `package-lock.json` is created and install exits with code 0.

- [ ] **Step 2: Write the failing renderer shell test**

```tsx
// tests/renderer/app-shell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';

describe('App', () => {
  it('shows the core desktop navigation', () => {
    render(<App />);
    expect(screen.getByText('求职闭环')).toBeInTheDocument();
    for (const label of ['总览', '岗位', '复盘中心', '项目档案', '问题库', '随想与心得', '设置']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});
```

Run: `npm test -- tests/renderer/app-shell.test.tsx`

Expected: FAIL because `src/renderer/App.tsx` and the DOM setup do not exist.

- [ ] **Step 3: Implement the secure window, preload placeholder, and React shell**

`src/main/index.ts` must create a `BrowserWindow` with:

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
}
```

It must deny unexpected navigation and window creation:

```ts
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', (event) => event.preventDefault());
```

`src/preload/index.ts` initially exposes a frozen version object:

```ts
contextBridge.exposeInMainWorld('jobSearch', Object.freeze({
  version: '0.1.0',
}));
```

`src/renderer/App.tsx` must use `HashRouter`, render the seven required links, and show a placeholder overview route.

- [ ] **Step 4: Run tests, type checks, and production build**

Run:

```powershell
npm test -- tests/renderer/app-shell.test.tsx
npm run typecheck
npm run build
```

Expected: one passing shell test, both TypeScript projects succeed, and `dist/` plus `dist-electron/` are created.

- [ ] **Step 5: Commit the scaffold**

```powershell
git add package.json package-lock.json index.html vite.config.ts vitest.config.ts tsconfig.json tsconfig.electron.json src tests
git commit -m "build: scaffold secure Electron desktop app"
```

## Task 2: Define domain contracts and initialize SQLite

**Files:**
- Create: `src/shared/domain.ts`
- Create: `src/shared/schemas.ts`
- Create: `src/shared/defaults.ts`
- Create: `src/main/migrations.ts`
- Create: `src/main/database.ts`
- Create: `tests/helpers/database.ts`
- Create: `tests/main/database.test.ts`

- [ ] **Step 1: Write the failing migration test**

```ts
// tests/main/database.test.ts
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/database';

describe('database migrations', () => {
  it('creates every Stage 1 table and default stage template', () => {
    const db = createTestDatabase();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).all().map((row) => String(row.name));

    expect(tables).toEqual(expect.arrayContaining([
      'positions', 'process_stages', 'preparation_materials', 'interviews',
      'projects', 'questions', 'capabilities', 'capability_evidence',
      'insights', 'change_proposals', 'asset_versions', 'prompt_templates'
    ]));
    expect(db.prepare('SELECT COUNT(*) AS count FROM prompt_templates').get()).toMatchObject({ count: 3 });
  });
});
```

Run: `npm test -- tests/main/database.test.ts`

Expected: FAIL because the database helper and migrations do not exist.

- [ ] **Step 2: Define exact domain unions and input models**

`src/shared/domain.ts` must export:

```ts
export type CanonicalStage =
  | 'interested' | 'applied' | 'assessment' | 'interview'
  | 'offer' | 'rejected' | 'withdrawn';

export type ProposalStatus = 'pending' | 'accepted' | 'ignored';
export type ProposalTarget = 'project' | 'question' | 'capability' | 'insight';
export type QuestionType = 'interviewer' | 'candidate';

export interface PositionInput {
  company: string;
  title: string;
  interest: 1 | 2 | 3 | 4 | 5;
  rawJd: string;
}

export interface ProcessStageInput {
  positionId: string;
  name: string;
  canonicalStage: CanonicalStage;
  actualDate: string | null;
  expectedDate: string | null;
  feedback: string;
  notes: string;
  orderIndex: number;
}
```

Add full read models for `Position`, `ProcessStage`, `PreparationMaterial`, `Interview`, `Project`, `Question`, `Capability`, `Insight`, `ChangeProposal`, and `DashboardSummary`. Every stored entity uses string UUIDs and ISO timestamps.

- [ ] **Step 3: Implement the schema migration**

`src/main/migrations.ts` must contain a numbered migration that:

- Enables `foreign_keys`, WAL mode, and a 5-second busy timeout.
- Creates the twelve tables asserted by the test.
- Adds foreign keys from stages, preparations, and interviews to positions.
- Adds a unique `(position_id, order_index)` index for process order.
- Adds `CHECK` constraints for enumerated status/type fields.
- Inserts three prompt templates: `岗位准备`, `面试复盘`, and `共性能力分析`.
- Stores the schema version in `PRAGMA user_version`.

Use `STRICT` tables and wrap the migration in `BEGIN IMMEDIATE` / `COMMIT`, rolling back on any exception.

- [ ] **Step 4: Implement database creation and the test helper**

```ts
// src/main/database.ts
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { timeout: 5000 });
  migrate(db);
  return db;
}
```

```ts
// tests/helpers/database.ts
import { openDatabase } from '../../src/main/database';

export function createTestDatabase() {
  return openDatabase(':memory:');
}
```

- [ ] **Step 5: Run migration tests and commit**

Run:

```powershell
npm test -- tests/main/database.test.ts
npm run typecheck
```

Expected: migration test passes and both TypeScript projects pass.

Commit:

```powershell
git add src/shared src/main/database.ts src/main/migrations.ts tests/helpers tests/main/database.test.ts
git commit -m "feat: add Stage 1 domain model and SQLite schema"
```

## Task 3: Build repositories and a typed IPC boundary

**Files:**
- Create: `src/main/repositories/positions.ts`
- Create: `src/main/repositories/preparations.ts`
- Create: `src/main/repositories/interviews.ts`
- Create: `src/main/repositories/proposals.ts`
- Create: `src/main/repositories/assets.ts`
- Create: `src/main/repositories/prompts.ts`
- Create: `src/main/repositories/dashboard.ts`
- Create: `src/shared/ipc.ts`
- Create: `src/main/ipc/register.ts`
- Create: `src/main/ipc/positions.ts`
- Create: `src/main/ipc/assets.ts`
- Create: `src/main/ipc/reviews.ts`
- Create: `src/main/ipc/system.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`
- Create: `tests/main/positions-repository.test.ts`
- Create: `tests/main/proposals-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

```ts
it('creates a position and ordered default stages atomically', () => {
  const repository = createPositionsRepository(createTestDatabase());
  const position = repository.create({
    company: '远山科技',
    title: '产品经理',
    interest: 5,
    rawJd: '负责产品规划与用户研究'
  });

  expect(repository.list()).toHaveLength(1);
  expect(repository.listStages(position.id).map((stage) => stage.canonicalStage))
    .toEqual(['interested', 'applied', 'assessment', 'interview', 'offer']);
});

it('accepts a proposal and versions the target asset in one transaction', () => {
  const { proposals, assets } = createRepositoryFixture();
  const proposal = proposals.create(projectProposalFixture());
  proposals.accept(proposal.id, { name: '搜索项目', background: '新版背景' });

  expect(proposals.get(proposal.id).status).toBe('accepted');
  expect(assets.getProject(proposal.targetId).background).toBe('新版背景');
  expect(assets.listVersions('project', proposal.targetId)).toHaveLength(1);
});
```

Run: `npm test -- tests/main/positions-repository.test.ts tests/main/proposals-repository.test.ts`

Expected: FAIL because repository factories do not exist.

- [ ] **Step 2: Implement repository factories**

Each repository factory accepts a `DatabaseSync` and returns plain methods. All writes use prepared statements and transactions.

Required position methods:

```ts
create(input: PositionInput): Position
update(id: string, input: PositionInput): Position
get(id: string): Position
list(filter?: { query?: string; stage?: CanonicalStage }): PositionListItem[]
remove(id: string): void
listStages(positionId: string): ProcessStage[]
upsertStage(input: ProcessStageInput & { id?: string }): ProcessStage
reorderStages(positionId: string, orderedIds: string[]): ProcessStage[]
```

Required asset methods:

```ts
listProjects(): Project[]
saveProject(input: ProjectInput): Project
listQuestions(type?: QuestionType): Question[]
saveQuestion(input: QuestionInput): Question
listCapabilities(): Capability[]
saveCapability(input: CapabilityInput): Capability
listInsights(): Insight[]
saveInsight(input: InsightInput): Insight
listVersions(type: ProposalTarget, id: string): AssetVersion[]
```

Required proposal methods:

```ts
list(status?: ProposalStatus): ChangeProposal[]
create(input: ChangeProposalInput): ChangeProposal
accept(id: string, editedPayload: unknown): ChangeProposal
ignore(id: string): ChangeProposal
```

`accept` must validate payload by target type and finish in one transaction:

- For `operation: 'create'`, create the target asset and write its new ID back to the proposal.
- For `operation: 'update'`, create an `asset_versions` snapshot before updating the existing asset.
- For `operation: 'merge'`, snapshot the retained asset, merge the accepted payload, and preserve the proposal's source context.
- Mark the proposal accepted only after the asset write succeeds.

Required prompt methods:

```ts
list(): PromptTemplate[]
get(kind: 'preparation' | 'interview-review' | 'capability-analysis'): PromptTemplate
save(kind: PromptTemplate['kind'], content: string): PromptTemplate
```

- [ ] **Step 3: Define the narrow bridge contract**

`src/shared/ipc.ts` must export literal channel names and a `JobSearchApi` interface. Do not expose a generic `invoke`.

```ts
export interface JobSearchApi {
  version: string;
  positions: {
    list(filter?: PositionFilter): Promise<PositionListItem[]>;
    get(id: string): Promise<PositionDetail>;
    create(input: PositionInput): Promise<Position>;
    update(id: string, input: PositionInput): Promise<Position>;
    remove(id: string): Promise<void>;
    saveStage(input: ProcessStageInput & { id?: string }): Promise<ProcessStage>;
  };
  assets: AssetApi;
  reviews: ReviewApi;
  system: SystemApi;
  ai: AiApi;
}
```

- [ ] **Step 4: Register validated IPC handlers and expose preload methods**

Every handler must:

1. Parse input with a Zod schema.
2. Call one repository/service method.
3. Return serializable data.
4. Convert internal errors to `{ code, message }` without stack traces.

The preload must expose explicit nested methods such as:

```ts
positions: {
  list: (filter) => ipcRenderer.invoke(CHANNELS.positionsList, filter),
  get: (id) => ipcRenderer.invoke(CHANNELS.positionGet, id),
  create: (input) => ipcRenderer.invoke(CHANNELS.positionCreate, input),
}
```

- [ ] **Step 5: Run focused tests, type checks, and commit**

Run:

```powershell
npm test -- tests/main/positions-repository.test.ts tests/main/proposals-repository.test.ts
npm run typecheck
```

Expected: repository tests and type checks pass.

Commit:

```powershell
git add src/main/repositories src/main/ipc src/shared src/preload src/renderer/global.d.ts src/main/index.ts tests/main
git commit -m "feat: add repositories and typed IPC bridge"
```

## Task 4: Implement the desktop shell and shared UI primitives

**Files:**
- Create: `src/renderer/components/AppShell.tsx`
- Create: `src/renderer/components/EmptyState.tsx`
- Create: `src/renderer/components/Field.tsx`
- Create: `src/renderer/components/Modal.tsx`
- Create: `src/renderer/components/StatusBadge.tsx`
- Create: `src/renderer/hooks/useAsyncResource.ts`
- Create: `src/renderer/hooks/useToast.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/tokens.css`
- Modify: `src/renderer/styles/app.css`
- Create: `tests/renderer/navigation.test.tsx`

- [ ] **Step 1: Write the failing navigation and accessibility test**

```tsx
it('navigates between all Stage 1 areas and marks the current page', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('link', { name: '岗位' }));
  expect(screen.getByRole('heading', { name: '岗位' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '岗位' })).toHaveAttribute('aria-current', 'page');

  await user.click(screen.getByRole('link', { name: '设置' }));
  expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
});
```

Run: `npm test -- tests/renderer/navigation.test.tsx`

Expected: FAIL because routes and shared components are incomplete.

- [ ] **Step 2: Build the application frame**

Use a fixed 232px sidebar, a responsive content column, Chinese system font stack, and these tokens:

```css
:root {
  --ink: #192235;
  --muted: #6f7b8e;
  --surface: #ffffff;
  --canvas: #f4f6fa;
  --line: #dfe5ed;
  --primary: #5367dd;
  --primary-soft: #eef1ff;
  --success: #16845d;
  --warning: #b36f12;
  --danger: #c44747;
  --radius: 14px;
  font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif;
}
```

The shell must provide visible keyboard focus, semantic navigation, a page title, a global toast region, and a compact database-local indicator.

- [ ] **Step 3: Implement shared form, modal, badge, loading, error, and empty states**

`Modal` must use the native `<dialog>` element, trap focus through browser behavior, close on Escape, and require an accessible title.

`useAsyncResource` must return:

```ts
{ data, loading, error, reload, setData }
```

It must ignore stale promise completions after unmount.

- [ ] **Step 4: Run UI tests and commit**

Run:

```powershell
npm test -- tests/renderer/app-shell.test.tsx tests/renderer/navigation.test.tsx
npm run typecheck
```

Expected: all shell and navigation tests pass.

Commit:

```powershell
git add src/renderer tests/renderer
git commit -m "feat: add polished desktop navigation shell"
```

## Task 5: Implement positions, raw JD, and process dates

**Files:**
- Create: `src/renderer/features/positions/PositionsPage.tsx`
- Create: `src/renderer/features/positions/PositionEditor.tsx`
- Create: `src/renderer/features/positions/PositionDetailPage.tsx`
- Create: `src/renderer/features/positions/StageTimeline.tsx`
- Create: `src/renderer/features/positions/StageEditor.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `tests/renderer/positions-flow.test.tsx`

- [ ] **Step 1: Write the failing position flow test**

```tsx
it('creates a position with raw JD and records an expected interview date', async () => {
  const api = createBridgeFake();
  installBridge(api);
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('link', { name: '岗位' }));
  await user.click(screen.getByRole('button', { name: '录入岗位' }));
  await user.type(screen.getByLabelText('公司'), '远山科技');
  await user.type(screen.getByLabelText('岗位名称'), '产品经理');
  await user.type(screen.getByLabelText('原始 JD'), '负责产品规划与用户研究');
  await user.click(screen.getByRole('button', { name: '保存岗位' }));

  expect(api.positions.create).toHaveBeenCalledWith(expect.objectContaining({
    company: '远山科技',
    title: '产品经理',
    rawJd: '负责产品规划与用户研究'
  }));

  await user.click(screen.getByRole('button', { name: '编辑流程' }));
  await user.type(screen.getByLabelText('预计日期'), '2026-08-01');
  await user.click(screen.getByRole('button', { name: '保存节点' }));
  expect(api.positions.saveStage).toHaveBeenCalled();
});
```

Run: `npm test -- tests/renderer/positions-flow.test.tsx`

Expected: FAIL because position pages do not exist.

- [ ] **Step 2: Implement position list and filters**

List rows show company, title, interest, current stage, last process date, and result. Filters support free-text query and canonical stage. Do not display or store application source.

- [ ] **Step 3: Implement the position editor**

Required validation:

- Company: 1–120 characters.
- Title: 1–120 characters.
- Interest: integer 1–5.
- Raw JD: 1–100,000 characters.

On failed persistence, keep all user-entered values and show a non-destructive error.

- [ ] **Step 4: Implement position detail tabs and editable timeline**

Tabs:

- 概况.
- 原始 JD.
- 流程.
- 准备材料.
- 面试记录.

The timeline shows actual and expected dates separately. Users can add, rename, map, reorder, skip, and edit stages. The UI must state that dates are records, not reminders.

- [ ] **Step 5: Run position tests and commit**

Run:

```powershell
npm test -- tests/main/positions-repository.test.ts tests/renderer/positions-flow.test.tsx
npm run typecheck
```

Expected: all position repository and UI tests pass.

Commit:

```powershell
git add src/renderer/features/positions src/renderer/App.tsx tests/renderer/positions-flow.test.tsx
git commit -m "feat: add job records and custom process timeline"
```

## Task 6: Implement reusable personal assets

**Files:**
- Create: `src/renderer/features/projects/ProjectsPage.tsx`
- Create: `src/renderer/features/projects/ProjectEditor.tsx`
- Create: `src/renderer/features/questions/QuestionsPage.tsx`
- Create: `src/renderer/features/questions/QuestionEditor.tsx`
- Create: `src/renderer/features/capabilities/CapabilitiesPanel.tsx`
- Create: `src/renderer/features/insights/InsightsPage.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `tests/renderer/assets-flow.test.tsx`
- Create: `tests/main/assets-repository.test.ts`

- [ ] **Step 1: Write failing asset repository and UI tests**

```ts
it('versions a project whenever an accepted edit changes its narrative', () => {
  const repo = createAssetsRepository(createTestDatabase());
  const project = repo.saveProject(projectFixture({ background: '旧背景' }));
  repo.saveProject({ ...project, background: '新背景' });
  expect(repo.listVersions('project', project.id)).toHaveLength(1);
});
```

```tsx
it('keeps interviewer questions and candidate questions separate', async () => {
  installBridge(createBridgeFake());
  render(<App />);
  await userEvent.click(screen.getByRole('link', { name: '问题库' }));
  expect(screen.getByRole('tab', { name: '面试官问题' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '候选人反问' })).toBeInTheDocument();
});
```

Run: `npm test -- tests/main/assets-repository.test.ts tests/renderer/assets-flow.test.tsx`

Expected: FAIL because asset persistence and pages are missing.

- [ ] **Step 2: Implement project records and versions**

The editor contains exact fields from the approved design: project name, background, goal, role, key decisions, result, evidence, reflection, and narrative versions. Show version history read-only in a side panel.

- [ ] **Step 3: Implement the two question libraries**

Each question stores type, text, answer draft, linked project IDs, linked capability IDs, and occurrence count. The two types use separate tabs and separate create buttons.

- [ ] **Step 4: Implement capabilities and insights**

Capabilities display name, JD frequency, evidence, and gaps. Insights remain free text with optional links to positions, projects, questions, and capabilities.

- [ ] **Step 5: Run asset tests and commit**

Run:

```powershell
npm test -- tests/main/assets-repository.test.ts tests/renderer/assets-flow.test.tsx
npm run typecheck
```

Expected: asset repository and UI tests pass.

Commit:

```powershell
git add src/main/repositories/assets.ts src/renderer/features src/renderer/App.tsx tests/main/assets-repository.test.ts tests/renderer/assets-flow.test.tsx
git commit -m "feat: add reusable projects questions capabilities and insights"
```

## Task 7: Implement encrypted AI settings and the provider adapter

**Files:**
- Create: `src/main/services/ai-settings.ts`
- Create: `src/main/services/ai-client.ts`
- Create: `src/main/ipc/ai.ts`
- Create: `src/renderer/features/settings/SettingsPage.tsx`
- Create: `src/renderer/features/settings/PromptTemplatesSection.tsx`
- Create: `src/shared/schemas.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/preload/index.ts`
- Create: `tests/main/ai-settings.test.ts`
- Create: `tests/main/ai-client.test.ts`
- Create: `tests/renderer/settings.test.tsx`
- Create: `tests/main/prompts-repository.test.ts`

- [ ] **Step 1: Write failing encryption and client tests**

```ts
it('stores the API key encrypted and never returns it to the renderer', async () => {
  const storage = createAiSettingsStore({
    encrypt: async (value) => Buffer.from(`encrypted:${value}`),
    decrypt: async (value) => value.toString().replace('encrypted:', ''),
    settingsPath
  });

  await storage.save({ baseUrl: 'https://api.example.com/v1', model: 'model-a', apiKey: 'secret' });
  expect(readFileSync(settingsPath, 'utf8')).not.toContain('secret');
  expect(await storage.getPublic()).toEqual({
    baseUrl: 'https://api.example.com/v1',
    model: 'model-a',
    hasApiKey: true
  });
});

it('rejects invalid JSON instead of returning an unchecked AI result', async () => {
  const client = createAiClient({ fetch: async () => jsonResponse({ choices: [{ message: { content: 'not json' } }] }) });
  await expect(client.completeJson(requestFixture(), preparationOutputSchema))
    .rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
});
```

Run: `npm test -- tests/main/ai-settings.test.ts tests/main/ai-client.test.ts`

Expected: FAIL because AI services do not exist.

- [ ] **Step 2: Implement encrypted settings**

Use Electron `safeStorage.encryptStringAsync` and `decryptStringAsync` after `app.whenReady()`. Save only encrypted key bytes encoded as base64. Return only `hasApiKey` to the renderer.

Settings fields:

- `baseUrl`, normalized without trailing slash.
- `model`.
- encrypted `apiKey`.
- request timeout, fixed at 60 seconds in V1.

- [ ] **Step 3: Implement the OpenAI-compatible JSON client**

Send `POST {baseUrl}/chat/completions` with bearer authentication, selected model, messages, and `temperature: 0.2`. Use `AbortController` for timeout.

Map failures to exact codes:

- `AI_NOT_CONFIGURED`.
- `AI_AUTH_FAILED`.
- `AI_RATE_LIMITED`.
- `AI_TIMEOUT`.
- `AI_PROVIDER_ERROR`.
- `AI_INVALID_OUTPUT`.

Parse `choices[0].message.content` as JSON and validate with the supplied Zod schema.

- [ ] **Step 4: Implement settings UI and connection test**

The renderer can save endpoint, model, and a replacement key, but can never read the stored key. “测试连接” sends a minimal request through the main process and reports success or the mapped failure code in Chinese.

The same page must provide three editable prompt templates:

- 岗位准备.
- 面试复盘.
- 共性能力分析.

Saving an empty template is rejected. Each AI service loads the current template and saves the exact content into its historical snapshot or result metadata.

- [ ] **Step 5: Run AI tests and commit**

Run:

```powershell
npm test -- tests/main/ai-settings.test.ts tests/main/ai-client.test.ts tests/main/prompts-repository.test.ts tests/renderer/settings.test.tsx
npm run typecheck
```

Expected: encryption, invalid-output, and settings UI tests pass.

Commit:

```powershell
git add src/main/services src/main/repositories/prompts.ts src/main/ipc src/shared/schemas.ts src/preload src/renderer/features/settings tests
git commit -m "feat: add encrypted external AI configuration"
```

## Task 8: Generate versioned preparation materials on demand

### 用户确认补充：四层岗位准备框架（2026-07-27）

本补充不改变既有任务状态，只扩展 Task 8 的输出契约与兼容要求。

- 默认“岗位准备” Prompt 加入 `Map Competencies`、`Company Map`、`Dream Candidate Avatar`、`Action Guide` 四层框架；分析使用中文并保留 English terms。
- `competencyMap` 必须是按关键词频率、位置和强调程度排序的 Top 5，rank 唯一且依次为 1—5。
- `companyMap.stage` 严格限制为 `Startup | Turnaround | Realignment | Sustaining Success | Crisis`。
- `dreamCandidateAvatar` 包含 `Typical Day` 时间线、`Superpower`、`Success Story`、`Quote`、`Pain Profile`。
- `Typical Day` 是任务时间线；`Superpower` 用简单语言说明如何解决 JD 最大痛点；`Success Story` 是使用该能力的成功故事；`Quote` 体现信念体系；`Pain Profile` 说明岗位为何存在及候选人如何解决。
- `actionGuide` 包含自我介绍 tagline、文化匹配表达和恰好 3 个定制收尾问题。
- 新 AI 结果必须保留原六字段并完整包含四组新字段；旧六字段快照作为 legacy 继续可读并明确标注。
- 更新后的默认 Prompt 只应用于新安装或缺失默认值的初始化；绝不覆盖用户已经保存的自定义 Prompt。
- 生成确认页仍明确展示“当前岗位准备 Prompt 的完整内容将发送”；主进程在确认后读取最新 Prompt，并将同一份原文写入不可变快照。
- 单条损坏历史记录必须被隔离；岗位详情、列表和其他有效版本继续可用。
- 发送确认使用 main 提供的只读 preview IPC：按与生成服务相同的装配和 canonical 序列化路径返回 exact Prompt、完整岗位/JD、完整所选项目/问题及实际岗位数据 JSON。共享严格 schema 规范对象 key order，保留数组顺序和 Unicode，并拒绝篡改 JSON。preview 不调用 AI、不落库，renderer 不能传入 Prompt；内容默认折叠并以安全文本显示。preview pending 时锁定选择，最终 generate 使用 preview 时捕获的 ID 快照；返回修改选择会丢弃旧 preview。生成时仍重读当前数据，UI 明确提示变更后需重新预览。

RED 记录：先增加默认 Prompt、严格输出约束、服务请求契约、四组 UI、legacy 兼容、隐私确认与损坏快照隔离测试；初次运行因实现尚无新字段与新界面而按预期失败，再进入实现。

**Files:**
- Create: `src/main/services/preparation.ts`
- Modify: `src/main/repositories/preparations.ts`
- Modify: `src/main/ipc/ai.ts`
- Create: `src/renderer/features/preparations/PreparationPanel.tsx`
- Create: `src/renderer/features/preparations/GeneratePreparationModal.tsx`
- Create: `tests/main/preparation-service.test.ts`
- Create: `tests/renderer/preparation-flow.test.tsx`

- [ ] **Step 1: Write the failing preparation snapshot test**

```ts
it('stores a preparation with immutable JD, prompt, and asset snapshots', async () => {
  const service = createPreparationService(fixtureDependencies());
  const result = await service.generate({
    positionId: 'position-1',
    projectIds: ['project-1'],
    questionIds: ['question-1']
  });

  const saved = fixtureDependencies().preparations.get(result.id);
  expect(saved.rawJdSnapshot).toBe('原始 JD 文本');
  expect(saved.promptSnapshot).toContain('岗位准备');
  expect(JSON.parse(saved.assetsSnapshot)).toMatchObject({
    projects: [{ id: 'project-1' }],
    questions: [{ id: 'question-1' }]
  });
});
```

Run: `npm test -- tests/main/preparation-service.test.ts`

Expected: FAIL because the preparation service does not exist.

- [ ] **Step 2: Define and validate the preparation output**

The output schema must contain:

```ts
{
  roleSummary: string;
  capabilityFocus: Array<{ name: string; reason: string }>;
  projectTalkingPoints: Array<{ projectId: string; points: string[] }>;
  likelyQuestions: Array<{ question: string; answerOutline: string }>;
  candidateQuestions: string[];
  riskNotes: string[];
  competencyMap: Array<{
    rank: 1 | 2 | 3 | 4 | 5;
    name: string;
    evidence: string;
  }>; // exactly five, ordered 1..5
  companyMap: {
    stage: 'Startup' | 'Turnaround' | 'Realignment' | 'Sustaining Success' | 'Crisis';
    summary: string;
    priorities: string[];
    culture: string[];
  };
  dreamCandidateAvatar: {
    typicalDay: Array<{ time: string; activity: string; purpose: string }>;
    superpower: string;
    successStory: string;
    quote: string;
    painProfile: string;
  };
  actionGuide: {
    selfIntroTagline: string;
    cultureFitPhrase: string;
    questions: [string, string, string];
  };
}
```

Historical reads additionally accept the original strict six-field shape as a labeled legacy version. New generation and persistence accept only the complete shape above.

- [ ] **Step 3: Implement prompt assembly and immutable persistence**

Load the position and only the user-selected assets. Save raw JD, prompt, asset JSON, model name, output JSON, and generation time before returning.

The service must not mutate projects, questions, capabilities, or insights.

- [ ] **Step 4: Implement the preparation UI**

The position detail “准备材料” tab shows past versions newest first. The generate modal requires explicit asset selection and shows an estimated payload summary before the user confirms the AI call.

- [ ] **Step 5: Run preparation tests and commit**

Run:

```powershell
npm test -- tests/main/preparation-service.test.ts tests/renderer/preparation-flow.test.tsx
npm run typecheck
```

Expected: preparation service and UI tests pass.

Commit:

```powershell
git add src/main/services/preparation.ts src/main/repositories/preparations.ts src/main/ipc/ai.ts src/renderer/features/preparations tests
git commit -m "feat: generate immutable job preparation snapshots"
```

## Task 9: Implement interview review and controlled asset updates

**Files:**
- Create: `src/main/services/interview-review.ts`
- Modify: `src/main/repositories/interviews.ts`
- Modify: `src/main/repositories/proposals.ts`
- Modify: `src/main/ipc/reviews.ts`
- Create: `src/renderer/features/interviews/InterviewEditor.tsx`
- Create: `src/renderer/features/interviews/InterviewPanel.tsx`
- Create: `src/renderer/features/reviews/ReviewCenterPage.tsx`
- Create: `src/renderer/components/ProposalCard.tsx`
- Create: `tests/main/interview-review.test.ts`
- Create: `tests/main/proposal-acceptance.test.ts`
- Create: `tests/renderer/review-flow.test.tsx`

- [ ] **Step 1: Write failing summary and review tests**

```ts
it('creates pending proposals but does not change assets', async () => {
  const fixture = createInterviewReviewFixture();
  await fixture.service.review('interview-1');

  expect(fixture.proposals.list('pending')).toHaveLength(3);
  expect(fixture.assets.listQuestions()).toHaveLength(0);
  expect(fixture.assets.listInsights()).toHaveLength(0);
});

it('lets the user edit a proposal before accepting it', async () => {
  installBridge(createBridgeFakeWithPendingProposal());
  render(<App />);
  await userEvent.click(screen.getByRole('link', { name: '复盘中心' }));
  await userEvent.click(screen.getByRole('button', { name: '编辑后接受' }));
  await userEvent.clear(screen.getByLabelText('建议内容'));
  await userEvent.type(screen.getByLabelText('建议内容'), '用户确认后的问题');
  await userEvent.click(screen.getByRole('button', { name: '确认写入' }));
  expect(window.jobSearch.reviews.acceptProposal).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ text: '用户确认后的问题' })
  );
});
```

Run: `npm test -- tests/main/interview-review.test.ts tests/renderer/review-flow.test.tsx`

Expected: FAIL because review services and pages do not exist.

- [ ] **Step 2: Define the interview review output contract**

```ts
{
  summary: string;
  strengths: string[];
  gaps: string[];
  proposals: Array<{
    targetType: 'project' | 'question' | 'capability' | 'insight';
    targetId: string | null;
    operation: 'create' | 'update' | 'merge';
    rationale: string;
    payload: unknown;
  }>;
}
```

Validate target-specific payloads before creating proposals.

- [ ] **Step 3: Implement interview persistence and AI review**

Users can create and edit interview text before review. Reviewing saves the summary and creates only `pending` proposals linked internally to the position and interview.

On timeout or invalid AI output:

- Keep the interview text.
- Do not save a partial summary.
- Do not create proposals.
- Allow a safe retry.

- [ ] **Step 4: Implement the review center**

Each proposal card shows target, operation, rationale, suggested content, linked job/interview context, and three actions:

- 接受.
- 编辑后接受.
- 忽略.

Acceptance is disabled until local payload validation succeeds.

- [ ] **Step 5: Run review tests and commit**

Run:

```powershell
npm test -- tests/main/interview-review.test.ts tests/main/proposal-acceptance.test.ts tests/renderer/review-flow.test.tsx
npm run typecheck
```

Expected: all interview and review tests pass.

Commit:

```powershell
git add src/main/services/interview-review.ts src/main/repositories src/main/ipc/reviews.ts src/renderer/features/interviews src/renderer/features/reviews src/renderer/components/ProposalCard.tsx tests
git commit -m "feat: add review-before-write interview learning loop"
```

## Task 10: Implement dashboard statistics and capability analysis

**Files:**
- Modify: `src/main/repositories/dashboard.ts`
- Create: `src/main/services/capability-analysis.ts`
- Modify: `src/main/ipc/system.ts`
- Create: `src/renderer/features/dashboard/DashboardPage.tsx`
- Create: `src/renderer/features/dashboard/StageDistribution.tsx`
- Create: `src/renderer/features/dashboard/ProcessTimeline.tsx`
- Create: `src/renderer/features/dashboard/CapabilityFrequency.tsx`
- Create: `tests/main/dashboard.test.ts`
- Create: `tests/main/capability-analysis.test.ts`
- Create: `tests/renderer/dashboard.test.tsx`

- [ ] **Step 1: Write failing aggregate tests**

```ts
it('counts positions once even when they have multiple interview stages', () => {
  const repo = createDashboardRepository(databaseWithDashboardFixture());
  expect(repo.getSummary()).toMatchObject({
    totalPositions: 3,
    positionsWithInterviews: 2,
    completedReviews: 1,
    pendingProposals: 2
  });
});
```

Run: `npm test -- tests/main/dashboard.test.ts`

Expected: FAIL because aggregate queries are missing.

- [ ] **Step 2: Write the failing explicit capability-analysis test**

```ts
it('turns selected raw JDs into pending capability proposals only after an explicit request', async () => {
  const fixture = createCapabilityAnalysisFixture();
  await fixture.service.analyze(['position-1', 'position-2']);

  expect(fixture.ai.completeJson).toHaveBeenCalledTimes(1);
  expect(fixture.proposals.list('pending')).toEqual([
    expect.objectContaining({
      targetType: 'capability',
      operation: 'create',
      payload: expect.objectContaining({ name: '用户研究', jdFrequency: 2 })
    })
  ]);
  expect(fixture.assets.listCapabilities()).toHaveLength(0);
});
```

Run: `npm test -- tests/main/capability-analysis.test.ts`

Expected: FAIL because the capability-analysis service does not exist.

- [ ] **Step 3: Implement stable aggregate queries**

Calculate:

- Total positions.
- Current stage distribution.
- Distinct positions that reached interview.
- Interviews with completed summaries.
- Pending proposal count.
- Actual and expected process events ordered by date.
- Capability frequencies and evidence counts.

All statistics derive from canonical stages, not custom stage labels.

- [ ] **Step 4: Implement explicit multi-JD capability analysis**

The dashboard action “分析共性能力” opens a position selector and payload summary. After confirmation, the service sends only the selected raw JD texts and the current `共性能力分析` prompt to AI.

Validate this output:

```ts
{
  capabilities: Array<{
    name: string;
    jdFrequency: number;
    evidence: string[];
    gaps: string[];
  }>;
}
```

Create pending `capability` proposals; do not write capability assets directly. Store selected position IDs on each proposal for internal traceability.

- [ ] **Step 5: Build the overview page**

The page shows four summary cards, stage distribution, date timeline, recent positions, and capability frequency. It must explicitly label expected dates and avoid task/reminder language.

- [ ] **Step 6: Run dashboard tests and commit**

Run:

```powershell
npm test -- tests/main/dashboard.test.ts tests/main/capability-analysis.test.ts tests/renderer/dashboard.test.tsx
npm run typecheck
```

Expected: aggregate and dashboard tests pass.

Commit:

```powershell
git add src/main/repositories/dashboard.ts src/main/services/capability-analysis.ts src/main/ipc/system.ts src/renderer/features/dashboard tests
git commit -m "feat: add job progress and capability overview"
```

## Task 11: Implement local backup and validated restore

**Files:**
- Create: `src/main/services/backup.ts`
- Modify: `src/main/ipc/system.ts`
- Create: `src/renderer/features/settings/BackupSection.tsx`
- Create: `tests/main/backup.test.ts`
- Create: `tests/renderer/backup.test.tsx`

- [ ] **Step 1: Write the failing round-trip test**

```ts
it('restores an exported database without losing the closed-loop records', async () => {
  const fixture = createBackupFixture();
  fixture.seedCompleteLoop();
  await fixture.backup.exportTo(fixture.backupPath);
  fixture.clearLiveDatabase();
  await fixture.backup.restoreFrom(fixture.backupPath);

  expect(fixture.positions.list()).toHaveLength(2);
  expect(fixture.proposals.list('accepted')).toHaveLength(1);
  expect(fixture.preparations.listByPosition('position-2')).toHaveLength(1);
});
```

Run: `npm test -- tests/main/backup.test.ts`

Expected: FAIL because backup service does not exist.

- [ ] **Step 2: Implement backup export**

Use `node:sqlite` backup into a temporary file, validate the copied schema version, then atomically move it to the user-selected `.jobloop` path. Do not include AI settings or API keys.

- [ ] **Step 3: Implement validated restore**

Before replacing the live database:

1. Open the selected file read-only.
2. Verify required tables and supported schema version.
3. Close the live connection.
4. Copy the live database to a timestamped rollback file.
5. Replace the live database.
6. Reopen and run migrations.
7. Restore the rollback file automatically if reopening fails.

- [ ] **Step 4: Implement native dialog UI flow**

Use main-process `dialog.showSaveDialog` and `dialog.showOpenDialog`. Show a destructive confirmation before restore, then restart the application after success.

- [ ] **Step 5: Run backup tests and commit**

Run:

```powershell
npm test -- tests/main/backup.test.ts tests/renderer/backup.test.tsx
npm run typecheck
```

Expected: backup round-trip and UI tests pass.

Commit:

```powershell
git add src/main/services/backup.ts src/main/ipc/system.ts src/renderer/features/settings/BackupSection.tsx tests
git commit -m "feat: add local database backup and recovery"
```

## Task 12: Verify the complete loop and package Windows V1

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/closed-loop.spec.ts`
- Create: `tests/e2e/fixtures/fake-ai-server.ts`
- Create: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Write the failing Electron end-to-end test**

The test must launch Electron with:

- A temporary `userData` directory.
- A deterministic local fake AI endpoint.
- A clean database.

It must execute the approved acceptance flow:

```ts
test('turns one interview into reusable preparation for the next job', async () => {
  const app = await launchTestApp();
  const window = await app.firstWindow();

  await createPosition(window, {
    company: '远山科技',
    title: '产品经理',
    rawJd: '需要用户研究和产品规划能力'
  });
  await addProcessDate(window, '面试', '2026-08-01');
  await generatePreparation(window);
  await addInterview(window, '面试官询问了用户研究方法');
  await reviewInterview(window);
  await acceptQuestionProposal(window, '如何设计用户研究？');

  await createPosition(window, {
    company: '海川软件',
    title: '产品运营',
    rawJd: '要求用户洞察和跨团队协作'
  });
  await generatePreparation(window, { includeQuestion: '如何设计用户研究？' });

  await expect(window.getByText('如何设计用户研究？')).toBeVisible();
  await app.close();
});
```

Run: `npm run test:e2e -- tests/e2e/closed-loop.spec.ts`

Expected: FAIL until all routes and bridge methods are connected end to end.

- [ ] **Step 2: Connect missing end-to-end wiring**

Fix only issues exposed by the acceptance test. Do not add Stage 2 features. Confirm that the fake AI server receives data only after explicit button clicks.

- [ ] **Step 3: Run the full verification suite**

Run:

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Expected:

- All Vitest tests pass.
- TypeScript reports zero errors.
- Renderer and Electron builds succeed.
- The closed-loop Electron test passes.

- [ ] **Step 4: Build and smoke-test the Windows installer**

Run:

```powershell
npm run package:win
```

Expected: `release/` contains an NSIS installer and unpacked application.

Install or run the unpacked application with a clean user-data directory. Verify:

- App opens without a console window.
- Local database is created.
- Closing and reopening preserves a manually created position.
- Renderer DevTools are not opened automatically.

- [ ] **Step 5: Document local development, privacy, and V1 limits**

`README.md` must include:

- Installation and development commands.
- Local data location.
- How to configure an OpenAI-compatible API.
- What content is sent to the provider.
- How backup and restore work.
- Explicit V1 exclusions.
- Link to the approved design document.

- [ ] **Step 6: Commit the verified V1**

```powershell
git add package.json playwright.config.ts tests/e2e README.md
git commit -m "test: verify and package desktop V1 closed loop"
```

## 3. Final completion checklist

Before calling Desktop V1 complete:

- [ ] All twelve task commits exist.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run package:win` produces an installer.
- [ ] The database contains no application-source field and no persisted structured JD.
- [ ] AI mutations cannot bypass pending proposals.
- [ ] Preparation history remains immutable after asset edits.
- [ ] API keys are encrypted and never returned to the renderer.
- [ ] Backup excludes API credentials and restores the complete loop.
- [ ] The README states that mobile, OCR, recordings, and LAN sync are later stages.

## 4. Technical references

- Electron process model and context isolation: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron IPC guidance: https://www.electronjs.org/docs/latest/tutorial/ipc
- Electron safe storage: https://www.electronjs.org/docs/latest/api/safe-storage
- Electron 43 release line: https://releases.electronjs.org/release/v43.2.0
- Node SQLite API: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- Vite 8: https://vite.dev/blog/announcing-vite8
- Vitest: https://vitest.dev/guide/
- Playwright Electron: https://playwright.dev/docs/api/class-electron

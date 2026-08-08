# Sol / Luna 全局执行分工 Implementation Plan

> **For agentic workers:** This configuration task must be executed by Sol because it writes global policy and controls permissions. Do not delegate it to Luna.

**Goal:** 部署并验证全局 Sol/Luna 调度规范及 Luna Max 隔离 CLI 兜底。

**Architecture:** 以全局 `AGENTS.md` 作为调度策略来源，复用现有 `luna_worker.toml`；用一个只接受 JSON 任务契约的 PowerShell 包装器提供 fail-closed CLI 兜底。

**Tech Stack:** Codex global AGENTS、TOML、PowerShell、Codex CLI、Git。

---

### Task 1: 部署全局调度规范

**Files:**
- Modify: `C:\Users\Administrator\.codex\AGENTS.md`
- Modify: `C:\Users\Administrator\.codex\agents\luna-worker.toml`

- [ ] 写入 Sol/Luna 职责、委派门槛、文件互斥、权限回交和 Sol 强制复验规则。
- [ ] 保持主线程 `gpt-5.6-sol/high` 与 Worker `gpt-5.6-luna/max`。
- [ ] 读取两个文件并检查所需规则均存在。

### Task 2: 部署隔离 CLI 兜底

**Files:**
- Create: `C:\Users\Administrator\.codex\bin\luna-work.ps1`
- Create: `C:\Users\Administrator\.codex\templates\luna-task.example.json`

- [ ] 校验 JSON 任务契约的必填字段及工作目录。
- [ ] 固定 Luna Max、workspace-write、`approval_policy=never` 和 ephemeral。
- [ ] 记录执行前后 Git 变更；检测到允许范围外的新变更时返回失败。
- [ ] 使用无效任务文件验证 fail-closed 路径，不产生项目修改。

### Task 3: 验收

- [ ] Sol 重新读取全部部署文件。
- [ ] Sol 核对模型、权限、文件互斥、结果格式与复验规则。
- [ ] Sol 运行 PowerShell 语法检查和任务契约失败测试。
- [ ] 在最终说明中明确原生 Worker 优先、CLI 仅为兜底。

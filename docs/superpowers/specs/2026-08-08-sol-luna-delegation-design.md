# Sol / Luna 全局执行分工设计

## 目标

把“Sol 负责理解、决策、风险与最终验收，Luna Max 负责边界明确的执行项”固化为所有项目默认遵循的工作方式。

## 已有能力

- 全局主模型已经是 `gpt-5.6-sol`，推理强度为 `high`。
- 已存在原生 `luna_worker`，模型为 `gpt-5.6-luna`，推理强度为 `max`。
- Codex CLI 支持显式模型、推理强度、工作目录、workspace-write 沙箱和禁止审批的非交互执行。

## 调度规则

Sol 始终留在主线程，负责需求理解、方案取舍、任务拆分、文件冲突协调、权限与破坏性操作、发布以及最终验收。

Luna 仅接受满足全部条件的任务：

1. 目标能用一句话表达。
2. 工作目录、允许修改的文件、禁止范围和验证命令均明确。
3. 任务可以独立完成，不依赖尚未确认的产品决策。
4. 不涉及权限升级、发布、删除、外部写入、凭据或安全边界决策。
5. 与其他并行 Worker 的允许文件集合不重叠。

Luna 完成后必须返回结果、验证证据、实际修改文件、假设和剩余风险。Sol 必须自行检查 diff、核对文件范围并重新运行关键验证；没有 Sol 的独立复核，不得宣称完成。

## CLI 兜底

当原生 `luna_worker` 不可调用时，Sol 可调用 `~/.codex/bin/luna-work.ps1 <task.json>`。任务文件必须包含：

- `objective`
- `workingDirectory`
- `allowedFiles`
- `forbiddenScope`
- `verificationCommands`
- 可选 `outputFile`

脚本固定使用 `gpt-5.6-luna`、`max`、`workspace-write`、`approval_policy=never` 和 ephemeral 会话。权限不足、任务契约不完整、CLI 不可用或 Worker 修改允许范围外的文件时，脚本返回非零状态并交回 Sol，不自行扩大权限或清理现场。

## 范围

- 全局规则写入 `~/.codex/AGENTS.md`，对所有项目生效。
- 保留现有 `~/.codex/agents/luna-worker.toml`，只补强边界与汇报要求。
- 当前项目的核心优先规则继续生效，不被全局分工覆盖。

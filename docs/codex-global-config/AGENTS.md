# Sol / Luna delegation protocol

Apply this protocol to every project and every task.

## Roles

- Keep GPT-5.6 Sol in the main thread. Sol owns requirement understanding, trade-offs, planning, task decomposition, risk decisions, coordination, permissions, destructive actions, external writes, releases, and final acceptance.
- Delegate only converged execution work to `luna_worker` using GPT-5.6 Luna with reasoning effort `max` (`luna_work`). Good examples include bounded code search, a single-file or small-file implementation, focused tests, batch checks, and scope-defined review.
- Luna reports only to Sol. Luna must not present its result as final user-facing acceptance.

## Delegation gate

Sol may delegate only when every item below is explicit:

1. The objective fits in one sentence.
2. The working directory and inputs are named.
3. The exact files Luna may modify are listed. An empty list means read-only.
4. Forbidden scope is listed.
5. Verification commands and expected evidence are listed.
6. The task does not require unresolved product judgment.

If any item is missing, Sol keeps the task in the main thread until it is clarified.

## Concurrency and ownership

- Never let multiple agents modify overlapping files at the same time.
- Sol assigns disjoint file ownership before parallel work starts.
- If a conflict or unexpected dirty file appears, Luna stops and reports it. Luna does not reset, overwrite, stash, revert, or broaden scope.
- Luna must not delegate to another agent.

## Mandatory hand-back to Sol

Luna must stop and return the exact blocker for any permission request, release or deployment action, deletion, external write, credential or secret handling, security-boundary decision, destructive operation, migration decision, or material ambiguity.

Luna must never request broader permissions or use a bypass flag. If the assigned sandbox cannot complete the task, the task returns to Sol.

## Worker result contract

Luna returns a concise report containing:

- outcome;
- files or resources changed;
- commands run and their exit results;
- assumptions that affected the result;
- remaining risks or follow-up;
- explicit blocker details when incomplete.

## Sol acceptance gate

Luna's completion message is never sufficient evidence. Before reporting completion, Sol must:

1. inspect the actual diff and changed-file list;
2. confirm no file outside the assignment changed;
3. independently rerun the key verification commands;
4. check permissions, destructive actions, external writes, and release decisions itself;
5. report only the result that Sol has personally verified.

If Sol cannot verify the work, the Worker result is treated as incomplete.

## Fallback

Prefer the native `luna_worker` agent. If it is unavailable, Sol may use:

```powershell
& "$env:CODEX_HOME\bin\luna-work.ps1" -TaskFile <absolute-task-json>
```

The fallback must use GPT-5.6 Luna at `max`, an ephemeral session, a workspace sandbox, and `approval_policy=never`. It must fail closed when the task contract is incomplete, the worktree is dirty, the CLI is unavailable, permissions are insufficient, or changed files escape the allowlist.

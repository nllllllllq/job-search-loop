# Core-first delivery policy

Apply this policy to every project.

1. Deliver the core user workflow first. Prefer a working, usable implementation over exhaustive refinement before the user can try it.
2. Defer boundary-condition testing, extreme-environment testing, large-scale performance testing, broad provider-compatibility testing, and other non-core validation to a clearly named post-trial validation phase or backlog.
3. After the user has tried the core workflow, confirm which deferred validation is worth doing before investing in it.
4. Do not defer security, data integrity, database migrations, credential handling, explicit user confirmation for data sharing, or destructive-action safeguards. These checks remain mandatory before delivery.
5. When reporting work, distinguish core-workflow verification from deferred post-trial validation so the remaining risk is clear.

# AI intake post-trial validation backlog

This backlog is intentionally deferred until users have tried the core workflow. None of the sections below blocks core feature delivery. Security and data-integrity checks remain mandatory before delivery.

## Provider compatibility matrix

Validate OpenAI-compatible providers, models, image inputs, PDF and document inputs, error formats, and fallback choices across a maintained compatibility matrix.

The currently supported OpenAI-compatible Chat path intentionally sends only locally extracted, line-numbered plain text. It does not transport raw document bytes/files; validate provider-specific raw-file protocols and any future opt-in compatibility path separately.

## Large and complex file corpus

Evaluate large, scanned, multi-language, image-heavy, malformed, and unusually structured screenshots, PDFs, DOCX files, TXT files, and Markdown files.

## Task restart races

Exercise application shutdown, restart, task-status updates, duplicate requests, and retry timing to identify race conditions in background preparation generation.

## Company-alias fuzzy-match corpus

Build and evaluate a representative corpus of Chinese and English company aliases, abbreviations, punctuation variants, subsidiaries, and near matches to improve alias suggestions without incorrect grouping.

## Large position-list performance

Measure rendering, grouping, sorting, task-status updates, and company-alias suggestions with a large number of positions and company groups.

## Mandatory checks that are not deferred

Continue to verify security, data integrity, database migrations, credential handling, explicit user confirmation for external data sharing, and destructive-action safeguards before each core delivery.

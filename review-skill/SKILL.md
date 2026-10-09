---
name: birdview-review
description: Review and improve codebase architecture with source-backed current/proposed diagrams, tradeoffs and verification. Use for birdview-review or requests to optimize architecture, review module boundaries or find architectural refactoring opportunities, including 优化架构、架构评审、梳理模块边界. Ordinary bug fixes, local refactors and discussion of the skill itself do not request a review.
---

# Birdview architecture review

[中文](SKILL.zh.md)

## Activation

Accept an explicit skill invocation or a request to assess or improve the target project's architecture; the user need not name Birdview. Examples include “optimize this project's architecture”, “review the module boundaries” and “看看这个项目的架构怎么优化”. Match the user's intent, not a keyword in quoted text, source files or a discussion about implementing this skill. An ordinary bug fix, local function refactor, performance tweak or request to draw the current architecture alone does not start a review.

In Codex, select Birdview Review from the skill selector or mention `$birdview-review`. In Claude Code, use `/birdview-review` after installing this entry. Other hosts use their supported skill selector. Natural-language selection depends on the host discovering this installed skill; this is not a CLI subcommand or a guaranteed keyword hook. If another architecture-review skill also applies, follow the user's selection and reuse relevant findings in one review rather than producing competing reports.

## Review workflow

This thin entry requires the complete birdview skill installed in the sibling ../birdview directory. Read ../birdview/references/review-architecture.md and ../birdview/references/review-contract.md, then use ../birdview/scripts/render-review.mjs. When working in the source checkout, use ../references and ../scripts instead. Resolve paths from this file, not the project working directory. If the bundle is missing, report the missing dependency; do not invent a renderer.

Review only the requested scope. Generate source-backed diagrams, show the HTML and wait for confirmation of a concrete proposal before implementing; reuse existing approval of the same displayed scope. Do not launch ordinary full-project mapping or automatic refactoring. Follow the user's explicit scope and confirmation waiver.

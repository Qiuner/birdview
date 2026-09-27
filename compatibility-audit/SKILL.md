---
name: birdview-compatibility
description: Audit the installed AI skill environment for duplicate installations, broad triggers and possible instruction conflicts. Use only when the user invokes birdview-compatibility; it does not activate architecture mapping or modify skills.
---

# Birdview skills audit

[中文](SKILL.zh.md)

Run the read-only inventory from the installed Birdview bundle:

```sh
node <skill-root>/scripts/birdview.mjs skills audit --project <project-root> --language en --write <project-root>/.birdview/compatibility-audit.json
```

Set `--language` to the language of the current user conversation (`zh` for Chinese, `en` for English); the CLI cannot infer conversation language by itself. Always pass it when producing the human-readable Markdown report.

The JSON is deliberately two-layered. `skills`, `duplicateNames` and `issues` are inventory facts; `assessment` is the required human conclusion. Inventory is not the finished audit. In the same turn, read every discovered `SKILL.md` and compare at least names, trigger descriptions, explicit invocation requirements, automatic invocation policy, `disable-model-invocation`, write permissions and approval gates. Then write the assessment using [the report contract](references/report-contract.md) and render both artifacts:

```sh
node <skill-root>/scripts/birdview.mjs skills audit --project <project-root> --language en --assessment <project-root>/.birdview/compatibility-assessment.json --write <project-root>/.birdview/compatibility-audit.json --write-markdown <project-root>/.birdview/compatibility-audit.md
```

The Markdown report is for people: every pair with overlapping trigger scope must state the triggering language, whether the skills are compatible, need ordering, may conflict or remain unresolved, with confidence, rationale, quoted evidence and a recommended execution order. Keep a relationship unresolved only when the bodies or host rules cannot be read; do not leave an empty unreviewed report merely because the inventory succeeded.

Report the discovered roots, skills, duplicate names and metadata flags, then complete trigger compatibility analysis. Read both bodies for skills with similar trigger descriptions, automatic activation, shared task domains, or an instruction that applies to every conversation. Classify each such relationship as compatible, ordered, potential conflict or unresolved. Compare activation policy, write permissions, approval gates, output ownership and explicit scope. Show both source passages for any claimed conflict; duplicate names alone are not a semantic conflict.

This instruction is an audit request, not approval to change configuration. Do not disable, rewrite, delete or reinstall another skill. Do not start Birdview architecture or constraint mapping unless the user separately asks for it. The inventory is only candidate discovery, not semantic compatibility; preserve the facts, conclusions and specific gaps.

Deliver the Markdown report for human review. Keep it textual and concise: show the conclusion, scenario, impact, evidence and next action. Do not create a graph or label unknown relationships as compatible.

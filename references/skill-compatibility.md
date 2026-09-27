# First-run skill compatibility audit

[中文](skill-compatibility.zh.md)

Use this lightweight audit once when Birdview is first set up in an environment. It inventories discovered `SKILL.md` files from the user and project skill roots, records duplicate names and obvious trigger metadata issues, and leaves semantic conflict review to the agent reading the relevant skill bodies.

Run:

```sh
node <skill-root>/scripts/birdview.mjs skills audit --project <project-root> --write <project-root>/.birdview/compatibility-audit.json
```

The report is deterministic and contains checked roots, relative paths, names, descriptions, SHA-256 digests and simple metadata flags. Missing or unreadable roots are outside coverage. It does not execute skills, infer authority, or disable files. A duplicate name is a discovery conflict; it is not proof that two skills disagree.

After the scan, read the bodies of skills whose names or trigger descriptions overlap. Compare activation policy, write permissions, approval gates, output ownership and explicit scope. Put human conclusions in the assessment contract linked from the installed audit skill; include the task scenario, user impact, confidence, exact evidence from both current files and a concrete recommendation. Classify each relationship as compatible, ordered, potential conflict or unresolved. User instructions and host precedence remain authoritative. Do not change another skill from this report alone. Store the machine report and Markdown report with the project artifacts and disclose stale, uncited or incomplete coverage.

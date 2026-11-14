# Birdview 0.5.0 — Review Verdicts and Readability

[中文](release-notes-0.5.0.zh.md)

Architecture reviews now open with a direct conclusion: **Healthy**, **Needs work** or **At risk**, followed by a one-sentence headline and one to three reasons. Reasons can link to the supporting proposals, and the recommended first step appears in the same card.

## Review improvements

- Source evidence starts folded into a file, line range and note; expand it to read the quotation. Wrapped code hangs under its indentation, and hovering highlights the whole source line.
- Proposed drawings stay visible while scrolling on desktop. The argument leads with the solution, followed by benefits, migration costs, boundaries and the deletion test; conflicts with existing decisions are highlighted.
- Red-pencil notes avoid nodes, connectors, edge labels and other notes. Missing-seam lines and duplicate brackets use outside routes to reduce overlap.

## Breaking change: review schema version 3

Version `"2"` review JSON is no longer accepted. To migrate an existing report:

1. Reassess the inspected scope and add `verdict: { grade, headline, reasons }`. The grade is `healthy`, `needs-work` or `at-risk`; the headline is at most 40 characters; provide one to three reasons, each at most 120 characters, with optional `candidates` IDs.
2. Set `schemaVersion` to `"3"`. A strong candidate with an observed finding rules out `healthy`; `at-risk` requires at least one reason that cites a candidate.
3. Render and validate with `node scripts/render-review.mjs review.json review.html --repo <repository-root>`.

Do not change only the version number or invent a verdict to pass validation. See the [review contract](../references/review-contract.md) and [updated example](../examples/review.json). Previously generated standalone HTML remains a snapshot; regenerate it to get the new layout.

## Constraint improvements

`discover-constraints.mjs` accepts repeatable `--entry` options for Markdown rule files outside the usual AGENTS/CLAUDE entries, such as `CONTEXT.md`. Missing or non-Markdown entries are recorded in `coverage.unresolved`.

Generated rule-view text follows the architecture language and updates when the viewer language changes. Chinese maps use Chinese; other languages use English. The legacy default without a language remains Chinese. Source content is not translated. See the [constraint graph reference](../references/constraint-graph.md).

## Install and update

Use the [v0.5.0 source archive](https://github.com/Qiuner/birdview/archive/refs/tags/v0.5.0.zip) for this fixed version, or follow the [installation guide](installation.md) to update the complete bundle while preserving local customizations. `npx skills add Qiuner/birdview --skill birdview` installs the current repository version. Keep the dedicated `birdview-review` and `birdview-compatibility` entries alongside the main bundle if you use them.

Run `npm ci` and `node scripts/birdview.mjs doctor` in the skill directory. Rerun `setup --project <project-root>` for configured projects, then start a fresh agent task. Node.js 18 or newer is required. Generated JavaScript is included; distribution is through GitHub and the npm package remains private.

## Verification and limitations

Release checks are `npm run check:pr` (types, generated artifacts, unit and browser tests, demo regeneration, examples and bilingual documentation) and, against the committed candidate, `npm run check:install`. See the [release checklist](releasing.md).

The verdict is an AI assessment of the declared scope and evidence, not an independent certification. Birdview displays snapshots and agent-declared activity; it does not independently observe every edit or enforce the pre-edit workflow. Diagram placement is heuristic. Constraint discovery does not interpret rule semantics, and language switching translates interface text only.

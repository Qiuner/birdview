# Birdview 0.4.0 — Architecture Review, Skill Compatibility and Change Paths

[中文](release-notes-0.4.0.zh.md)

This release helps answer three questions: **How should the architecture change? Can installed skills trigger together unintentionally? What else could a change affect?** Birdview adds architecture review and skill trigger compatibility audits, and improves the changes view alongside the existing architecture and constraints views.

## Architecture review: understand the proposal before implementing

The review reads source first, then draws the current structure, problems and proposal:

- **Current drawing and red-pencil notes** show existing modules, calling relationships and specific problems, with quoted source.
- **Proposed redraw** shows revised boundaries, changes to caller responsibilities, benefits, migration costs and verification steps.
- **Checkable evidence**: rendering with `--repo` checks quotations line by line against the specified commit or working tree. Without a repository, quotations are marked unchecked. A matching quotation does not prove the proposal is correct.
- **Review before implementation**: the agent shows the page and waits for confirmation of a concrete proposal before implementing the authorized scope.

After installing the dedicated entry, use this in Codex:

```text
$birdview-review Review this project's architecture. Draw the current structure, problems and proposals; do not edit code yet.
```

Use `/birdview-review` in Claude Code. You can also explicitly ask Birdview to optimize architecture or review module boundaries. Natural-language activation depends on the host discovering and selecting the skill; it is not a fixed keyword interceptor. See the [review example](../examples/review.html) and [review workflow](../references/review-architecture.md). The example reviews its recorded source revision, not necessarily the current version.

## Skill compatibility: identify requests that activate competing skills

The audit inventories installations, then has the AI read skill bodies and compare trigger scope, invocation modes, write permissions and confirmation requirements. For concrete scenarios, it explains whether skills are **compatible, need ordering, may conflict or remain unresolved**, with evidence from both skills and recommendations.

```text
$birdview-compatibility Check local skills for overlapping triggers. Explain scenarios, evidence and recommendations in English.
```

Use `/birdview-compatibility` in Claude Code. Results are readable text/Markdown with accompanying JSON. The report follows the conversation language; CLI calls must explicitly pass `--language zh` or `en`. Duplicate names or broad descriptions alone do not confirm a conflict, and an inventory is not the final assessment. The audit does not automatically disable, reorder or rewrite other skills.

## Changes view: trace the plan and its outside-scope impact

- Inspect the modules, files and execution steps declared by the agent on the same architecture map.
- Enable **Outside-scope impact** to see modules directly connected to the plan but not declared as change targets, revealing boundaries worth checking.
- Improved routing, short bends and screen adaptation make paths easier to follow on desktop and narrow screens.

This impact layer uses declared direct relationships. It does not mean those modules must change or prove that all transitive effects have been analyzed. See the [architecture and changes example](../examples/harness-activity.html), which uses simulated activity.

## Other improvements and upgrade notes

- `birdview deliver` combines input validation, optional constraint compilation and history collection, page rendering and a delivery receipt, reducing manual execution of these steps. It does not interpret rule semantics for the AI or certify visual acceptance.
- Read constraint sources in **By directory** within the constraints page. Standalone `.sources.html` export, the `--sources` argument and the `sourceHref` interface have been removed; update scripts and links that depended on them.
- Change paths and Outside-scope impact replace the old side-by-side comparison entry. Architecture, Constraints and Review navigation appears according to the data rendered.
- On-demand remains the default, with optional auto mode. Confirmation of the displayed plan remains part of the workflow.

## Install and update

Follow the [installation guide](installation.md) to update the complete `birdview` bundle and preserve local customizations. For a fixed version, use the source archive after v0.4.0 is published; `npx skills add Qiuner/birdview --skill birdview` installs the current repository version.

Dedicated commands require their entries: install the bundle's `review-skill/` as `birdview-review/` and `compatibility-audit/` as `birdview-compatibility/` in the same skills directory, alongside the complete `birdview/` bundle. Installing the main skill alone does not install these two entries.

In the main skill directory, run `npm ci` and `node scripts/birdview.mjs doctor`. Rerun `setup --project <project-root>` for configured projects to refresh foundation rules while preserving their modes. Start a fresh agent task to verify discovery and activation. Node.js 18 or newer is required; generated JavaScript is included, so users do not need to compile TypeScript. Distribution is through GitHub; the npm package remains private.

## Verification and limitations

The release candidate must pass `npm run check:pr`: types, generated artifacts, unit tests, browser interactions, demo regeneration, input validation and paired documentation. After committing and before tagging, `npm run check:install` must verify source archive installation. Consult the [release checklist](releasing.md) and candidate checks for the actual release status.

Birdview shows AI-curated snapshots, evidence and declarations. It does not independently monitor all edits or enforce a filesystem write lock. Compatibility assessments depend on host rules and the actual task; they are not security certifications. The constraints view requires reviewed constraint data; the repository does not yet include a ready-to-open constraints example.

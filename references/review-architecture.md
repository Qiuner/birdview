# Review architecture on request

[中文](review-architecture.zh.md)

Use when the user invokes birdview-review or requests architecture improvement, module-boundary review or architectural refactoring opportunities, even without naming Birdview. A mention in quoted content or a discussion about implementing this skill is not a review request. Discover effective rules using [constraints.md](constraints.md), then inspect the requested scope. Reuse a verified map if available; standalone review needs neither a full-project map nor a complete constraint inventory. Ordinary coding, local refactoring, architecture drawing alone and auto mode do not start a review.

## Inspect responsibilities

Read relevant project terminology and architecture decisions when available; missing glossaries or ADRs do not require creating them. Trace the callers and implementations behind candidate modules. Look for concrete friction:

- One responsibility requires coordinated edits across several modules, or callers must know internal ordering, error handling or configuration details.
- A wrapper adds little behavior while forcing callers through another interface. Ask what happens if it is removed: does complexity disappear or move into its callers? A small adapter can still justify its existence.
- Existing boundaries make important behavior difficult to verify through public interfaces. Describe the behavior at risk, rather than demanding tests for every implementation detail.

Prefer changes that give callers a simpler interface while keeping cohesive behavior together. Module count, file size and diagram neatness alone are not evidence of a problem. Respect existing architecture decisions; suggest revisiting one only with concrete new evidence and state the conflict.

## Present grounded candidates

Return only supported candidates, at most 6, ordered by expected value. For each, provide:

- The current drawing: callers, modules and steps as they exist in source, with evidence for every module and step. Mark each judgment as a red-pencil finding of one kind: duplicate, leak, shallow, ordering or missing-seam, each with a short note and its own confidence (observed or hypothesis).
- What callers must know today and after the change (callerKnowledge). This is the interface width the proposal claims to reduce; list concrete obligations, not adjectives.
- The clean redraw: the deepened module as a deep node that names the current nodes it absorbs, plus any seam that stays.
- The deletion test (keep, remove or narrow), wins in glossary terms (locality, leverage, depth, seam, testability), boundaries that do not change, migration cost, and behaviour checked through the interface.
- Recommendation strength (strong, worth exploring, speculative) separate from finding confidence. Identify missing evidence; do not present hypotheses as defects.

## Generate and deliver

Write project .birdview/review.json using the [review contract](review-contract.md), then render with quote checking:

```sh
node <skill-root>/scripts/render-review.mjs .birdview/review.json .birdview/review.html --repo .
```

Read every cited file before quoting it. A quote is the exact text of its line range, and `--repo` rejects any mismatch, so fix the evidence instead of loosening the quote. Keep titles business-first; the lede and impact explain the consequence, and each drawing's caption states the current consequence and the expected result. Keep text within the contract's limits: they are layout limits. Use the same node id for the same thing in both drawings. Record the source commit, dirty files and the sources you read.

Open the HTML and check desktop/mobile, both themes, the red-pencil notes and readability. Report actual preview results and gaps; JSON alone is insufficient. Empty candidates with checked scope are valid; do not pad results.

To add a review entry to an existing architecture page, bind mapId, revision and source commit, then run:

```sh
node <skill-root>/scripts/render.mjs .birdview/architecture.json .birdview/architecture.html --review .birdview/review.json --repo .
```

Keep existing activity and --constraints arguments. This writes a sibling .review.html and adds navigation, preserving architecture and constraint layouts. Module bindings are checked. Proposals never overwrite current architecture or fabricate editing events.

## Confirm before implementation

Present candidates and recommend one only when supported. Ask which concrete displayed proposal to implement, then stop for an answer. Review requests and generated pages are not approval. Reuse explicit approval for the same displayed scope; honor an explicit confirmation waiver. Follow [show-changes.md](show-changes.md) for implementation, update current architecture only from verified real changes, and report checks and gaps. Recheck source revisions before applying an older proposal. The first version has no automatic execution or implementation-status tracking.

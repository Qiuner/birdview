# Architecture review contract

[中文](review-contract.zh.md)

Canonical schema: [review.schema.json](../schemas/review.schema.json), generated from src/contracts/models.mts. Example: [review.json](../examples/review.json). Render with scripts/render-review.mjs; add `--repo <repository-root>` to check every source quote.

The review page is an annotated drawing: ink draws source facts, red pencil marks review judgments. Authors write only facts and judgments. Red-pencil loops, connectors, numbering, the title block, the seal and the caller-knowledge counts are derived by the renderer from the fields; data never carries coordinates or styling.

## Shape at a glance

Field names and types; limits are in the sections below. Ids match `^[a-z][a-z0-9-]{0,63}$`. Text fields are strings and lists of text are string arrays. `evidence` on nodes and findings holds zero-based indexes into the same candidate's `evidence` list. Rows and columns are zero-based grid cells; empty leading rows and columns are dropped when drawing.

```text
{ schemaVersion: "2", project, revision: string, sourceRevision, workingTree: { dirty: [path] },
  baseline?, sources: [{ path, kind }], architectureBinding?: { mapId, revision: integer },
  scope, gaps: [text], language, recommendation: null | { candidate: candidateId, reason },
  candidates: [{ id, title, lede, impact, strength, dependency, modules: [moduleId],
    before: Diagram, after: Diagram,
    findings: [{ id, kind, note, detail, targets: [nodeId], evidence: [index], confidence }],
    callerKnowledge: { before: [text], after: [text] },
    solution, deletionTest: { verdict, text }, wins: [{ kind, text }],
    verification: [text], boundaries: [text], cost, adrConflict?: { path, reason },
    evidence: [{ path, lines: { start, end }, symbol?, quote, note }] }] }
Diagram = { nodes: [{ id, label, kind, row, column, span?, modules: [moduleId], evidence: [index], absorbs?: [nodeId] }],
            edges: [{ from, to, label? }], seams?: [{ label, below: nodeId }], caption }
```

## Report

- schemaVersion is "2"; project is the actual project name; revision identifies this review; sourceRevision records the inspected commit.
- workingTree.dirty lists relevant uncommitted files at inspection time (project-relative, may be empty). Optional baseline explains unfinished earlier changes and what this round treats as the current state.
- sources lists the glossaries, decision records, rules and documents read (kind glossary, adr, rule or doc); record missing ones in gaps. scope states what was inspected, gaps the known gaps.
- language is zh or en and controls only interface text; content is not translated.
- candidates may be empty, at most 6, ordered by expected value. recommendation is null or {candidate, reason}; recommend only when evidence supports it.
- For `--review` integration, architectureBinding must match {mapId, revision}, and candidate and node modules must be existing map module IDs. Standalone rendering needs no binding.

## Candidate

- **Heading**: title (at most 28 characters, business consequence first), lede (at most 160), impact (business impact, at most 200). strength is strong, worth-exploring or speculative and states recommendation strength; dependency is in-process, local-substitutable, ports-adapters or external and decides how it is tested.
- **Current drawing before and clean redraw after**: each a small graph of at most 12 nodes and 24 edges.
  - Node: {id, label, kind, row, column, span?, modules, evidence}. kind is caller, module, step or external; deep appears only in the redraw and must list, in absorbs (at most 6), the current nodes it takes over; when the deepened module grows out of an existing node, reuse that node's id instead of absorbing it. span lets a node cover several columns; covered cells must not overlap.
  - The same thing keeps the same id in both drawings, so the renderer links them. Current module and step nodes need evidence.
  - edges are {from, to, label?}; seams are {label, below} and draw a dotted seam under the named node.
  - caption is the drawing's caption: the current business consequence under before, the expected result under after.
- **Red-pencil findings**: 1 to 6, each one red mark on the current drawing. {id, kind, note, detail, targets, evidence, confidence}.
  - kind selects the mark: duplicate loops every target and joins them; leak loops and draws the leak direction; shallow strikes through; ordering adds a wavy underline; missing-seam draws a dashed line between targets.
  - note is the handwritten note on the drawing, at most 16 characters; detail is the explanation below it; targets name current nodes; confidence is observed or hypothesis, per finding.
  - A strong candidate needs at least one observed finding.
- **Caller knowledge**: callerKnowledge.before and .after, short lines (at most 14 characters, at most 6 each) shown as handwritten margin notes; together they show the interface width. after may be empty.
- **Argument**: solution (one sentence), deletionTest (verdict keep, remove or narrow, plus text), wins (1 to 4; kind locality, leverage, depth, seam or testability), verification (behaviour checked through the interface, at least 1), boundaries (what does not change), cost (migration cost and risk), optional adrConflict (path and reason when the proposal contradicts a recorded decision).
- **Evidence**: 1 to 12 entries {path, lines: {start, end}, symbol?, quote, note}. quote is the exact text of the cited lines; its line count must match the range, at most 41 lines. note is the handwritten comment under the clipping.

## Validation

Structural validation rejects: duplicate ids; overlapping node cells; edges, seams, findings or absorbs naming unknown nodes; invalid evidence indexes; deep, or module and step nodes without evidence, in the current drawing; a recommendation naming an unknown candidate; paths that are not project-relative; text longer than its slot.

`--repo` checks source quotes line by line, ignoring trailing whitespace: a quote passes if it matches the file at sourceRevision or, failing that, the working tree, so uncommitted code under review can be cited (list such files in workingTree.dirty). Any mismatch or missing file is an error and no page is written. Without `--repo` the page still renders, but quotes are marked as not checked. Neither check judges whether the business conclusions are right.

Output is offline HTML showing the generator, review and source revisions. Hovering a node highlights the node with the same id in both drawings; multiple candidates switch by sheet number. The page infers no approval or implementation status and runs no external scripts.

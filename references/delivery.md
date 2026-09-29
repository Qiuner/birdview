# Deliver a map

[中文](delivery.zh.md)

After inspecting source and authoring the architecture and reviewed rules, use one command for strict validation, rule compilation, Git line history and integrated rendering. Paths below are relative to the installed skill; use absolute script paths from another directory. Node.js and installed skill dependencies are required; compilation with history also requires Git and the source repository.

```sh
node scripts/birdview.mjs deliver architecture.json project.html --catalog constraints.catalog.json --rules reviewed-rules.json --repo /path/to/repository
```

This writes `project.html`, `project.sources.html` and `project.constraints.json`. Keep the original source catalog and reviewed selection too. Source collection and AI semantic review happen **before** this command; it does not infer rules or confirm coverage. A separate source-only or standalone constraint HTML is unnecessary for integrated delivery; the auxiliary source page is generated here.

Choose exactly one route:

| Route | Arguments | Outputs |
| --- | --- | --- |
| Compile reviewed selection | `--catalog sources.json --rules reviewed-rules.json --repo root` | Integrated HTML, source HTML, compiled catalog with history |
| Reuse matching reviewed catalog | `--constraints project.constraints.json` | Integrated HTML and source HTML |
| Explicit architecture-only or disclosed missing rules | `--architecture-only` | Architecture HTML |

Reuse does not refresh rule history; inspect scope, snapshot and bindings before reusing. `--repo root` is optional for reuse and architecture-only and enables the existing map-constraint freshness check; it does not prove the whole map is current. An unavailable rule catalog must remain a stated limitation, not a claim of complete default delivery.

An optional activity JSONL follows the two positional paths:

```sh
node scripts/birdview.mjs deliver architecture.json activity.html activity.jsonl --constraints project.constraints.json
```

The full activity stream is validated against the map. Do not recompile unchanged constraints just to update activity. Fictional simulation keeps the existing `render.mjs --simulation` route.

## Validation and result

- Strict authoring validation is on by default (equivalent to `validate.mjs --authoring`). Add `--bilingual` for Chinese/English delivery. Fix failures; review warnings against source. Do not rerun a separate validator on unchanged input just to follow an old checklist.
- Use `--legacy` only when updating a genuine existing map with unchanged legacy role fields. It relaxes only the explicit-role authoring check, not schema, event, translation or binding checks. Inspect new/changed classifications yourself; never use it to bypass a new-map failure.
- The renderer retains its internal defensive validation. This command reduces agent/tool handoffs; it does not promise a single internal validation pass or a measured token/speed improvement.
- stdout is a JSON receipt. `ok: true` and exit code 0 mean artifact generation succeeded. Failures return exit code 1, the failing `stage`, validation diagnostics or `error`; `written` lists paths already published. Preserve warnings and `constraints.historyGaps` in the user-facing explanation, in the conversation language.
- Every artifact is validated/rendered in memory before writes. Input/output aliases are rejected. Temporary sibling files are prepared before publication, with the main HTML last. An I/O failure during publication can leave some sidecars updated; multiple file replacements are not a transaction. Inspect `written` before retrying.

`visualReview: not-performed` and `implementationVerification: unverified` are deliberate. Open the final page and do [visual review](map-project.md); explain scope and uncertainty, and follow the [displayed-plan confirmation rule](../SKILL.md) before implementation. Rendering success is neither acceptance nor permission to edit. Standalone validation, compilation and rendering commands remain available for diagnosis and explicit constraint-only tasks.

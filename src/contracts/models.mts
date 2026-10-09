import { Type, type Static } from '@sinclair/typebox';
const reviewText = Type.String({ minLength: 1, maxLength: 4000 });
// Length limits are layout limits: titles, red-pencil notes and margin notes must fit their slots.
const reviewShort = (maxLength: number) => Type.String({ minLength: 1, maxLength, pattern: '\\S' });
const reviewId = Type.String({ pattern: '^[a-z][a-z0-9-]{0,63}$' });
const reviewPath = Type.String({ minLength: 1, maxLength: 500 });
const reviewIndexes = Type.Array(Type.Integer({ minimum: 0 }));
const reviewLiterals = (...values: string[]) => Type.Union(values.map(value => Type.Literal(value)));
// A diagram node. "deep" exists only in the proposal and names the current nodes it absorbs.
const reviewNode = Type.Object({
  id: reviewId, label: reviewShort(40), kind: reviewLiterals('caller', 'module', 'step', 'external', 'deep'),
  row: Type.Integer({ minimum: 0, maximum: 12 }), column: Type.Integer({ minimum: 0, maximum: 6 }),
  span: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })),
  modules: Type.Array(reviewId), evidence: reviewIndexes,
  absorbs: Type.Optional(Type.Array(reviewId, { minItems: 1, maxItems: 6 }))
}, { additionalProperties: false });
const reviewDiagram = Type.Object({
  nodes: Type.Array(reviewNode, { minItems: 1, maxItems: 12 }),
  edges: Type.Array(Type.Object({ from: reviewId, to: reviewId, label: Type.Optional(reviewShort(24)) }, { additionalProperties: false }), { maxItems: 24 }),
  seams: Type.Optional(Type.Array(Type.Object({ label: reviewShort(24), below: reviewId }, { additionalProperties: false }), { maxItems: 3 })),
  // Before: the business consequence today. After: the expected result.
  caption: reviewShort(120)
}, { additionalProperties: false });
export const reviewSchema = Type.Object({
  schemaVersion: Type.Literal('2'),
  project: reviewText,
  revision: reviewText,
  sourceRevision: reviewText,
  workingTree: Type.Object({ dirty: Type.Array(reviewPath) }, { additionalProperties: false }),
  baseline: Type.Optional(reviewShort(400)),
  sources: Type.Array(Type.Object({ path: reviewPath, kind: reviewLiterals('glossary', 'adr', 'rule', 'doc') }, { additionalProperties: false })),
  architectureBinding: Type.Optional(Type.Object({ mapId: reviewId, revision: Type.Integer({ minimum: 1 }) }, { additionalProperties: false })),
  scope: reviewText,
  gaps: Type.Array(reviewText),
  language: reviewLiterals('zh', 'en'),
  candidates: Type.Array(Type.Object({
    id: reviewId, title: reviewShort(28), lede: reviewShort(160), impact: reviewShort(200),
    strength: reviewLiterals('strong', 'worth-exploring', 'speculative'),
    dependency: reviewLiterals('in-process', 'local-substitutable', 'ports-adapters', 'external'),
    modules: Type.Array(reviewId),
    before: reviewDiagram, after: reviewDiagram,
    // Each finding is one red-pencil mark on the current diagram.
    findings: Type.Array(Type.Object({
      id: reviewId, kind: reviewLiterals('duplicate', 'leak', 'shallow', 'ordering', 'missing-seam'),
      note: reviewShort(16), detail: reviewShort(400),
      targets: Type.Array(reviewId, { minItems: 1, maxItems: 4 }), evidence: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1 }),
      confidence: reviewLiterals('observed', 'hypothesis')
    }, { additionalProperties: false }), { minItems: 1, maxItems: 6 }),
    // What callers must know to use the module: the interface width, before and after.
    callerKnowledge: Type.Object({
      before: Type.Array(reviewShort(14), { minItems: 1, maxItems: 6 }),
      after: Type.Array(reviewShort(14), { maxItems: 6 })
    }, { additionalProperties: false }),
    solution: reviewShort(200),
    deletionTest: Type.Object({ verdict: reviewLiterals('keep', 'remove', 'narrow'), text: reviewShort(200) }, { additionalProperties: false }),
    wins: Type.Array(Type.Object({ kind: reviewLiterals('locality', 'leverage', 'depth', 'seam', 'testability'), text: reviewShort(60) }, { additionalProperties: false }), { minItems: 1, maxItems: 4 }),
    verification: Type.Array(reviewShort(120), { minItems: 1, maxItems: 8 }),
    boundaries: Type.Array(reviewShort(160), { maxItems: 6 }),
    cost: reviewShort(200),
    adrConflict: Type.Optional(Type.Object({ path: reviewPath, reason: reviewShort(200) }, { additionalProperties: false })),
    evidence: Type.Array(Type.Object({
      path: reviewPath, lines: Type.Object({ start: Type.Integer({ minimum: 1 }), end: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
      symbol: Type.Optional(reviewShort(80)), quote: Type.String({ minLength: 1, maxLength: 2400 }), note: reviewShort(40)
    }, { additionalProperties: false }), { minItems: 1, maxItems: 12 })
  }, { additionalProperties: false }), { maxItems: 6 }),
  recommendation: Type.Union([Type.Null(), Type.Object({ candidate: reviewId, reason: reviewShort(200) }, { additionalProperties: false })])
}, { additionalProperties: false });
export type ArchitectureReview = Static<typeof reviewSchema>;
// Canonical structural contracts. Cross-record semantics remain in validate.mjs.
export const mapPath = Type.String({ "minLength": 1, "maxLength": 500, "pattern": "^(?!/)(?!.*(?:^|/)(?:\\.\\.?|\\.git)(?:/|$))(?!.*//)(?!.*[\\\\:\\u0000-\\u001f\\u007f])[^/].*[^/]$|^[^./\\\\:\\u0000-\\u001f\\u007f]$" });
export const mapId = Type.String({ "pattern": "^[a-z][a-z0-9-]{0,63}$" });
export const mapText = Type.String({ "minLength": 1, "maxLength": 2000, "pattern": "\\S" });
export const mapQuestions = Type.Array(mapText, { "uniqueItems": true });
export const mapTranslation = Type.Object({
    "name": Type.Optional(mapText),
    "responsibility": Type.Optional(mapText),
    "label": Type.Optional(mapText),
    "note": Type.Optional(mapText),
    "explanation": Type.Optional(mapText),
    "verification": Type.Optional(mapText),
    "openQuestions": Type.Optional(mapQuestions)
}, { "minProperties": 1, "additionalProperties": false });
export const mapTranslations = Type.Record(Type.String({ pattern: "^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$" }), mapTranslation, { "minProperties": 1, "additionalProperties": false });
export const mapEvidenceList = Type.Array(Type.Object({
    "path": mapPath,
    "note": mapText,
    "quote": Type.Optional(mapText),
    "translations": Type.Optional(mapTranslations),
    "symbol": Type.Optional(mapText),
    "line": Type.Optional(Type.Integer({ "minimum": 1 })),
    "endLine": Type.Optional(Type.Integer({ "minimum": 1 }))
}, { "dependentRequired": { "endLine": ["line"] }, "additionalProperties": false }));
export const mapConstraint = Type.Object({
    "id": mapId,
    "name": mapText,
    "note": mapText,
    "explanation": Type.Optional(mapText),
    "code": Type.Optional(mapEvidenceList),
    "baselineCommit": Type.Optional(Type.String({ "pattern": "^[a-fA-F0-9]{40}$" })),
    "origin": Type.Union([Type.Literal("local"), Type.Literal("user"), Type.Literal("inferred")]),
    "strength": Type.Union([Type.Literal("required"), Type.Literal("preferred")]),
    "applicability": Type.Union([Type.Literal("applicable"), Type.Literal("superseded"), Type.Literal("not-applicable"), Type.Literal("uncertain"), Type.Literal("conflict")]),
    "scope": Type.Union([Type.Literal("project"), Type.Literal("modules"), Type.Literal("relationships"), Type.Literal("task")]),
    "taskId": Type.Optional(mapId),
    "modules": Type.Array(mapId, { "uniqueItems": true }),
    "relationships": Type.Array(mapId, { "uniqueItems": true }),
    "supersededBy": Type.Optional(mapId),
    "conflictsWith": Type.Optional(Type.Array(mapId, { "minItems": 1, "uniqueItems": true })),
    "evidence": mapEvidenceList,
    "verification": mapText,
    "translations": Type.Optional(mapTranslations)
}, { "additionalProperties": false });
export const mapLanguage = Type.String({ "pattern": "^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$", "maxLength": 35 });
export const eventPaths = Type.Array(mapPath, { "uniqueItems": true });
export const architectureSchema = Type.Object({
    "constraintDiscovery": Type.Optional(Type.Object({
        "checkedAt": Type.String({ "format": "date-time" }),
        "checkedPaths": Type.Array(mapPath, { "uniqueItems": true }),
        "uninspectedPaths": Type.Array(mapPath, { "uniqueItems": true })
    }, { "additionalProperties": false })),
    "constraints": Type.Optional(Type.Array(mapConstraint)),
    "schemaVersion": Type.Literal(1),
    "language": Type.Optional(mapLanguage),
    "groups": Type.Optional(Type.Array(Type.Object({
        "id": mapId,
        "name": mapText,
        "role": Type.Optional(Type.Union([Type.Literal("interaction"), Type.Literal("runtime"), Type.Literal("external-services"), Type.Literal("generic")])),
        "members": Type.Array(mapId, { "minItems": 1, "uniqueItems": true }),
        "evidence": { ...mapEvidenceList, minItems: 1 },
        "translations": Type.Optional(mapTranslations)
    }, { "additionalProperties": false }))),
    "mapId": mapId,
    "revision": Type.Integer({ "minimum": 1 }),
    "project": Type.Object({
        "id": mapId,
        "name": mapText,
        "translations": Type.Optional(mapTranslations),
        "revision": Type.Optional(Type.String({ "pattern": "^[a-fA-F0-9]{40}$" }))
    }, { "additionalProperties": false }),
    "modules": Type.Array(Type.Object({
        "id": mapId,
        "name": mapText,
        "translations": Type.Optional(mapTranslations),
        "kind": Type.Union([Type.Literal("local"), Type.Literal("external")]),
        "responsibility": mapText,
        "role": Type.Optional(Type.Union([Type.Literal("frontend"), Type.Literal("backend"), Type.Literal("cache"), Type.Literal("database"), Type.Literal("queue"), Type.Literal("security"), Type.Literal("generic")])),
        "roleAssessment": Type.Optional(Type.Object({
            "basis": Type.Union([Type.Literal("out-of-taxonomy"), Type.Literal("insufficient-evidence")]),
            "note": mapText,
            "translations": Type.Optional(mapTranslations)
        }, { "additionalProperties": false })),
        "ownership": Type.Array(Type.Object({
            "kind": Type.Union([Type.Literal("file"), Type.Literal("directory")]),
            "path": mapPath
        }, { "additionalProperties": false }), { "uniqueItems": true }),
        "evidence": mapEvidenceList,
        "status": Type.Union([Type.Literal("supported"), Type.Literal("uncertain")]),
        "openQuestions": mapQuestions,
        "layout": Type.Object({
            "row": Type.Integer({ "minimum": 0 }),
            "column": Type.Integer({ "minimum": 0 })
        }, { "additionalProperties": false })
    }, { "additionalProperties": false }), { "minItems": 1 }),
    "relationships": Type.Array(Type.Object({
        "id": mapId,
        "from": mapId,
        "to": mapId,
        "translations": Type.Optional(mapTranslations),
        "label": mapText,
        "evidence": mapEvidenceList,
        "kind": Type.Union([Type.Literal("request"), Type.Literal("result"), Type.Literal("dependency"), Type.Literal("event"), Type.Literal("control")]),
        "visibility": Type.Union([Type.Literal("overview"), Type.Literal("detail")]),
        "status": Type.Union([Type.Literal("supported"), Type.Literal("uncertain")]),
        "openQuestions": mapQuestions
    }, { "additionalProperties": false }))
}, { "additionalProperties": false });
export const activitySchema = Type.Object({
    "constraintReviews": Type.Optional(Type.Array(Type.Object({
        "constraintId": mapId,
        "checkedAt": Type.Optional(Type.String({ "format": "date-time" })),
        "gitCommit": Type.Optional(Type.String({ "pattern": "^[a-fA-F0-9]{40}$" })),
        "plan": mapText,
        "status": Type.Union([Type.Literal("unverified"), Type.Literal("supported"), Type.Literal("violated")]),
        "method": Type.Union([Type.Literal("test"), Type.Literal("review")]),
        "evidence": Type.String({ "maxLength": 2000 }),
        "checkIndexes": Type.Array(Type.Integer({ "minimum": 0 }), { "uniqueItems": true }),
        "translations": Type.Optional(Type.Record(Type.String(), Type.Object({
            "plan": Type.String({ "minLength": 1 }),
            "evidence": Type.String()
        }, { "additionalProperties": false })))
    }, { "additionalProperties": false }))),
    "collaboration": Type.Optional(Type.Object({
        "agent": Type.String({ "minLength": 1 }),
        "locks": Type.Array(Type.String({ "minLength": 1 }), { "uniqueItems": true })
    }, { "additionalProperties": false })),
    "schemaVersion": Type.Literal(1),
    "occurredAt": Type.Optional(Type.String({ "format": "date-time" })),
    "gitCommit": Type.Optional(Type.String({ "pattern": "^[0-9a-fA-F]{7,40}$" })),
    "projectId": mapId,
    "mapId": mapId,
    "mapRevision": Type.Integer({ "minimum": 1 }),
    "sessionId": mapId,
    "taskId": mapId,
    "sequence": Type.Integer({ "minimum": 1 }),
    "phase": Type.Union([Type.Literal("planned"), Type.Literal("editing"), Type.Literal("verifying"), Type.Literal("completed"), Type.Literal("failed"), Type.Literal("cancelled")]),
    "scope": Type.Array(mapId, { "minItems": 1, "uniqueItems": true }),
    "targets": Type.Array(mapId, { "uniqueItems": true }),
    "reason": mapText,
    "translations": Type.Optional(Type.Record(Type.String(), Type.Object({
        "reason": mapText
    }, { "additionalProperties": false }))),
    "files": eventPaths,
    "unmappedFiles": eventPaths,
    "evidenceKind": Type.Literal("agent-declared"),
    "checks": Type.Array(Type.Object({
        "command": mapText,
        "status": Type.Union([Type.Literal("passed"), Type.Literal("failed"), Type.Literal("not-run")]),
        "translations": Type.Optional(Type.Record(Type.String(), Type.Object({
            "summary": mapText
        }, { "additionalProperties": false }))),
        "exitCode": Type.Union([Type.Integer(), Type.Null()]),
        "summary": mapText
    }, { "additionalProperties": false }))
}, { "additionalProperties": false });
export type Architecture = Static<typeof architectureSchema>;
export type ActivityEvent = Static<typeof activitySchema>;
export type Module = Architecture['modules'][number];
export type Relationship = Architecture['relationships'][number];
export type Constraint = NonNullable<Architecture['constraints']>[number];

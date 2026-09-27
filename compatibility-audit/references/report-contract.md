# Compatibility assessment contract

[中文](report-contract.zh.md)

The deterministic inventory and the human conclusion are separate on purpose. Store the assessment as JSON with this shape:

```json
{
  "status": "reviewed",
  "reviewedAt": "2026-09-24T00:00:00.000Z",
  "reviewer": "agent",
  "language": "en",
  "summary": "Illustrative only: the two workflows need an explicit order.",
  "conclusions": [
    {
      "leftSkill": "skill-a",
      "rightSkill": "skill-b",
      "relation": "ordered",
      "confidence": "high",
      "scenario": "Both skills are invoked for the same implementation task.",
      "impact": "Implementation could begin before the plan is approved.",
      "rationale": "Both can run, but skill-a owns the plan and skill-b owns implementation.",
      "evidence": [
        { "skill": "skill-a", "path": ".../SKILL.md", "digest": "<inventory digest>", "quote": "<exact source passage>" },
        { "skill": "skill-b", "path": ".../SKILL.md", "digest": "<inventory digest>", "quote": "<exact source passage>" }
      ],
      "recommendation": "Run skill-a first, then skill-b after its plan is approved."
    }
  ]
}
```

This is a format example, not a finding. Copy names, paths and digests exactly from the inventory. The CLI validates evidence against the current discovered files; stale digests, invented quotes and unknown files are rejected before output is written. Referenced documents and host rules are outside this evidence validator; disclose those gaps in the summary and scenario. Discovered skills are not necessarily active together.

Use `compatible` (no conflict in the stated scenario), `ordered` (an execution order resolves overlap), `potential-conflict` (the same scenario produces incompatible requirements), or `unresolved` (insufficient evidence). All but `unresolved` require quotes from both distinct skill files. Describe exactly what happens, its user impact and a concrete next action; similarity and duplicate names alone are not semantic conflicts. Confidence is an agent estimate, not a measured score.

Use the user's language (`en` or `zh`); the narrative fields must also use that language. `reviewed` means an agent supplied an assessment, not user approval or exhaustive coverage. The report lists uncited skills and only claims coverage of listed scenarios. An empty conclusion list never means every skill is compatible. The JSON inventory is schema version 2; the default assessment is `unreviewed` with no conclusions. Keep the assessment input file separately so rerunning inventory does not discard it. `assessment` is advisory and never disables or changes a skill.

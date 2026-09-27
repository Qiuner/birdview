# 兼容性评估报告契约

[English](report-contract.md)

确定性清单和人类结论故意分开保存。评估 JSON 使用以下结构：

```json
{
  "status": "reviewed",
  "reviewedAt": "2026-09-24T00:00:00.000Z",
  "reviewer": "agent",
  "language": "zh",
  "summary": "仅为示例：两个工作流需要明确执行顺序。",
  "conclusions": [
    {
      "leftSkill": "skill-a",
      "rightSkill": "skill-b",
      "relation": "ordered",
      "confidence": "high",
      "scenario": "同一实现任务同时调用两个技能。",
      "impact": "实现可能在计划获确认前开始。",
      "rationale": "两者都可以运行，但 skill-a 负责计划，skill-b 负责实现。",
      "evidence": [
        { "skill": "skill-a", "path": ".../SKILL.md", "digest": "<inventory digest>", "quote": "<exact source passage>" },
        { "skill": "skill-b", "path": ".../SKILL.md", "digest": "<inventory digest>", "quote": "<exact source passage>" }
      ],
      "recommendation": "先运行 skill-a，计划获确认后再运行 skill-b。"
    }
  ]
}
```

这只是格式示例，不是实际发现。名称、路径、摘要均照抄清单。CLI 会对照当前已发现文件验证证据；摘要过期、虚构引文或未知文件会在写入报告前被拒绝。引用文档和宿主规则不在此证据校验范围内，应在总结和场景中披露缺口。发现了技能不代表它们会同时生效。

`relation` 可取 `compatible`（指定场景下兼容）、`ordered`（执行顺序可以消除重叠）、`potential-conflict`（同一场景存在无法同时满足的要求）或 `unresolved`（证据不足）。除未决外，均需两份不同技能文件的原文证据。说明具体发生什么、对用户有什么影响、下一步做什么；名称相同和描述相似本身不构成语义冲突。置信度是 AI 估计，不是测量分数。

使用用户语言（`en` 或 `zh`），正文各字段也使用该语言。`reviewed` 表示 AI 已提供评估，不代表用户已批准或检查了所有组合。报告会列出未引用的技能，仅对已列场景作出判断。空结论不代表所有技能兼容。JSON 清单版本升级为 2，默认评估为 `unreviewed` 且无结论。单独保留评估输入文件，避免重新扫描清单时丢失它。`assessment` 只提供建议，不会禁用或修改技能。

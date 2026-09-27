# Birdview 技能兼容性体检

[English](SKILL.md)

使用已安装 Birdview 包中的只读清单命令：

```sh
node <skill-root>/scripts/birdview.mjs skills audit --project <project-root> --language zh --write <project-root>/.birdview/compatibility-audit.json
```

`--language` 要传当前用户对话的语言（中文传 `zh`，英文传 `en`）；CLI 本身无法推断对话语言。生成人审 Markdown 时必须显式传入。

JSON 报告分成两层。`skills`、`duplicateNames` 和 `issues` 是扫描事实；`assessment` 是必须完成的人类视角结论。扫描不是最终结果。体检技能必须在同一轮继续读取所有已发现技能的 `SKILL.md`，至少比较名称、触发描述、显式调用要求、自动调用策略、`disable-model-invocation`、写入权限和确认门槛，再按[报告契约](references/report-contract.zh.md)写评估文件并生成 Markdown：

```sh
node <skill-root>/scripts/birdview.mjs skills audit --project <project-root> --language zh --assessment <project-root>/.birdview/compatibility-assessment.json --write <project-root>/.birdview/compatibility-audit.json --write-markdown <project-root>/.birdview/compatibility-audit.md
```

Markdown 报告面向人审：对每个触发范围重叠的技能对，说明触发话术、关系是兼容、需要排序、可能冲突或未决，附置信度、双方原文证据和建议执行顺序。只有确实无法读取正文或缺少宿主规则时才允许保留“未决”；不能因为扫描完成就把整份报告留成空的“未评估”。

报告先检查目录、技能、重名和元数据，再完成触发兼容性判断。对触发描述相似、都声明自动生效、都覆盖同一任务类型，或一个技能要求所有对话都调用的组合，必须读取双方正文并给出关系结论。比较激活策略、写入权限、确认门槛、产物所有权和明确范围。声称冲突时展示双方原文；仅重名不等于语义冲突。

这个指令只请求体检，不代表允许修改配置。不要禁用、重写、删除或重新安装其他技能。除非用户另行要求，不启动 Birdview 架构图或约束图。确定性清单不等于语义兼容性证明；保留报告及其缺口。

扫描清单只是候选发现，不是语义兼容性证明；保留事实、结论和无法判断的具体缺口。只交付供人审查的 Markdown 文字报告，保持简洁：显示结论、场景、影响、证据和下一步动作。不再生成关系图，也不能把未知关系标成兼容。

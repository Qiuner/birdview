# 地图交付

[English](delivery.md)

检查源码并编写架构与已审查规则后，用一条命令完成严格校验、规则编译、Git 行历史采集和集成渲染。以下路径相对于已安装技能目录；从其他目录执行时用脚本绝对路径。需要 Node.js 和已安装的技能依赖；编译并采集历史还需要 Git 和来源仓库。

```sh
node scripts/birdview.mjs deliver architecture.json project.html --catalog constraints.catalog.json --rules reviewed-rules.json --repo /path/to/repository
```

输出 `project.html`、`project.sources.html` 和 `project.constraints.json`，也须保留原始来源清单与审查选择。来源收集和 AI 语义审查在此命令**之前**完成；命令不推断规则，也不确认覆盖完整性。集成交付无需先生成独立来源页或独立约束图；辅助来源页在这里一起生成。

三种路线必须且只能选一种：

| 路线 | 参数 | 输出 |
| --- | --- | --- |
| 编译已审查选择 | `--catalog sources.json --rules reviewed-rules.json --repo root` | 集成 HTML、来源 HTML、带历史的编译清单 |
| 复用匹配的已审查清单 | `--constraints project.constraints.json` | 集成 HTML 和来源 HTML |
| 明确仅架构或已披露规则不可用 | `--architecture-only` | 架构 HTML |

复用不刷新规则历史，须先检查范围、快照和绑定。复用及仅架构路线可选 `--repo root`，用于现有地图约束的新鲜度检查，不证明整张地图当前有效。规则清单不可用仍须注明限制，不得声称默认交付已完整完成。

可选活动 JSONL 紧跟两个位置参数：

```sh
node scripts/birdview.mjs deliver architecture.json activity.html activity.jsonl --constraints project.constraints.json
```

完整活动流会对照地图校验，不因更新活动而重新编译未变化的约束。虚构模拟继续使用现有 `render.mjs --simulation` 路线。

## 校验与结果

- 默认开启严格作者校验（等价于 `validate.mjs --authoring`），中英双语交付追加 `--bilingual`。修复失败，结合源码复核警告；不要仅为沿用旧清单，对未变化输入再单独运行校验器。
- `--legacy` 仅用于更新真实旧图且保留未变化的旧角色字段，只放宽显式角色作者检查，不放宽 Schema、事件、翻译或绑定检查。新增/变化分类仍须自行检查，不能用来绕过新图错误。
- 渲染器保留内部防御性校验。命令减少 Agent 与工具的交接，不承诺内部只校验一次，也不声称已测得 token 或速度改善比例。
- stdout 输出 JSON 回执。`ok: true` 且退出码为 0 表示产物生成成功；失败退出码为 1，提供失败 `stage`、校验诊断或 `error`；`written` 列出已发布路径。用当前对话语言解释结果，保留警告和 `constraints.historyGaps`。
- 所有产物在写入前完成内存校验和渲染，拒绝输入/输出路径别名冲突。先准备同目录临时文件，最后发布主 HTML；发布中的 I/O 失败可能已更新部分附属文件，多文件替换不是事务，重试前检查 `written`。

`visualReview: not-performed` 和 `implementationVerification: unverified` 是有意保留的状态。打开最终页面执行[视觉审查](map-project.zh.md)，说明范围和不确定项，实施前遵循[展示方案后的确认规则](../SKILL.zh.md)。渲染成功不等于验收或编辑授权。独立校验、编译和渲染命令仍可用于诊断和明确的仅约束任务。

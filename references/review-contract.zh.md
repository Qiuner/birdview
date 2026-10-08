# 架构评审契约

[English](review-contract.md)

规范 Schema：[review.schema.json](../schemas/review.schema.json)，从 src/contracts/models.mts 生成。示例：[review.json](../examples/review.json)。使用 scripts/render-review.mjs 渲染；加 `--repo <仓库根目录>` 时逐条核对源码引用。

评审页是一张批注过的图纸：墨线画源码事实，红笔标评审判断。作者只写事实和判断；红笔圈、连线、编号、图签、印章和「调用方须知」条数都由渲染器从字段推导，不在数据里写坐标或样式。

## 结构一览

字段名和类型如下，长度和数量限制见后面各节。id 须匹配 `^[a-z][a-z0-9-]{0,63}$`。文字字段是字符串，文字列表是字符串数组。节点和批注里的 `evidence` 是下标，从 0 开始，指向同一候选的 `evidence` 列表。row 和 column 是从 0 开始的格子坐标；绘图时会去掉前面空着的行和列。

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

## 报告

- schemaVersion 为 "2"；project 为真实项目名；revision 标识评审版本；sourceRevision 记录已检查的提交。
- workingTree.dirty 列出检查时未提交的相关文件（项目相对路径，可为空）。baseline 可选，说明上一轮未完成的改动以及本轮把什么当作现状。
- sources 列出读过的术语表、架构决策、规则和文档（kind 为 glossary、adr、rule、doc）；没找到的写进 gaps。scope 说明检查范围，gaps 说明已知缺口。
- language 为 zh 或 en，只决定界面文字，内容不会自动翻译。
- candidates 可为空，最多 6 个，按预期价值排序。recommendation 为 null，或 {candidate, reason}，只在有证据时推荐。
- 组合 `--review` 时 architectureBinding 必须匹配 {mapId, revision}；候选和节点的 modules 必须是地图里已有的模块 ID。独立渲染无需绑定。

## 候选

- **标题区**：title（不超过 28 字，先讲业务后果）、lede（导语，不超过 160 字）、impact（业务影响，不超过 200 字）。strength 为 strong、worth-exploring 或 speculative，表示推荐强度；dependency 为 in-process、local-substitutable、ports-adapters 或 external，决定如何测试。
- **现状图 before 与誊清稿 after**：各是一张小图，最多 12 个节点、24 条连线。
  - 节点：{id, label, kind, row, column, span?, modules, evidence}。kind 为 caller、module、step、external；deep 只能出现在誊清稿，并必须用 absorbs 列出它吸收的现状图节点（最多 6 个）；如果深模块是从现有某个节点扩展出来的，直接沿用那个节点的 id，不要把它放进 absorbs。span 让节点横跨多列，覆盖的格子不能重叠。
  - 同一事物在两张图里使用相同 id，渲染时互相联动。现状图里的 module 和 step 节点必须有证据。
  - edges 为 {from, to, label?}；seams 为 {label, below}，在指定节点下方画接缝虚线。
  - caption 是图注：现状图写当前的业务后果，誊清稿写改完后的预期结果。
- **红笔批注 findings**：1 到 6 条，每条是现状图上的一处红笔标记。{id, kind, note, detail, targets, evidence, confidence}。
  - kind 决定画法：duplicate 圈出每个目标并连起来；leak 圈出并画出漏出方向；shallow 划掉；ordering 加波浪线；missing-seam 在目标之间画虚线。
  - note 是图上的手写批注，不超过 16 字；detail 是图下的说明；targets 指向现状图节点；confidence 为 observed 或 hypothesis，逐条标注。
  - strength 为 strong 的候选至少要有一条 observed 批注。
- **调用方须知 callerKnowledge**：before 与 after 两组短句（每条不超过 14 字，最多 6 条），显示为页边手写批注，表示 Interface 的宽窄。after 可以为空。
- **论证**：solution（一句方案）、deletionTest（verdict 为 keep、remove 或 narrow，加一段说明）、wins（1 到 4 条，kind 为 locality、leverage、depth、seam、testability）、verification（通过 Interface 验证的行为，至少 1 条）、boundaries（不改变的事）、cost（迁移代价与风险）、adrConflict（可选，与既有决策冲突时写明路径和理由）。
- **证据 evidence**：1 到 12 条，{path, lines: {start, end}, symbol?, quote, note}。quote 必须是所引行的原文，行数与范围一致，最多 41 行；note 是剪报下方的手写批注。

## 校验

结构校验拒绝：重复 id；节点格子重叠；连线、接缝、批注、吸收关系指向不存在的节点；无效证据下标；现状图里出现 deep 或缺证据的 module、step；推荐不存在的候选；非项目相对路径；超出版面的长度。

`--repo` 逐行核对源码引用（忽略行尾空白）：先和 sourceRevision 提交里的文件比较，对不上再和工作区比较，任一处一致即通过，因此可以引用评审范围内尚未提交的代码（这些文件要写进 workingTree.dirty）。任何不一致或找不到文件都会报错，不生成页面。不加 `--repo` 时页面照常生成，但引用标为「未核对」。结构校验和引用核对都不判断业务结论是否正确。

输出为离线 HTML，显示生成器、评审和源码版本。悬停节点时，两张图里同一 id 的节点一起高亮；多个候选按图纸编号切换。页面不推断批准或实施状态，不执行外部脚本。

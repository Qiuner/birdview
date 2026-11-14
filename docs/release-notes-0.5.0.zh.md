# Birdview 0.5.0 — 评审总评与可读性改进

[English](release-notes-0.5.0.md)

架构评审现在开篇就给出明确结论：**健康**、**需要改进**或**有风险**，随后是一句话结论和一至三条理由。理由可跳转到支撑它的建议，「建议先做」也放在同一张总评卡片中。

## 评审改进

- 源码依据默认折叠为文件、行号和批注，展开后查看原文。代码续行悬挂在缩进之下，悬停时高亮整行源码。
- 桌面端滚动时建议稿保持可见。论证区先突出方案，再展示收益、迁移代价、边界和删除测试；与已有决策冲突时高亮提示。
- 红笔批注避让节点、连线、连线标签和其他批注。缺接缝虚线和重复项括号使用外侧路径，减少遮挡。

## 不兼容变更：评审 schema 版本 3

不再接受版本 `"2"` 的评审 JSON。迁移已有报告时：

1. 重新评估已检查的范围，添加 `verdict: { grade, headline, reasons }`。等级为 `healthy`、`needs-work` 或 `at-risk`；一句话结论不超过 40 字符；提供一至三条理由，每条不超过 120 字符，可附 `candidates` ID。
2. 将 `schemaVersion` 设为 `"3"`。存在带 observed 批注的 strong 候选时不能判为 `healthy`；`at-risk` 至少需要一条理由引用候选。
3. 运行 `node scripts/render-review.mjs review.json review.html --repo <repository-root>` 渲染并校验。

不要只修改版本号，也不要为通过校验编造总评。参见[评审契约](../references/review-contract.zh.md)和[更新后的示例](../examples/review.json)。此前生成的独立 HTML 仍是原有快照，需重新生成才能使用新版布局。

## 约束改进

`discover-constraints.mjs` 支持重复传入 `--entry`，收集常规 AGENTS/CLAUDE 入口之外的 Markdown 规则文件，例如 `CONTEXT.md`。缺失或非 Markdown 的入口记录在 `coverage.unresolved` 中。

规则视图的生成文字跟随架构语言，并在查看器切换语言时更新。中文地图使用中文，其他语言使用英文；未提供语言时，旧入口仍默认中文。来源正文不会被翻译。参见[约束图参考](../references/constraint-graph.zh.md)。

## 安装与更新

使用 [v0.5.0 源码归档](https://github.com/Qiuner/birdview/archive/refs/tags/v0.5.0.zip)固定到本版，或按[安装指南](installation.zh.md)更新完整技能包并保留本地定制。`npx skills add Qiuner/birdview --skill birdview` 安装仓库当前版本。如使用独立入口，保留与主技能包相邻的 `birdview-review` 和 `birdview-compatibility`。

在技能目录运行 `npm ci` 和 `node scripts/birdview.mjs doctor`。对已配置项目重新运行 `setup --project <project-root>`，然后新建 Agent 任务。需要 Node.js 18 或更高版本。分发包含生成后的 JavaScript；通过 GitHub 发布，npm 包仍为私有。

## 验证与限制

发布检查为 `npm run check:pr`（类型、生成产物、单元与浏览器测试、示例重新生成、示例校验和双语文档），以及对已提交候选运行的 `npm run check:install`。参见[发布检查清单](releasing.zh.md)。

总评是 AI 对声明范围及依据的判断，不是独立认证。Birdview 展示快照和 Agent 声明的活动，不会独立观测所有编辑，也不强制执行修改前流程。图中布局采用启发式算法。约束发现不会解释规则含义，语言切换只翻译界面文字。

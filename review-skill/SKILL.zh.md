# Birdview 架构评审

[English](SKILL.md)

## 触发

接受显式技能调用，或评估、改进目标项目架构的请求，不要求用户点名 Birdview。例如“优化这个项目的架构”“评审模块边界”“看看这个项目的架构怎么优化”。按用户意图判断，不因引文、源码或讨论如何实现本技能时出现关键词而触发。普通修复、局部函数重构、性能微调、仅要求绘制现有架构，都不启动评审。

Codex 在技能选择器中选择 Birdview Review，或输入 `$birdview-review`；Claude Code 安装此入口后使用 `/birdview-review`。其他宿主使用支持的技能选择器。自然语言选择依赖宿主发现已安装技能，不是 CLI 子命令，也不是保证触发的关键词钩子。其他架构评审技能也适用时，遵循用户选择，复用相关发现完成一份评审，不生成相互竞争的报告。

## 评审流程

此轻量入口依赖同级 ../birdview 目录中安装的完整技能。阅读 ../birdview/references/review-architecture.zh.md 和 ../birdview/references/review-contract.zh.md，使用 ../birdview/scripts/render-review.mjs。源码仓库内则使用 ../references 和 ../scripts。从本文件位置解析路径，不从待评审项目工作目录解析。缺少完整包时说明依赖缺失，不自行编造渲染器。

仅调查指定范围，生成有源码依据的图，展示 HTML 并等待用户确认具体方案后再实施；同一已展示范围的已有批准继续有效。不启动默认全项目建图或自动重构，遵循用户明确范围及跳过确认的指令。

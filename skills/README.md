# skills/ — 操作手册

给接手的 AI 助手（和人类）用的一组「怎么做对一件事」的说明书。格式遵循 Agent Skills 规范：一个文件夹一个技能，里面只有一个 `SKILL.md`。

## 为什么要有这个东西

`AGENTS.md` 是**认知类**文档，讲"这个项目是什么"；它一旦写完就开始腐烂——现在里面写着 v2.20.5 和"版本号三处"，而代码已经到 v3.9.23、版本号落点远不止三处。
`PROGRESS.md` 是**流水**，前三节还是 v2.8.0 期的化石。

技能不一样，它们只写**怎么查、怎么验**，不写死会过期的值。所以能活得比文档久。

## 四个技能

| 技能 | 触发场景 | 核心作用 |
|---|---|---|
| `run-regression` | 改完代码要验证、测试报红/报 `[crash]` | 跑全量回归；**`[crash]` 先怀疑 CRLF 读取层，别改源码迁就断言** |
| `bump-version` | 改完 `index.html` 要跟版 | 版本号唯一真相源是 `sw.js`；A/B/C 三类落点分别处理，历史注释不许盲替 |
| `push-github` | 要发布、要验收、要删远端文件 | 只用增量脚本；整树覆盖会丢数据；验收看 blob sha |
| `release-checklist` | 一次完整发版 | 编排上面三个，先定"发不发版"这个硬门槛 |

## 写作约定

新增技能时守着这几条，否则它很快会变成第二份腐烂的 AGENTS.md：

1. **不写死会过期的值。** 不写"当前版本 v3.9.23"，写"从 `sw.js` 的 `CACHE_NAME` 反推"。
2. **写命令，不写结论。** "跑这条 `grep` 看结果"，比"一共有三处"可靠。
3. **`Rationalizations` 段必须写真的借口。** 写这次改动中 AI 真的说过的那句话，否则防不住。
4. **`Verification` 必须是可观察的证据。** "看起来对了"不是证据，`FAIL: none` 才是。

## 六段式（照着填）

```markdown
---
name: kebab-case-name
description: 做什么。Use when 什么时候触发。
---

# 标题

## Overview            这个技能解决什么
## When to Use        触发条件
## Process            分步流程 + 检查点 + 退出条件
## Rationalizations   常见偷懒借口 + 反驳
## Red Flags          出问题的信号
## Verification       必须交出的证据
```

## 已知局限

- 单独拷贝某个技能目录时，不会带上仓库级共享材料（本项目目前没有 `references/`，所以暂时无影响）。
- 各家工具认领方式不同：Claude Code 认 `.claude-plugin/`，Codex 认 `.codex-plugin/`，Cursor/Windsurf 等没有约定的直接读 `skills/`。本项目目前只保留裸 `skills/`，由各工具自行发现或手动指定。

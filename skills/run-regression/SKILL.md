---
name: run-regression
description: 跑 class-manager 全量回归测试并给出可信结论。Use when 改完代码要验证、测试报红/报 crash、或担心改动弄坏了别处时。
---

# 回归测试

## Overview

`_runall.js` 扫根目录所有 `_.*test.*\.js` 逐个执行，靠子进程输出里的 `通过 N 项，失败 M 项` 判定结果。
它**不区分**「断言真的失败」和「脚本自己崩了」——后者被归为 `[crash]`。这两类问题排查方向完全相反，是本项目最容易误判的地方。

## When to Use

- 改完 `index.html` / `sw.js` / `portal/` / `desktop/` 任何代码后
- 发版前（见 `release-checklist`）
- 看到测试报红，尤其是 `[crash]` 字样时
- 怀疑某次改动影响了不相关模块时

## Process

**1. 用系统 node，别用相对路径**

```bash
cd "C:/Users/84669/.zcode/workspace/default/class-manager"
node _runall.js
```

期望结尾：`PASS: N files` + `FAIL: none`。
`N` 应等于 `ls _*test*.js | wc -l` 的数量（文件数会随版本增长，**别记死某个数**）。

**2. 出现 `[crash]` 时，先怀疑读取层，不要先改源码**

这是本项目最贵的教训。排查顺序固定为：

| 顺序 | 怀疑对象 | 怎么验 |
|---|---|---|
| 1 | **行尾符 CRLF** | 本机 `core.autocrlf=true`，工作区是 CRLF，而断言锚点常只写 `\n` → 静默不匹配 |
| 2 | 编码 / BOM | 用 `file` 或十六进制看一眼 |
| 3 | mock 沙箱缺宿主全局 | 见下方清单 |
| 4 | 真的改坏了源码 | 最后才怀疑这里 |

CRLF 的修法与铁律：

```javascript
// 测试文件里读源文件，一律加这一句
const src = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
```

**铁律：测试报"崩溃"，先怀疑读取层，再怀疑被测源码。绝不要为了迁就断言去改源码。**

**3. 手搓 mock / `new Function` 沙箱必须补宿主全局**

漏一个就会落回 Node 全局，症状像源码 bug。最低清单：

`window.File`、`document.body`、`URL.createObjectURL`、`setTimeout`、`confirm`

注意：Node 有 `URL` 但**没有** `URL.createObjectURL`，也**没有** `confirm`。

**4. `new Function` 的实参错位不会报错**

只会表现为「后面全变 undefined」。补形参时必须数字数，对着实参个数点一遍。

**5. 单测定位**

```bash
node _v3923_test.js      # 替换成报红的那一个
```

## Rationalizations

| 借口 | 反驳 |
|---|---|
| "就改了一点 CSS，不用跑全量" | 本项目是单文件 SPA，样式与 JS 在同一文件，改 A 崩 B 是常态 |
| "这个 `[crash]` 是老问题，跳过" | 先按 Process 第 2 步逐层排除，确认是读取层问题才能跳过；否则你会把真 bug 当噪音 |
| "断言挂了，把断言改宽松点" | 断言是基线。改断言让测试变绿 = 把体温计砸了治发烧 |
| "测试文件数对不上，可能是新增的，没事" | 也可能是有文件被误删。用 `git status` 确认 |

## Red Flags

- 出现 `[crash]` 但你没看输出尾部三行就下结论
- 为了让测试通过而修改了 `index.html`
- 测试读了源文件却没用 `.replace(/\r\n/g, '\n')`
- 用 `npx node` / 项目内 node，而不是系统 node
- `PASS` 数量比上次少，但你解释不出为什么

## Verification

必须同时满足才能宣称"回归通过"：

1. `node _runall.js` 输出 `FAIL: none`
2. `PASS` 数字等于当前 `_.*test.*\.js` 文件数
3. `git status` 显示你**没有**为了让测试变绿而改动测试文件或源码（除非那是本次任务的正当改动）

只跑一个测试就说"全绿"不算通过。

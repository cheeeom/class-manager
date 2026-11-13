---
name: bump-version
description: 把 class-manager 的版本号在所有落点同步改对。Use when 修改了 index.html 的功能代码、需要发版，或要确认当前版本号时。
---

# 版本号同步

## Overview

改 `index.html` 就意味着一串版本号要跟着走：`sw.js` 的 `CACHE_NAME`、预缓存资源的 `?v=` 参数、页面上的三个可见标记、以及「近版更新速览」文案。
**漏掉任何一个**，表现是：用户拿不到新版、或缓存不刷新、或页面上显示的版本跟实际代码对不上。

版本号的唯一真相源是 `sw.js` 第 2 行的 `CACHE_NAME`。**永远从这里反推当前版本，不要相信任何文档里写死的值。**

## When to Use

- 改动了 `index.html` 的功能/界面代码，需要发版
- 只想知道当前线上版本是多少
- 发现页面显示的版本和 `sw.js` 不一致
- 要写「近版更新速览」

## Process

**1. 先取当前版本（唯一真相源）**

```bash
cd "C:/Users/84669/.zcode/workspace/default/class-manager"
cur=$(grep -o "class-manager-v[0-9.]*" sw.js | head -1 | sed 's/class-manager-v//')
echo "当前版本：$cur"
```

**2. 列出全部落点，肉眼分类**

```bash
grep -n "$cur" sw.js index.html
```

落点分三类，处理方式不同：

| 类别 | 典型位置 | 是否要改 |
|---|---|---|
| **A. 缓存与资源参数** | `sw.js` 的 `CACHE_NAME`、`?v=` 预缓存参数、`index.html` 的 `apple-touch-icon` | **必改**，漏了缓存不刷新 |
| **B. 可见版本标记** | 登录页 `login-version`、侧边栏 `sidebar-footer`、设置页 `🏷️` 徽标 | **必改** |
| **C. 历史注释与速览正文** | 代码里 `// v3.9.10 起…` 这类说明、速览里旧版本的描述 | **不改**，改了就是说谎 |

**3. 只替换活动标记，绝不全局盲替**

`sed s/$cur/$new/g` 这种一把梭会把历史注释一起改掉。逐个定位、逐个替换。

本版本已知的 A 类落点样式（供定位参考，别记死行号）：

- `sw.js`: `const CACHE_NAME = 'class-manager-vX.Y.Z';`
- `sw.js`: `'./icon_192.png?v=X.Y.Z'`、`'./icon_512.png?v=X.Y.Z'`、`'./cmgx.js?v=X.Y.Z'`
  ⚠️ `cmgx.js` 的 `?v=` **必须与 `index.html` 的 `<script src>` 完全一致**，否则预缓存落空
- `index.html`: `<link rel="apple-touch-icon" href="./icon_192.png?v=X.Y.Z">`

**4. 子串陷阱**

`v3.9.2` 是 `v3.9.20` ~ `v3.9.23` 的子串。任何「数出现次数」的断言必须加边界：

```javascript
/v3\.9\.2(?![0-9])/     // 正确
/v3\.9\.2/g             // 会把 v3.9.23 也算进去
```

**5. 更新「近版更新速览」**

`index.html` 里有一块 `📝 近版更新速览（vX.Y.Z）`，含标题和若干条目。新版本要：
- 标题版本号改新
- 新增一条本版说明（用项目惯用的 emoji 小图标开头，如 `⚖️`、`🗂️`）
- 旧条目保留，不要删——它是给用户看的历史

**6. 有批量脚本时**

若本次涉及大量版本断言（历史上有过 38 文件 / 189 处的规模），用 `scripts/_bump_*.py` 这类行级替换脚本，**不要写裸 `vX → vX+1` 规则**：`vX` 也会命中「vX 起…」「由 vX 的…」「vX 回归测试」这类历史注释。

**7. 验证一致性**

```bash
# 所有活动标记都应该是新版本
grep -n "$new" sw.js index.html | head -20
# 确认没有残留的旧版本活动标记（排除历史注释行）
grep -rn "$cur" --include="*.js" --include="*.html" . | grep -v "^\./\.git"
```

## Rationalizations

| 借口 | 反驳 |
|---|---|
| "只改了一行，不用跟版" | SW 缓存会让老用户一直拿到旧代码，你改了等于没改 |
| "`CACHE_NAME` 改了就行" | icon/cmgx 的 `?v=` 和页面标记不改，会出现缓存与显示双错位 |
| "全局替换快一点" | 历史注释会被改成一堆假话，下一个人（或下一个 AI）会被骗 |
| "版本号我记着呢，是那个数" | 只信 `sw.js` 里的值。文档和记忆都会过期 |

## Red Flags

- 你没跑 `grep` 就开始改版本号
- 改完后 `index.html` 里搜不到新版本号
- `sw.js` 的 `cmgx.js?v=` 与 `index.html` 的 `<script src>` 版本参数不一致
- 速览里出现了「当前版本」的自我指涉矛盾（标题写新、正文写旧）

## Verification

1. `grep -o "class-manager-v[0-9.]*" sw.js` 显示新版本
2. `grep -c "$new" sw.js index.html` 的非零结果覆盖了全部 A + B 类落点
3. 页面上三处可见标记（登录页 / 侧边栏 / 设置页徽标）都是新版本
4. 速览标题是新版本，且旧条目仍在
5. `node _runall.js` 全绿（版本号常被测试断言，见 `run-regression`）

---
name: push-github
description: 把 class-manager 的改动安全推到线上并验收。Use when 要发布代码、推送文件到 GitHub、或删远端文件时。
---

# 推送到 GitHub

## Overview

线上站点 = `https://github.com/cheeeom/class-manager` 的 `main` 分支，GitHub Pages 自动部署。
推送走 `gh` CLI + Git Data API（`api.github.com`），**不走 `github.com`**——这点很关键，`github.com` 在本机经常被代理掐断，但 `api.github.com` 通常通。

**唯一允许的推送脚本是增量的那个。** 整树覆盖脚本会把本机较旧的数据打回云端，属于丢数据的操作。

## When to Use

- 代码改完、回归通过，要发布
- 需要上传/更新仓库里的某个文件
- 需要删掉远端某个文件
- 推送失败，要判断是网络还是别的问题

## Process

**1. 先探网络，别猜**

```bash
for h in github.com api.github.com codeload.github.com raw.githubusercontent.com; do
  printf "%-32s " "$h"
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 "https://$h/"
done
```

`api.github.com` 通、`github.com` 挂 = **完全不影响推送**（因为走 API）。别看到 `github.com` 红就去修代理。

代理端口每个会话都会变，**不要用上次记的端口**：

```bash
env | grep -i proxy
```

**2. 用增量脚本推送**

```bash
node "D:/a/chee777/scripts/cm-push-incremental.js" "提交信息" index.html sw.js
```

- 参数 1：提交信息，惯例 `vX.Y.Z: 中文描述`
- 参数 2+：要更新的文件路径（相对仓库根）
- 删远端文件：写成 `--rm:路径`，例如 `--rm:data.json`

```bash
# 删除远端文件（必须显式 --rm: 前缀）
node "D:/a/chee777/scripts/cm-push-incremental.js" "chore: 移除数据文件" --rm:data.json
```

**3. 绝对不能用的脚本**

| 脚本 | 为什么不能用 |
|---|---|
| `D:/a/chee777/scripts/cm-push-via-api.js` | **整树覆盖**。本地数据一旦比远端旧，会把云端数据打回旧版 |

判断标准很简单：**它是不是只改你点名的文件。** 不是就停手。

**4. 不用先 commit**

脚本从**工作区**取原始字节建 blob，不读 `HEAD`。所以本地没 commit 也能推对内容。
（历史教训：早期版本用 `rev-parse HEAD:<file>` 读，跳过 commit 时把旧版 blob 推上去，线上代码永远不更新。）

**5. 验收——这一步不能省**

```bash
# 远端 HEAD
gh api repos/cheeeom/class-manager/git/ref/heads/main --jq '.object.sha'

# 目标文件的 blob sha（推送前后对比，必须变）
gh api "repos/cheeeom/class-manager/git/trees/main?recursive=1" \
  --jq '.tree[] | select(.path=="index.html") | .sha'
```

判定：

- 推了 `index.html` → 它的 blob sha **必须变**
- `data.json` → **tree 里必须查无此文件**（该文件已于 2026-09-26 从仓库删除，不再存在）

若写了依赖 `data.json` 的老断言脚本而抛 `KeyError`，**那是删除生效的证据，不是故障**。

**6. 推送失败的兜底**

```bash
# 间歇性断连，重试是有效的（实测 6 次里能通 1 次）
for i in $(seq 1 25); do
  node "D:/a/chee777/scripts/cm-push-incremental.js" "msg" files && break
  echo "第 $i 次失败，重试…"; sleep 3
done
```

`gh auth status` 应显示 `cheeeom` + `repo` 权限。认证掉了就先 `gh auth login`。

## Rationalizations

| 借口 | 反驳 |
|---|---|
| "哪个脚本不是推，能推上去就行" | 整树覆盖会打回云端 data.json，这是真实发生过的丢数据风险 |
| "推完看到 success 就行了" | 脚本的成功只看 API 返回。必须核 blob sha 才是真验收 |
| "本地没 commit，先 commit 再推" | 不必要。脚本直接读工作区，commit 反而多一步出错机会 |
| "`github.com` 探活挂了，等网络好再说" | 推送走 `api.github.com`。先看那个通不通 |
| "文件不存在就让它自动删" | 删除必须显式 `--rm:`。路径打错一个字符就会误删线上文件 |

## Red Flags

- 你打算运行的脚本名里带 `via-api` 或 `full`
- 推送后没查 blob sha 就说"已上线"
- 为了让 `data.json` 出现而去"恢复"它
- 用了上次会话记下的代理端口
- 提交信息不是 `vX.Y.Z: 中文描述` 格式

## Verification

1. `gh api .../git/ref/heads/main` 的 sha 是新的
2. 推送涉及的每个文件，blob sha 与推送前不同
3. `data.json` 在 tree 里查无此文件
4. waiting 一小会儿后，GitHub Pages 的线上页面能拿到新版本（版本号可从 `sw.js` 的 `CACHE_NAME` 对照）

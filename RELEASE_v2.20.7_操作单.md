# v2.20.7 发布操作单 · 把班级数据搬进私有仓

> 代码改动已写完，**53 套回归全绿**，**第 ①② 步已于 2026-09-19 22:35 执行完毕并复核通过**。
> **当前停在第 ③ 步（各设备换 Token）**，详见「三、现在停在哪」。
> 设计原理与踩坑记录见 `DATA_PLAN.md §16 / §17 / §18`，本单只讲「怎么点、按什么顺序、别做什么」。

---

## 一、这一版改了什么

数据从**公开站点仓** `cheeeom/class-manager` 搬到**私有数据仓** `cheeeom/class-manager-data`。

| # | 位置 | 变化 |
|---|---|---|
| 1 | `index.html` 常量 | `GH_REPO` → `'class-manager-data'`（推送侧 4 个写入点自动跟过去，一行搞定） |
| 2 | `index.html` 新增 | `fetchCloudEnvelope()` —— 私有仓的「读」入口，复用已有的 `fetchCloudMeta`（含 >1MB 兜底） |
| 3 | `index.html` 改写 | `getDataJsonUrl()` → `cloudApiUrl()`（返回 Contents API 端点，不再指向站点文件） |
| 4–6 | 三条拉取路径 | `autoSyncFromCloud` / `pullFromCloud` / `restoreFromCloud` 全部改走 `fetchCloudEnvelope()` |
| 7 | `configGHToken()` | 校验对象从「data.json 存不存在」改为「仓库通不通」——新仓还没数据文件时，按文件校验会把 404 误判成「无权限」，老师端就永远存不下 Token |
| 8 | 设置页文案 | 删掉「本仓库是公开的，未加密时任何人可下载」这句（私有仓后不成立） |
| **9** | **`sw.js`** ⚠️ | **原计划外的一处，见下方「四、本轮发现的雷」** |

**没有动的**：加密（`encryptForCloud`）、合并（`smartMergeData`）、推送安全检查（`checkPushSafety`）、推送实现（`doPushToCloud`）——全部原样。

---

## 二、53 套测试全绿

```
PASS: 53 files
FAIL: none
```

新增 `_v2207_test.js`（27 项），其中 6 项是**真跑**：用 mock fetch 实际执行 `fetchCloudEnvelope`，覆盖「带 Token / 无 Token / 404 / >1MB 走 raw 兜底 / 端点 URL 正确 / 解码正确」六条路径，不是只做字符串匹配。

---

## 三、现在停在哪

✅ 补丁已写入 `index.html`（824,799 字节，已冻结只读）、`sw.js`（3,121 字节）
✅ 38 个测试文件的版本断言已跟版（189 处）
✅ 回归 53 套全绿
✅ **第 ① 步 · 数据已迁**：私有仓 `cheeeom/class-manager-data` 的 `data.json` = blob `7661357e2d` / 172,679 B（commit `056a39eb`，2026-09-19T14:35Z）
✅ **第 ② 步 · 已发版**：站仓 commit `97e9344a`（42 个文件）。复核三项：`index.html` `390e38dbd01a → b00be3f29ed8`（✅ 已变，809,951 B，**与预判一字节不差**）、`sw.js` `7597c1ebe5ed → 6f7823703c58`（✅ 已变）、**`data.json` `7661357e2d6e` 纹丝未动**（✅ 数据安全判据通过）
⬜ **当前：第 ③ 步 · 各设备换 Token**（笔记本 ✅ 23:05 打通；其余设备待贴）
　（2026-09-19 22:43 实测：数据仓除迁移那一条外**尚无新提交** ⇒ 还没有设备换完 Token 开始写入；站仓 `data.json` 最后提交停在 `2026-09-19T01:05:36Z`，此后未再增长）
　（2026-09-19 23:05 复测：**数据仓已出现 3 条新写入**，blob `7661357e2d → 156909fbc4ad`；**站仓仍未增长** ⇒ 新前端写新仓、旧路径没被碰）

---

## 四、本轮发现的雷（原计划 6 处，实际 7 处）

`sw.js` 的预缓存清单里原本有 `'./data.json'`：

```js
const CORE_ASSETS = ['./', './index.html', './manifest.json', './icon_192.png', './icon_512.png', './data.json'];
cache.addAll(CORE_ASSETS)   // ← 全成全败
```

`cache.addAll` 是**全成全败**：清单里只要有一个请求 404，整个预缓存就整体 reject，**Service Worker 直接装不上**（离线功能与后续缓存更新全废）。

原本的收尾动作是「删掉站仓的 data.json」—— 那一步一旦执行，`./data.json` 就 404，SW 立即装不上。**必须在删文件之前先把这一项从清单里摘掉**，本版已摘（顺带去掉 fetch 拦截里对 `data.json` 的特判）。

---

## 五、接下来按顺序做（5 步，别换顺序）

### 第 1 步 · 迁数据（先迁，不要先发版）　✅ 已完成 · 2026-09-19 22:35

```
"C:\Users\84669\.workbuddy\binaries\python\versions\3.13.12\python.exe" ^
  D:\a\chee777\scripts\cm-make-data-repo.py copy cheeeom/class-manager data.json class-manager-data
```

成功会打印「已写入 cheeeom/class-manager-data/data.json」+「内容 密文信封」。
> 现在迁是零风险的：还没有任何前端会去读这个仓。
> （脚本会拒绝明文——读到明文一律中止。）

### 第 2 步 · 发版（与第 1 步尽量挨着，几分钟内）　✅ 已完成 · commit `97e9344a`

推送 `index.html` + `sw.js` + 38 个跟版后的测试文件。**必须用增量脚本**：

```
node D:/a/chee777/scripts/cm-push-incremental.js "feat: 数据迁至私有仓 class-manager-data (v2.20.7)"
```

验收：`index.html` 的 blob sha **必须变**、`data.json` 的 blob sha **必须不变**。

> 顺序理由：先把数据放进私有仓，新前端一上线就有数据可读。
> 反过来（先发版再迁）会留一段「云端空」窗口——谁先写，谁就把自己那份本地数据当成全家底定进新仓。

### 第 3 步 · 每台设备换 Token　🔄 **进行中**（笔记本 ✅ 已验证通过 · 2026-09-19 23:05）

> ✅ **笔记本这一台已经打通，且是服务器端硬证据**：数据仓在 23:04:45 / 23:05:11 / 23:05:21（+08:00）出现 **3 条 `auto-sync: update data.json`**，
> `data.json` blob 由迁移时的 `7661357e2d`（172,679 B）变为 **`156909fbc4ad`（172,803 B）**，同时**站仓 `data.json` 仍停在 `2026-09-19T01:05:36Z` 没动**。
> 密文安全校验通过：信封 `enc=1`、`alg=PBKDF2-SHA256(250000)/AES-GCM-256`、`salt`/`iv` 齐全，`data` 字段为纯 base64（无任何中文字符），明文关键词探测全为零。
> ⇒ **写路径（Contents: Read and write）确认可用，不是只配上了、而是真的写进去了。**
>
> ⬜ **其余设备**：照本节把同一枚 Token 贴进去，看到「Token 验证通过」+「⬇️ 从云端拉取数据」成功即可。

新前端要读私有仓，**拉取也需要 Token 了**（以前是匿名读站点文件）。

在每台设备上：设置页 →「配置 GitHub Token」→ 填一个 **fine-grained PAT**：

- 只授权 **`cheeeom/class-manager-data`** 这一个仓
- 权限只勾 **Contents: Read and write**
- 有效期：**首选 No expiration**；**选 1 年也可以**（选 1 年就把到期日记进下方台账）。**别选 90 天** —— v2.18.6 那轮「同步失败 145 分钟」的根因就是 token 到期，而且到期日**所有设备同时失效**。本场景靠「一台一枚 + 只授权一个私有仓 + 只给 Contents RW」做控制，泄露者也删不掉仓库、碰不到代码、拿不到明文
- **一枚可以共用**（fine-grained PAT 不绑设备）。**本项目定档「一枚共用」**：设备都是你自己的，建一次只过一遍 sudo、到期也只改一处；代价是**丢一台就要所有设备一起重填**。
  若某台设备将来会**脱离你独占**（借人、可能被学生碰到），再改成「一台一枚」、单独吊销。

#### 创建成功时你会看到什么（照这个核，别自己吓自己）

GitHub 会给一段确认文字，形如：

> `cm-sync-laptop` grants you **2 permissions for 1 repository**：**Contents** — Read and write、**Metadata** — Read-only

- ✅ **「2 permissions」是对的**：`Metadata: Read-only` 是 GitHub **强制自带**的（fine-grained token 取消不掉），不是你多勾了。
  它恰好也是前端保存 Token 时那次校验（`GET /repos/{owner}/{repo}`）所依赖的权限 ⇒ **校验会返回 200，能存下**。
- ⚠️ **真正要核的是「1 repository」是哪一个**：必须是 **`cheeeom/class-manager-data`**，**不能**是 `cheeeom/class-manager`。
  查看位置：创建完成页，或 `https://github.com/settings/personal-access-tokens` 点开该 token 看 Repository access。

#### 设备 Token 台账（**一枚共用**：建一枚、记哪些设备在用；丢了或到期按这行处理）

| Token 名 | 授权仓 | 权限 | 到期日 | 用于哪些设备 | 状态 |
|---|---|---|---|---|---|
| `cm-sync-laptop` | class-manager-data | Contents:RW + Metadata:R | **2027-09-19** | 笔记本 +全部设备 | ✅ 已建，待填入 |
| | | | | | ⬜ |

> ⚠️ 到期日 **2027-09-19**：到点前一个月要重配（重做本节第 3 步）。因为**共用**，到期会是**所有设备同时断**，不会一台一台来。
> 💡 名字 `cm-sync-laptop` 现在名不副实（它要填进所有设备）—— GitHub 允许**改名**（不改密钥值），建议改成中性名如 `cm-sync`。
> 💡 sudo 态只有 **2 小时**，共用方案下你**只需要过这一次 sudo**，这就是它的最大好处。

> ✅ **前置条件已满足**：新前端已于 2026-09-19 上线，**现在换 Token 不会遇到旧版的误报**，生成一枚就能填一枚。
> （历史原因：旧前端的校验是「读站仓的 `data.json`」，拿只授权数据仓的 Token 会被误判成「无权限」而存不下；
> 新前端已改为「校验仓库本身可不可达」，见「一、这一版改了什么」第 7 条。）

### 第 4 步 · 观察一天

- 数据仓 `data.json` **在长**（说明新前端在写）✅
- 站仓 `data.json` **不再长**（说明旧前端已退场）✅

### 第 5 步 · 清收：删掉站仓的 `data.json`

两台设备都确认正常后，再把公开仓那份删掉。

> 这一步的意义不是省空间，而是让**还没更新的旧客户端响亮地失败**，而不是继续往旧位置静默写、造成两处数据分叉。

---

## 六、四件绝不要做的事

| ❌ | 原因 |
|---|---|
| **不要在发版之后再 `copy` 一次** | 新前端上线后，站仓那份会**停更变旧**；再 copy 会把新数据打回旧版 |
| **不要先删站仓 `data.json`** | 前端还指着它，删了现网立刻读不到数据（而且 SW 会装不上——见「四」） |
| **不要让管理员 Token 进老师设备** | 那个 Token 能**删仓**（滚仓用）。老师设备只配 fine-grained、只授权数据仓 |
| **不要用 `cm-push-via-api.js`** | 它是整树覆盖，会把本机较旧的 `data.json` 打回云端 = 丢数据。只用增量脚本 |

---

## 七、出问题怎么回退

代码层的回退很简单：把 `GH_REPO` 改回 `'class-manager'` 并恢复拉取路径即为 v2.20.6 行为。
所以**在删站仓 `data.json` 之前**（第 5 步之前），数据始终有两条通路，回退代价很低。
第 5 步一旦做了，回退就要先把数据仓的密文再搬回站仓。

---

## 八、滚仓（现在是独立的一件事）

- 全手动，**不做自动滚仓**。
- 已挂只读月度提醒：每月 1 号 09:00 体检，数据仓 ≥130 MB 才提醒（提示词内明写禁止任何写操作）。
- 真要滚：双击 `D:\a\chee777\scripts\cm-roll.bat`（内部是 `roll --yes --if-over=200`，删仓前会先验管理员 Token 的 `delete_repo` 权限，缺权限立刻中止）。
- 按现在 9.7 次/天 ≈ 579 MB/年，撞到 200MB 大约还要 **3~4 个月**。

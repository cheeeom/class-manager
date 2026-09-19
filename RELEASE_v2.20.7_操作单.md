# v2.20.7 发布操作单 · 把班级数据搬进私有仓

> 对应代码改动已写完，**53 套回归全绿**，但**还没有推送**（见「三、现在停在哪」）。
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
⬜ **尚未推送** —— 因为推下去的那一刻，所有设备会**立刻**改读私有仓；而私有仓现在是空的。所以推送必须和「迁数据」挨在一起做，见下。

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

### 第 1 步 · 迁数据（先迁，不要先发版）

```
"C:\Users\84669\.workbuddy\binaries\python\versions\3.13.12\python.exe" ^
  D:\a\chee777\scripts\cm-make-data-repo.py copy cheeeom/class-manager data.json class-manager-data
```

成功会打印「已写入 cheeeom/class-manager-data/data.json」+「内容 密文信封」。
> 现在迁是零风险的：还没有任何前端会去读这个仓。
> （脚本会拒绝明文——读到明文一律中止。）

### 第 2 步 · 发版（与第 1 步尽量挨着，几分钟内）

推送 `index.html` + `sw.js` + 38 个跟版后的测试文件。**必须用增量脚本**：

```
node D:/a/chee777/scripts/cm-push-incremental.js "feat: 数据迁至私有仓 class-manager-data (v2.20.7)"
```

验收：`index.html` 的 blob sha **必须变**、`data.json` 的 blob sha **必须不变**。

> 顺序理由：先把数据放进私有仓，新前端一上线就有数据可读。
> 反过来（先发版再迁）会留一段「云端空」窗口——谁先写，谁就把自己那份本地数据当成全家底定进新仓。

### 第 3 步 · 每台设备换 Token

新前端要读私有仓，**拉取也需要 Token 了**（以前是匿名读站点文件）。

在每台设备上：设置页 →「配置 GitHub Token」→ 填一个 **fine-grained PAT**：

- 只授权 **`cheeeom/class-manager-data`** 这一个仓
- 权限只勾 **Contents: Read and write**
- 建议设 90 天有效期（旧写法：授权站点仓的那个 Token 已经不通了）

> ⚠️ **顺序不能颠倒**：必须等新前端上线后再换 Token。
> 旧前端的校验方式是「读站点仓的 data.json」，拿只有数据仓权限的 Token 去校验会直接报「无权限」而存不下。

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

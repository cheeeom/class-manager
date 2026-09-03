# AGENTS.md — 班主任工作台 开发笔记

> 面向后续开发者（人类或 AI 助手）的项目全景认知与接手指南。
> 行号以 **v2.7.0（commit `1dc1af9`，2026-09-01 全量核对）** 为准，代码变动后会漂移；定位代码时优先搜小节注释（形如 `/* ==================== XXX ==================== */`）。
>
> **更新记录：2026-09-01 全量核对** —— 对着 main HEAD（`1dc1af9`）逐行校验：① 本篇行号全部校准到 v2.7.0 真实值；② **新发现 P0 数据事故**：云同步存在「空本地覆盖云端」竞态，实测 8/31~9/1 云端学生数在 68→0→54→55→0→56 间反复抖动（**详见 5.6 节，接续开发第一优先级**）；③ 新增第 10 节「接手陷阱」（GitHub zip 有 CDN 缓存会拿过期代码，必须 git clone）；④ 已知问题清单按实测状态刷新。
> **更新记录：2026-08-29 v2.7.0** —— 全站美术风格重塑为「纸墨·新中式」（详见第 9.5 节设计系统）：朱砂主色替换青色、宋体标题、登录页重做（墨色面板/印章/竖排文字）、Canvas 图表改五彩颜料色；顺带修复暗色模式侧栏不变暗的老 bug（.sidebar 原为硬编码浅色渐变）。
> **更新记录：2026-08-29 v2.6.1** —— 修复云同步字段缺口（workLogs/honors/notices/reasonScores 上云）、smartMergeData 嵌套 bug、请假弹窗重复定义、closeMoreDrawer 重复、reasonScores 持久化；**移除源码内置 GitHub Token**（改为纯 localStorage 配置 + 保存前 API 验证 + 未配置提醒）；sw.js CACHE_NAME → v2.6.1；README 全面更新（详见第 8 节）。

---

## 1. 项目定位

- **班主任工作台 v2.7.0**（main HEAD `1dc1af9`，2026-09-01 核对）：面向班主任的班级管理 Web 应用（班级管理 · 学分统计 · 班委协作）。
- 线上地址：https://cheeeom.github.io/class-manager/ （GitHub Pages，`main` 分支根目录即站点）。
- **技术形态：纯单文件应用。** 零框架、零构建、零 npm 依赖。整个应用 = 一个 `index.html`（**7559 行 / 357KB**：CSS 1~1665 + HTML 1667~2632 + JS 2633~7422 + 尾部 DOM 7423~7559）。双击即可运行，file:// 协议下除云同步外全部可用（fetch 本地文件会失败，属预期）。
- 代码规模：231 个函数、15 个页面、90 处 `innerHTML` 渲染。
- 登录：6 位数字密码，SHA-256 加盐哈希，**纯 JS 手写 sha256 实现**（兼容 file:// 下无 Web Crypto）。
- PWA：manifest.json + sw.js，可安装、可离线。

## 2. 文件清单

| 文件 | 作用 | 备注 |
|---|---|---|
| `index.html` | 全部应用代码（CSS+HTML+JS） | 唯一需要日常改动的文件 |
| `data.json` | **云端数据存储**（应用自动读写） | ⚠️ 不要手动编辑；每次设备操作都会自动提交覆盖它 |
| `sw.js` | Service Worker | 导航/data.json 网络优先，静态资源缓存优先；发版需 bump `CACHE_NAME` |
| `manifest.json` | PWA 配置 | theme_color `#00B4D8` |
| `icon_192/256/512.png`, `favicon.*` | 图标 | |
| `deploy.sh` | 部署脚本 | 内含 git 代理 `http://192.168.1.13:9890`（直连 GitHub 需走此代理） |
| `avatar-img.txt` / `schedule-img.txt` | 裸 JPEG 二进制（.txt 后缀） | **历史遗留，代码中无任何引用**，可删 |
| `README.md` | 用户文档 | 停留在 v2.4.1，待更新 |
| `upgrade_v2.0.0_20260808.md` | v2.0.0 升级记录 | 含云同步合并策略的设计初衷 |

## 3. index.html 内部结构地图

```
行 1~1665     CSS（</style> 在 1665）Reset→暗夜→布局→各模块→响应式 768/480→登录页→纸墨细节→墨线图标
行 1667~2632  HTML 骨架（<body> 在 1667；SVG symbol 图标库 defs 也在 body 开头）
              ├─ 登录页 loginOverlay（数字键盘）
              ├─ .app：侧边栏(15 个 nav-item) + topbar + 各 page（id="page-xxx"）
              ├─ 各功能 Modal（加学生/请假/考试/待办/批量学分/通知编辑器/通知生成/学生选择）
              ├─ 学生详情侧滑面板 sidePanel
行 2633~7422  JS（<script> 在 2633，</script> 在 7422）
行 7423~7559  尾部 DOM：移动端 Tab 栏（5 tab + 更多抽屉）
              （注意：这部分在 </script> 之后，DOM 仍可被前面 JS 查询到）
```

15 个页面（page id）：`dashboard` `students` `profiles` `committee` `seating` `duty` `attendance` `grades` `todo` `worklogs` `notices` `credits` `honors` `analytics` `settings`。移动端底部 5 tab = 首页/学生/待办/学分/设置，其余 10 个进「更多」抽屉。

JS 各模块（按小节注释定位）：

| 小节 | 起点(约) | 内容 |
|---|---|---|
| PWA | 2633 | SW 注册 |
| Data Layer | 2640 | `STORE_KEY`、GH 常量、`state` 定义、`loadData/saveData`（2797 处调用 `autoPushToCloud`） |
| **Git Cloud Sync** | **2800** | `smartMergeData`(2810)、`autoSyncFromCloud`(2918)、**`autoPushToCloud`(2984，P0 事故点)**、`configGHToken`/`pushToCloud`/`pullFromCloud`/`restoreFromCloud` |
| Sample Data | 3209 | `genSid`、`loadSampleData` |
| Navigation | 3235 | `navigateTo()` 按 page 分发渲染 |
| More Drawer | 3282 | 移动端「更多」抽屉 |
| Toast / Ripple / CountUp | 3312/3323/3338 | 通用交互 |
| 班级头像 & 口号 / 课程表图片 | 3352 | 图片压缩 `compressImage`、Blob URL 渲染、Ctrl+V 粘贴 |
| Dashboard | 3630 | 统计卡、Top5、Canvas 分布图 `drawDistChart` |
| Students Page / Add Modal / Import / Detail Panel | 3815/3949/3972/4010 | 学生表格、详情侧滑面板、标签管理 |
| Committee / Seating / Duty | 4102/4235/4411 | 班委任命、座次（3 策略）、值日排班（教室/公共区各 4 人） |
| Credits / 学分搜索 / Batch / Analytics | 4532/4558/4702/4740 | 学分操作+撤销、批量加减、纯 Canvas 图表（range/pie/trend）、成绩分析 |
| Settings / Dark Mode / Profiles / WorkLogs / Honors | 5202/5204/5232/5390/5518 | v2.6.0 四大模块；`ensureProfile` 惰性建档案 |
| Export/Import/Clear | 5697 | JSON 导出/导入（导入前自动备份下载）/清空 |
| Sync Status / Refresh | 5812/5848 | 同步状态徽标、手动刷新 |
| 登录 & 密码（SHA-256 加盐） | 5861 | `sha256`、`hashPwd`、默认哈希、数字键盘输入 |
| **Init** | **6047** | 登录拦截 → `loadData()` → 图片压缩 → `renderAll()` → **`autoSyncFromCloud()`（异步，P0 竞态起点）** |
| PWA 安装提示 | 6109 | beforeinstallprompt + iOS Safari 提示 |
| 仪表盘考试/待办预览 | 6163/6223 | |
| 学生搜索选择 / 请假时长 / 请假管理 | 6267/6339/6385 | 请假弹窗带搜索选人（`openLeaveModal` 已唯一，见 6271） |
| 成绩管理 / 待办提醒 | 6521/6697 | CSV 模板/导入/导出；todo 置顶排序 |
| 饮水机值日 | 6816~6888 | 3 人/轮，`waterUsedIds` 轮转 |
| 通知模块 | 6889~7420 | 12 内置模板、变量 `{xxx}` 提取/填充、草稿自动保存、Canvas 生成图片、历史记录 |

## 4. 数据模型

### state（内存单例）→ localStorage key `classManagerData`

核心字段：`className`、`students[]`（`{id, sid, name, credit, tags[], profile?{gender,birth,guardian,phone,address,notes,timeline[]}}`）、`operations[]`（学分流水 `{id, studentId, studentName, amount, reason, time}`）、`reasons[]`、`committee{banzhang,fubanzhang,xuexi,shenghuo,tiyu}`（存学生 id）、`seating{cols,rows,seats[]}`、`duty{currentWeek(0本周/1下周), schedule[], waterDuty[], waterUsedIds[], waterRound}`、`leaves[]`（`status: pending/extended/returned`，含 history）、`exams[]`（`scores` 以学生 id 为 key）、`todos[]`（`priority: normal/important/urgent`，`pinned`）、`workLogs[]`、`honors[]`、`notices{templates[], history[], draft, updatedAt}`、各类 `nextXxxId` 计数器、`scheduleImage/classAvatar`（base64）、`classMotto`、`exportedOpsCount`。

### 其他浏览器存储

- localStorage：`classManagerData`、`classManagerLoginPwd`、`classManagerAdminPwd`、`gh_sync_token`、`cm_theme`、`pwa_dismissed`、`pwa_ios_dismissed`
- sessionStorage：`classManagerUnlocked`（登录态，关标签页即失效）

### data.json（云端）实际结构

与 localStorage 数据同构。当前线上内容：20 名学生 / 19 条操作 / 2 请假 / 2 考试 / 1 待办 / 头像 base64（课程表图片云端为 null，仅存本地）。`hasAvatar`/`hasSchedule` 是附加的布尔标记。

## 5. 云同步机制（接手必读）

- **推送**：任何写操作 → `saveData()` → `autoPushToCloud()`（2 秒防抖）→ GitHub Contents API：GET 取 sha → PUT base64 覆盖 `data.json`（commit message `auto-sync: update data.json`）。提交历史里的大量 auto-sync 提交即来源于此。
- **拉取**：页面加载 + `visibilitychange` 时 `autoSyncFromCloud()` → `fetch('./data.json?t=…')` → `smartMergeData()` 合并。
- **合并规则**（`smartMergeData`）：
  - students / leaves：按 id 合并，updatedAt 新者胜
  - operations / exams：按 id 去重并集
  - todos：按 id，已完成优先
  - workLogs / honors：按 id 并集
  - notices：整个对象按 `updatedAt` 取新
  - reasonScores：键并集，冲突时云端优先
  - committee / seating / duty：比较 `exportedOpsCount`，大者整体胜出
  - nextId/nextOpId/nextSid/nextLeaveId/nextExamId/nextTodoId/nextWorkLogId/nextHonorId：取最大值
  - 图片：偏好“更小的版本”，防止旧超大图把 data.json 撑爆
- **推送白名单**：统一为共享常量 `CLOUD_SYNC_FIELDS`（auto/manual push 共用，含 workLogs/honors/notices/reasonScores）。`notices` 推送前经 `stripNoticeHistoryImages()` 剥离历史记录里的图片 base64（单张近 1MB，防止 data.json 膨胀导致移动端拉取超时）——历史图片仅保留在生成它的设备本地。
- **Token（v2.6.1 起）**：仅存各设备 localStorage `gh_sync_token`，源码不再内置。`hasGHToken()` 为真实检查；`configGHToken()` 保存前先 GET Contents API 验证（200 才保存，401/403/404 给出具体提示）；未配置时 `autoPushToCloud()` 静默跳过（每会话 toast 提醒一次），设置页显示醒目「未配置」状态。拉取侧（autoSyncFromCloud/pullFromCloud/restoreFromCloud）fetch 公开仓库的 data.json，无需 token。
- **图片体积防线**：上传即压缩（头像 400px/0.7、课程表 800px/0.7 JPEG）；启动时若课程表 base64 > 400KB 自动再压缩；渲染用 Blob URL（移动端 Safari 对超大 data URI 解码不稳）。

### 5.6 🚨 P0：空本地覆盖云端的竞态（接续开发第一优先级）

**已实测发生，不是理论风险。** 逐提交回溯 `data.json`（`contents/data.json?ref=<sha>`）得到云端学生数曲线：

| 时间 | commit | students |
|---|---|---|
| 08-31 01:36 | `6768475f` | 67（手工 commit「注入 2026 级 67 名新生数据」） |
| 08-31 02:23 | `fd8bee73` | 68 |
| 08-31 15:07 | `e2e12495` | **0** ← 被清空 |
| 08-31 15:08 | `0bdb5eee` | 54 ← 被救回 |
| 08-31 15:11 | `d5286155` | 55 |
| 09-01 16:00 | `473cfbd9` | **0** ← 又被清空 |
| 09-01 16:00 | `612bda84` | 56 ← 又被救回（当前值） |

**根因链**（4 个缺陷叠加）：

1. `saveData()`（2765）末尾无条件 `autoPushToCloud()`（2797）——**约 60 处调用点**，任何一次写操作都会触发 2 秒防抖后的整包覆盖推送。
2. `autoPushToCloud()`（2984）用 GET 拿 sha，**但只把 sha 当 PUT 参数，从不比对远端内容**。本地残缺/为空时照样整体覆盖云端。
3. Init（6047）流程为 `loadData()` → `renderAll()` → `autoSyncFromCloud()`（**异步**）。新设备/清缓存后，`loadData()` 得到空 state；若 2 秒内拉取未完成（国内访问 raw.githubusercontent 常 >2s），期间任何 `saveData()` 就会把**空数据**推上去。**这就是「0」的来源。**
4. `autoSyncFromCloud()`（2935）`localCount === 0` 分支直接 `localStorage.setItem(..., remoteData)` 全盘采用远端——此时远端已被自己推成空，本地也跟着空，形成自我确认。

**为什么能自愈**：`smartMergeData()` 的学生合并是「按 id 并集、只增不减」（2815-2823）。所以有数据的设备上线后 merge 仍保留本地 56 人，再推回云端——于是出现「0 ↔ 56 拉锯」。**但只要最后一次推送来自空设备，数据就永久丢失。**

**注意**：`operations`（学分流水）在所有回溯提交中恒为 0，说明学分记录可能已经丢过一次，或从未成功上云——接手时务必向使用者确认。

**修复方案（按性价比排序，建议一次性做完）**：

1. **推送闸门（必做）**：`autoPushToCloud` 内 GET 拿 sha 的同时解析 `content`，若 `本地 students 数 === 0 && 远端 > 0` → 中止推送 + `showToast` 强提示「检测到本机为空，已阻止覆盖云端 N 条数据」，并自动改走拉取。
2. **推送前合并（必做）**：PUT 的 body 改用 `smartMergeData(localData, remoteData)` 的结果，而非裸 localStorage。这样自动推送永远是「并集」，不可能删数据；真正的覆盖只保留给 `restoreFromCloud` 这类显式操作。
3. **同步锁（必做）**：加 `syncInProgress` 标志；`autoSyncFromCloud` 期间 `autoPushToCloud` 排队，拉取完成后再推。
4. **删除语义（做 1~3 后可缓）**：单条删除（学生/请假/待办）走「墓碑标记 + 惰性清理」，否则整体覆盖式推送永远删不掉东西。
5. **空态二次确认（可选）**：`clearData()`（5793）已有双重 confirm，但推上去仍是静默覆盖——配 1/2 后自动安全。

**验证方式**：改完后在浏览器清空 localStorage、断网重连、快速连点，观察 `data.json` 提交历史中学数是否单调不减。

### 5.7 🔴 安全现状：云端数据完全公开（2026-09-01 实测）

**仓库是 public 的，Pages 站点是公开的，所以 `data.json` 对全世界可读。** 实测无任何凭据的一条命令即可拖走全部数据：

```bash
curl https://raw.githubusercontent.com/cheeeom/class-manager/main/data.json
```

**已确认泄露的内容**（2026-09-01 快照，72KB）：

| 泄露项 | 数量 |
|---|---|
| 学生姓名 | 56 |
| **家长手机号** | **55 个（全部真实号码）** |
| 宿舍楼栋 + 房间号（如「6栋-803室」） | 56 |
| 班级名 | 26幼2班 |
| 班级头像 JPEG 690×690（`avatar-img.txt`，疑似学生合影） | 1 |
| 课程表 JPEG 1919×1080（`schedule-img.txt`） | 1 |

**⚠️ 关键误区：把仓库转成私有并不能解决问题。**

1. **GitHub Free 账户的私有仓库不能使用 Pages**（需 Pro $4/月）。
2. **即使付费转私有，Pages 站点本身仍然是公开的** —— 仓库可见性与站点可见性是两套设置。站点的 `data.json` 照旧裸奔。
3. 要让站点本身需要鉴权，得是 GitHub Enterprise Cloud 组织。

**结论：唯一根本解是「数据加密后再上云」，而不是改仓库可见性。**

**⚠️ 第二个误区：删文件救不回来。** `data.json` 在 git 历史里出现过 **96 次**，每一次的历史版本都能单独访问（包括更早那份 68 人的完整数据）。要清除必须用 `git filter-repo` 重写历史 + force push，且 GitHub 服务端可能仍缓存旧 commit（需联系官方支持彻底清理）。

**修复方案（推荐 A）**：

- **A. 客户端加密上云（推荐）**：保留现有 GitHub 同步架构与 Pages 免费托管。推送前用 AES-GCM 加密整个 `data.json`，拉取后解密。口令用 PBKDF2（高迭代）派生密钥，**必须独立于 6 位登录密码**——6 位数字仅 10⁶ 组合，加密了也扛不住暴力破解。公开仓库里只剩密文，泄露即无意义。代价：约 100 行改造；`crypto.subtle` 需 https（Pages 满足），`file://` 下自动降级为不同步；各设备需输入一次同步口令。
- **B. 换私有存储后端**：数据迁到 Supabase / Cloudflare KV + 简单鉴权，不再落公开仓库。代价：需注册第三方服务，架构改动更大。
- **C. 不再上云**：纯本地 + 手动导出 JSON 备份（项目本就支持导出/导入）。代价：失去多设备自动同步。

若采用 A，仍建议追加历史重写（清除 96 个明文版本），两者叠加才是完整止血。

### 5.8 ✅ v2.8.0 已落地：客户端加密上云（方案 A 实施记录）

2026-09-02 完成改造。搜索注释 `云同步加密（v2.8.0）` 可定位整块代码（行号会漂，注释不会）。

**信封格式**（`data.json` 加密后的样子）：

```json
{ "enc":1, "alg":"PBKDF2-SHA256(250000)/AES-GCM-256",
  "salt":"<base64>", "iv":"<base64>", "data":"<base64 密文>", "updatedAt":"ISO" }
```

salt / iv 明文存放是标准做法，安全性 100% 取决于口令强度。

**新增函数一览**：

| 函数 | 作用 |
|---|---|
| `encryptForCloud(plainObj)` | 明文对象 → 加密信封。无口令或不支持 Web Crypto 时**原样返回明文**（向后兼容） |
| `decryptFromCloud(env)` | 信封 → 明文对象。未加密数据原样返回；解密失败抛「口令不正确」 |
| `configSyncPwd()` | 交互式配置入口（设置页按钮调用）。≥8 位、二次确认、可留空关闭 |
| `checkPushSafety(remoteJson)` | **推送闸门**。返回 `{ok, msg, resync, remote}`，`remote` 是解密后的云端明文 |
| `doPushToCloud(message)` | **统一推送实现**（auto/manual 共用）：GET sha → 闸门 → 与云端合并 → 加密 → PUT |
| `applyCloudData(remoteData)` | 统一落地：解密后的明文与原来的明文走同一条合并路径 |
| `buildCloudPayload(parsed)` | 构造推送负载（字段白名单 + 剥离通知历史图片） |

**关键设计决策（改这块前务必理解）**：

1. **全站只有一处 PUT**。`doPushToCloud` 是唯一写 GitHub 的入口，任何新增推送需求都必须走它，否则会绕过加密把明文推上去。改完用 `grep -n "method: *'PUT'" index.html` 确认仍然只有 1 处。
2. **推送前先与云端合并**（`smartMergeData`）。旧代码直接把本地数据覆盖上去，另一台设备的新增内容会被顶掉。现在是并集合并后再推。
3. **`syncInProgress` 同步锁**。拉取期间 `autoPushToCloud` 不抢推，改为标记 `_pushPending`，等拉取完成并合并后再补推。这是「空本地覆盖云端」P0 竞态的直接成因。
4. **三道拦截**：本地 0 人 + 云端 N 人 → 阻止推送并自动改从云端恢复；云端已加密但本机无口令 → 阻止（否则会用明文覆盖密文）；解密失败（口令与其他设备不一致）→ 阻止（否则会用错密钥加密覆盖，等于毁数据）。
5. **多设备 salt 一致性**：`decryptFromCloud` 会把云端信封的 salt 记入 `lastCloudSalt`，`_getSalt()` 优先用它。否则每台设备各生成各的 salt，同一口令也解不开对方的数据。

**口令存储**：`localStorage` 的 `cm_sync_pwd` / `cm_sync_salt`。**不上传、无法找回**——忘记口令 = 云端数据永久不可读，只能清空重来。务必提醒用户先「导出数据」留明文备份。

**降级行为**：`crypto.subtle` 需要安全上下文。`file://` 打开时 `cryptoOK()` 为 false → 不加密、不解密（遇密文会提示「请通过 https 打开」）。GitHub Pages 是 https，正常。

**回归测试**：`node _crypto_test.js`（从 `index.html` 抽取真实实现跑，非手抄副本）。覆盖：密文无明文残留 / 还原一致 / 错口令被拒 / 多设备 salt 一致。改加解密后必跑。

**⚠️ 尚未完成**：加密只管住**以后**的推送。git 历史里那 96 个明文版本仍然可访问，必须做历史重写（见 5.7 第二个误区）才是完整止血。

## 6. 开发工作流（每次发版 checklist）

0. **先 `git pull`**，且只用 git 拿代码（zip 会被 CDN 缓存骗，见 10.1）。
1. 改 `index.html`。
2. **版本号三处**（2026-09-02 校准）：登录页 `<div class="login-version">` + 侧边栏 `<div class="sidebar-footer">` + `sw.js` 第 2 行 `CACHE_NAME`。当前三处均为 `v2.8.0`。改版本时直接搜 `v2.8.0` 一次性替换。
3. 动了 SW 或想强制刷新缓存 → bump `sw.js` 的 `CACHE_NAME`（**当前是 v2.8.0，改完务必同步**）。
4. commit → push main（代理见 10.2）→ Pages 自动部署。
5. **永远不要手动编辑 `data.json`**（它是活数据，会被下一次 auto-sync 覆盖）。
6. 动了加解密 → 跑 `node _crypto_test.js`；动了推送 → 确认 `method:'PUT'` 全站只有 1 处。
6. 本地调试：直接双击 index.html；要测云同步则起本地 HTTP 服务。
7. 提交信息惯例：`vX.Y.Z: 中文描述`；数据提交只有 auto-sync，不掺入手动改动。
8. 改动涉及云同步时，**先做 5.6 节的推送闸门验证**（清空 localStorage → 断网重连 → 连点），确认云端学生数单调不减再发版。

## 7. 版本演进

| 版本 | 日期 | 内容 |
|---|---|---|
| v2.0.0 | 2026-08-08 | 移动端响应式 + Git 云同步 + GitHub Pages 部署（详见 upgrade_v2.0.0 md） |
| v2.3.9~12 | 2026-08-13 | PWA 基础、图片压缩、首屏性能（100s→2-8s）、移动端空白修复 |
| v2.4.0/2.4.1 | 2026-08-15 | 底部 Tab 栏重设计（5 tab + 更多抽屉）、WCAG AA 对比度、SW 语法修复 |
| v2.5.0 | 2026-08-15 | 通知模块（模板库/变量填充/图片生成/历史）commit `b4cade6` |
| v2.6.0 | 2026-08-15 | 暗夜模式、学生档案、工作留痕、荣誉墙 commit `125178d` |
| v2.6.1 | 2026-08-29 | 云同步安全改造 + 字段补全 commit `4124df3` |
| **v2.7.0** | **2026-08-29** | 「纸墨·新中式」美术重塑 commit `9bdb4db`（当前版本） |

tags：`v2.5.0`、`v2.6.0`。v2.6.0 之后除上表三个代码提交外，**全部为 auto-sync 数据提交**（截至 2026-09-01 共 20+ 条）。

**历史节点**：`6768475f`（2026-08-31 01:36）手工 commit「data: 注入 2026 级 67 名新生数据（含家长联系方式/宿舍床位标签），清除全部示例数据」——即线上 56 名真实学生的来源。

## 8. 已知问题清单（按优先级）

### P0（真实数据/功能缺陷）
- 🔴 **【最高】git 历史里 96 份明文 data.json 仍可公开下载（详见 5.7 / 5.8）**：v2.8.0 的加密只管住**以后**的推送，历史上 96 个提交版本照旧可被 `raw.githubusercontent.com/cheeeom/class-manager/<sha>/data.json` 取到。**必须用 `git filter-repo` 重写历史 + force push 才能清除**，且 GitHub 服务端可能残留缓存（需联系官方支持彻底清理）。这是当前唯一未止血的泄露面。
- 🟠 **【高】新设备首次启用加密的操作顺序**：必须先在有数据的那台设备设口令并推送（让云端变成密文），再让其他设备设**完全相同**的口令。反过来会触发三道拦截之一（都是保护性的，不会丢数据，但会让人懵）。
- 🟡 **【中】空本地覆盖云端竞态（详见 5.6）——代码侧已修复于 v2.8.0**：加了 `syncInProgress` 同步锁 + `_pushPending` 延迟补推 + 推送前 `smartMergeData` 合并 + `checkPushSafety` 三道拦截。**建议做一次真机验证**（清缓存打开 → 确认自动从云端恢复而非推空数据）。
1. ~~云同步字段缺口~~ **已修复于 v2.6.1**：推送白名单统一为 `CLOUD_SYNC_FIELDS`，workLogs/honors/notices/reasonScores 及其 ID 计数器均可上云；顺带修掉了 honors/workLogs/notices 合并逻辑被错误嵌套在 exams 分支内的问题（远端数据缺 exams 字段时这些模块会被跳过合并）。
2. ~~`openLeaveModal` 重复定义~~ **已修复于 v2.6.1**：删除了后定义的旧下拉版，保留带学生搜索/自动聚焦/时长预览的版本。
3. ~~`reasonScores` 不持久化~~ **已修复于 v2.6.1**：纳入 state 初始化、loadData/saveData 及云同步（并集合并）。
4. ~~`closeMoreDrawer` 定义两次~~ **已修复于 v2.6.1**。

### P1（需决策 / 常规修复）
5. **硬编码 GitHub Token —— 代码侧已修复于 v2.6.1**：源码回退段已删除，改为纯 localStorage 配置（保存前 API 验证 + 未配置提醒）。**遗留的线下动作**：① 旧 token 已确认仍有效（验证过 api.github.com/user 返回 cheeeom），且永久留在 git 历史中，**必须到 GitHub → Settings → Developer settings → Personal access tokens 吊销**；② 生成 fine-grained token（仅本仓库 + Contents: Read and write）并在各设备设置页重新配置。建议顺序：先在各设备配好新 token → 再部署新代码 → 最后吊销旧 token，同步不断线。
6. ~~手动/自动推送白名单不一致~~ **已修复于 v2.6.1**（统一为 `CLOUD_SYNC_FIELDS`）。
7. ~~版本卫生~~ **已完成于 v2.6.1**：CACHE_NAME → v2.6.1；README 全面更新；`avatar-img.txt`/`schedule-img.txt` 已确认无代码引用，可删（未删，留待确认无其他用途）。

### P2（一致性/体验）
8. **`escapeHtml` 覆盖不全（2026-09-01 复核确认仍在）**：全文 `innerHTML` 90 处、`escapeHtml(` 仅 20 处。后期模块（档案 5311/工作留痕 5428/荣誉 5560/通知 6956）已规范转义，**早期模块仍未转义**，实测未转义点包括：`3664/3665`（统计卡最高最低分姓名，含 `title="${maxStu.name}"` 属性注入）、`3672`（Top5 姓名）、`3880`（学生表格姓名）、`4133/4307`（`<option>` 里的姓名）、`5265/5300`（档案列表姓名）、`6788`（todo 文本）。数据虽为自用录入，但姓名会流入 `title`/`onclick` 等属性上下文，建议统一转义。
9. **`dutyDays` 含周日不含周六（确认仍在）**：`const dutyDays = ['周一','周二','周三','周四','周五','周日']`（4413）。疑似寄宿制周末排班场景，**改动前先确认业务**。
10. 学生档案的 `profile` 随 students 同步（无独立问题），但档案里的成长记录删除无确认弹窗。
11. **CSS 注释版本号不精确（我查出来的小瑕疵）**：`/* 墨线图标系统（v2.7.1） */`（1655）实际是 v2.7.0 提交（`9bdb4bdb`）的一部分，代码里并不存在 v2.7.1。界面版本号 v2.7.0（1707 / 1809）与 `sw.js` 的 `CACHE_NAME = 'class-manager-v2.7.0'` 三处是一致的，**只有这条注释超前**，下次动这块顺手改掉即可，不影响功能。

### 已确认修复（2026-09-01 复核）
- ✅ 无任何重复函数定义：全文 231 个 `function`，用 `grep -o "^\s*function \w*" | sort | uniq -d` 检测为空。v2.6.1 报的 `openLeaveModal` / `closeMoreDrawer` 重复定义均已消除（现分别唯一位于 3309 / 6271）。
- ✅ 云同步字段齐全：`CLOUD_SYNC_FIELDS`（2649）已含 workLogs/honors/notices/reasonScores。
- ✅ 源码内无硬编码 Token：仅 `gh_sync_token` 存于 localStorage，`configGHToken()`（3051）保存前走 API 验证。

## 9. 风格与约定

### 9.5 设计系统「纸墨·新中式」（v2.7.0 起生效，改动 UI 必读）

**设计语言**：宣纸暖白底 + 浓墨文字 + 朱砂红主色 + 五彩颜料辅助色（胭脂/琥珀/青花蓝/石绿/青莲）。标题用宋体族（`--font-display`：Noto Serif SC → 思源宋体 → STZhongsong → SimSun），正文用现代黑体栈（`--font-body`：MiSans → HarmonyOS Sans SC → PingFang SC → Microsoft YaHei）。**零网络字体依赖**，全部系统字体栈。

**核心令牌**（定义于 `:root` / `html.dark`，改色只动这里）：

| 令牌 | 亮色 | 暗色（玄墨） | 用途 |
|---|---|---|---|
| `--primary` | `#A63A2B` 朱砂 | `#CE6B52` | 主色：激活态/高亮/主按钮 |
| `--bg` / `--card-bg` | `#F6F2E9` / `#FFFDF7` | `#191613` / `#23201A` | 宣纸底 / 纸白卡 |
| `--text` / `--text-secondary` / `--text-muted` | `#2B2B33` / `#5C574F` / `#8C8577` | `#EAE4D6` / `#B3AA98` / `#7E776A` | 浓墨/次墨/淡墨 |
| `--border` | `#E6DECD` 纸纹线 | `#3A352C` | 边框 |
| `--success` / `--warning` / `--danger` | `#2F7D5B` / `#C08A2D` / `#B42318` | 同族提亮 | 石绿/琥珀/胭脂 |
| `--gold` / `--silver` / `--bronze` | `#C9A227` / `#9BA0A3` / `#A97142` | 提亮版 | 奖牌金银铜 |

**图表固定色板**（Canvas 内硬编码，改主题需同步）：五彩系列 `#A63A2B`(朱砂) `#3B6E8F`(青花) `#B97C24`(赭金) `#2F7D5B`(石绿) `#6B5B95`(青莲) `#8C6242`(赭石)，各配浅色渐变搭档；坐标轴文字 `#A0988C`；饼图中心文字需按 `document.documentElement.classList.contains('dark')` 切换墨/纸色。

**签名元素**：登录页 = 玄墨左板（窗棂线性纹 + 印章 logo + 竖排「厚德博学 · 敬业爱生」+ 旋转「印」字落款）+ 宣纸右板；密码点为旋转 45° 的菱形；`.section-title .dot` 为旋转小方块（印章点）；body::before 为暖色纤维网格纸纹（静态，无动画）。

**图标系统（墨线 SVG，v2.7.0 起）**：结构性位置的图标全部使用内联 SVG symbol 库（`<body>` 开头的隐藏 `<svg>` defs，id 前缀 `i-`，如 `i-dash/i-students/i-profile/i-badge/i-note/i-seat/i-duty/i-leave/i-grades/i-todo/i-horn/i-pen/i-honor/i-trend/i-gear/i-more/i-refresh/i-export/i-import/i-trash/i-clip/i-pin/i-search`），用法 `<svg class="ic"><use href="#i-xxx"/></svg>`，描边 1.7 / round cap，`stroke:currentColor` 自动随主题变色。尺寸：默认 18px，`ic-sm` 15px（表格操作/顶栏），导航 19px、tabbar 21px。**新增图标时在 defs 里加 symbol 即可，不要引入图标字体或外部图片**（破坏零依赖/离线）。emoji 仅保留在：说明性空状态插画、带文字的按钮前缀（如「📋 批量操作」）。

**注意**：JS Canvas 内的颜色不认 CSS 变量，改令牌时必须同步改 JS 里的硬编码色值（搜 `#A63A2B` 等可定位全部图表色）；CSS 里不应再出现旧青色系（#00B4D8 等）或硬编码浅色背景——暗色模式依赖令牌翻转（曾因 .sidebar 硬编码浅色渐变导致暗色侧栏不变暗的 bug）。

**移动端适配（v2.7.0 整改）**：① 历史遗留的结构 bug 已修——480px 媒体块曾未闭合，把通知模块全局样式、`.fade-in` 动画和一份重复的 768px 块全部吞进作用域（通知页选项卡在桌面端曾因此无样式）；现结构为 480 块独立闭合、通知模块全局生效。② **登录页移动端规则集中在基础登录样式之后的独立媒体块**（搜「登录页移动端」）——历史上它们写在基础样式之前，同权重被后者层叠覆盖成死规则（印章 ::after 关不掉、卡片宽度失效都源于此）；新增登录移动端规则请放到该块。③ 小屏隐藏 `.login-vertical` 与 `.login-left::after`；底部栏/抽屉/顶栏玻璃底色用暖纸色（rgba(255,253,247,*)/var(--card-bg)）。

- 中文 UI、中文注释；emoji 广泛用作图标。
- 渲染模式：每页一个 `renderXxx()`，直接 innerHTML 模板字符串；onclick 内联绑定全局函数。
- 图表全部手写 Canvas（含 `roundRect`、DPR 适配、resize 重绘），无图表库。
- 无障碍：v2.4.1 做过 WCAG AA 达标（对比度、aria-label、44px 触摸目标），改 UI 时保持。
- 移动端断点：768px（tabbar）/ 480px；底部 5 tab = 首页/学生/待办/学分/设置，其余进“更多”抽屉（`more-drawer`，注意它和 PWA 安装提示互斥）。

## 10. 接手陷阱（2026-09-01 亲测，踩过的坑别再踩）

### 10.1 🪤 不要用 zip / raw 拿代码，会被 CDN 缓存骗

**实测**：`https://codeload.github.com/cheeeom/class-manager/zip/refs/heads/main` 下载到的 `index.html` 与 `data.json` **都不是 main HEAD 的内容**：

| 来源 | index.html md5 | data.json 学生数 | data.json lastExport |
|---|---|---|---|
| codeload zip（**过期缓存**） | `5c3d5983…` | **0** | 2026-08-31T15:12 |
| `git clone`（**真实**） | `77fba1b4…` | **56** | 2026-09-01T16:02 |

zip 给的是 8/31 15:12 的快照，**正好卡在 5.6 节那次数据被清空的时刻**——我第一次差点据此判定「56 名学生全丢了」，虚惊一场。`raw.githubusercontent.com` 加 `?t=` / `Cache-Control: no-cache` 也不保证生效。

**结论：一律用 `git clone`（或已 clone 的本地仓库）作为唯一事实来源。**

### 10.2 代理配置

**⚠️ 代理端口每个会话都会变，这是本项目最常踩的坑。** 记录：`53325`（2026-09-01 会话）→ `59808`（2026-09-02 会话）。写死在 `.git/config` 里的端口过一天就废，表现为 `Failed to connect to github.com:443 over proxy 127.0.0.1 after Nms`。

**正确做法：每次开工先读环境变量，别用上次记的端口。**

```bash
env | grep -i proxy          # 拿到本次会话的 http_proxy
git config --local http.proxy  "$http_proxy"
git config --local https.proxy "$https_proxy"
```

只写**本仓库** config，不要动全局（会影响其他项目）。`deploy.sh` 里写死的 `http://192.168.1.13:9890` 是更早的旧代理，需要时一并更新。

**代理会选择性抽风（2026-09-02 亲测）**：同一时间 `api.github.com` 通、`github.com` 返回 `CONNECT tunnel failed, response 502`，而其他 `*.github.com` 子域（codeload / raw / objects）全通。因为 `git push` 走的是 `github.com`，就会一直失败，看起来像"网络坏了"，其实只挂了这一个域名。

```bash
# 逐域名探活，快速定位是代理整体挂了还是只挂了 github.com
for h in github.com api.github.com codeload.github.com raw.githubusercontent.com; do
  printf "%-32s " "$h"
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 "https://$h/"
done
```

**应对**：是间歇性的（实测 6 次里能通 1 次），所以**重试是有用的**，别一失败就换方案：

```bash
for i in $(seq 1 25); do
  timeout 60 git push origin main && break
  echo "第 $i 次失败，重试…"; sleep 3
done
```

**兜底 —— `gh` CLI + Git Data API（2026-09-02 实测可用）**：`gh` 已安装且已认证（`gh auth status` → cheeeom，`repo` 权限），走 `api.github.com`，完全不受 `github.com` 被墙影响。脚本已写好：

```bash
cd D:/a/chee777/class-manager
git add -A                                   # 修行尾时用 git add --renormalize .
node ../scripts/cm-push-via-api.js "提交信息"
```

原理：`gh api` 拿远端 HEAD → 从**本地 git 索引**里逐个文件建 blob → 建 tree → 建 commit → PATCH ref。脚本会打印每个文件的字节数并核对「上传后的 blob sha 是否等于本地 blob sha」，不一致会标 ⚠️。

**⚠️ 用这个脚本必须遵守两条，否则会出事（我 2026-09-02 全踩了一遍）：**

1. **blob 必须按 Buffer 读，绝不能按 UTF-8 字符串读。** `execFileSync(..., {encoding:'utf8'})` 会把 PNG/ICO 的无效字节替换成 `U+FFFD`，体积膨胀约 1.8 倍，图标直接损坏（线上 PWA 图标和 favicon 当场全废，靠追加一个修复提交救回）。正确写法是省略 `encoding` 让 Node 返回 Buffer。

2. **内容要取自 git 对象库（`git cat-file blob <index-sha>`），不是工作区文件。** 本机 `core.autocrlf=true`，工作区是 CRLF 而仓库历史是 LF。直接读工作区上传会把 CRLF 写进仓库，导致后续每次提交在 commit 对比时显示为整文件改动。git 索引里的 blob 已经是 LF 归一化后的，取它才对。

**另外两个连带坑：**

- 写完脚本后本地 HEAD 与远端会分叉（远端可能已被 auto-sync 推进）。同步姿势：`git fetch`（同样要重试）→ `git reset --hard <远端sha>`。**不要用 `git reset --hard origin/main`**，因为 `origin/main` 这个 ref 在本仓库里更新不生效（`.git/refs/remotes/origin/` 目录是空的，只有 `packed-refs` 里那一份），reset 会直接把你改好的工作区打回旧版本。用显式 sha。
- shell 里 `git fetch ... | tail -2 && echo ok` 判断不了成败——`$?` 拿的是 `tail` 的退出码。要么别接管道，要么用 `PIPESTATUS[0]`。

### 10.3 data.json 是活数据，别在本地改完就 push

`data.json` 每隔几秒就被线上设备自动推送覆盖。本地对它的任何修改都会被冲掉，且会污染提交历史。要改数据请在应用界面里改，让它自己走 auto-sync。

### 10.4 真实数据现状速查（2026-09-01 16:02 快照）

- 班级名 `高一班级`，**56 名学生**（样例：`{"id":2,"sid":"2026001","name":"【学生】","gender":"女","credit":100,"tags":["6栋-803室"],"parentPhone":"13800000000"}`）
- `reasons` 9 条默认原因；`notices.templates` 12 条内置模板
- `operations` / `workLogs` / `honors` / `leaves` / `exams` 均为 **0 条**（学分流水为 0 需向使用者确认，见 5.6）
- `seating` 8×5，`scheduleImage` 为 null，`classAvatar` 有值（13015 字符 base64）
- 含**真实家长手机号**，属敏感个人信息——调试时不要外传、不要贴到公开场合

### 10.5 有用的排查命令

```bash
# 定位代码：搜小节注释（行号会漂，注释不会）
grep -n "^/\* =\{10,\}" index.html

# 查某个提交时刻的云端数据
curl -sS "https://api.github.com/repos/cheeeom/class-manager/contents/data.json?ref=<sha>" \
  | python -c "import json,sys,base64;d=json.loads(base64.b64decode(json.load(sys.stdin)['content']));print(len(d['students']))"

# 查重复函数定义（本项目的老毛病）
grep -o "^\s*function [a-zA-Z_$][a-zA-Z0-9_$]*" index.html | sed 's/.*function //' | sort | uniq -d
```

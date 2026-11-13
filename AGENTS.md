# AGENTS.md — 班主任工作台 开发笔记

> 🔒 **本机路径已脱敏**：文中凡本机目录 / 用户名一律写成〈…〉占位符（真实路径只记在本机工作区的工具记忆里，不随仓库发布）。
> 面向后续开发者（人类或 AI 助手）的**项目认知**类文档：项目是什么、数据长什么样、哪些机制不能碰。
>
> ## 📌 具体怎么动手，看 `skills/`
>
> | 技能 | 什么时候加载 |
> |---|---|
> | `skills/run-regression/` | 要跑回归、测试报红或报 `[crash]` |
> | `skills/bump-version/` | 改完 `index.html` 要跟版、或要确认当前版本 |
> | `skills/push-github/` | 要推送到线上、要验收、要删远端文件 |
> | `skills/release-checklist/` | 一次完整发版，从"发不发版"的决策走到线上验收 |
>
> ## ⚠️ 本文不写死会过期的数字
>
> 行号、函数数、页面数、文件字节数**一律不记**（记了必然过期）。真值这样取：
>
> ```bash
> grep -o "class-manager-v[0-9.]*" sw.js | head -1   # 当前版本（唯一真相源）
> ls _*test*.js | wc -l                              # 测试文件数
> grep -n "^/\* =\{10,\}" index.html                  # 全部小节注释（定位代码靠这个，不靠行号）
> grep -o "^\s*function [a-zA-Z_$][a-zA-Z0-9_$]*" index.html | sed 's/.*function //' | sort | uniq -d
> ```

---

## 1. 项目定位

- 面向班主任的班级管理 Web 应用（班级管理 · 学分统计 · 班委协作）。
- 线上：https://cheeeom.github.io/class-manager/ （GitHub Pages，`main` 分支根目录即站点）
- **技术形态：纯单文件应用。** 零框架、零构建、零 npm 依赖。整个应用 = 一个 `index.html`（CSS → HTML → JS → 尾部移动端 DOM）。双击即可运行；`file://` 下除云同步外全部可用（fetch 本地文件会失败，属预期）。
- 登录：6 位数字密码，SHA-256 加盐，**纯 JS 手写实现**（兼容 `file://` 下无 Web Crypto）。
- PWA：`manifest.json` + `sw.js`，可安装、可离线。
- 子应用：`portal/`（学生查询端，见第 11 节）、`desktop/`。

## 2. 文件清单

| 文件 | 作用 | 备注 |
|---|---|---|
| `index.html` | 全部应用代码（CSS+HTML+JS） | 唯一需要日常改动的文件 |
| `sw.js` | Service Worker | 导航网络优先、静态资源缓存优先；发版需 bump `CACHE_NAME` |
| `manifest.json` | PWA 配置 | |
| `icon_192/256/512.png`, `favicon.*` | 图标 | |
| `portal/index.html` | **学生查询端** | 独立只读页。**改它必须同步 `index.html` 的加密常量**，见第 11 节 |
| `SPEC_学生查询端.md` | 学生查询端规格 | 威胁模型、字段白名单、决策依据 |
| `skills/` | 操作手册（本仓库约定） | 见本节顶部表格 |
| `PROGRESS.md` | 逐版进度与遗留 | **只认文末各版章节**；开头几节是旧期化石 |

⚠️ **`data.json` 已不在本仓库**（2026-09-26 删除）。数据现存放于私有仓 `cheeeom/class-manager-data`，见 5.1。

## 3. index.html 模块地图

**定位代码只认小节注释**（`/* ======== XXX ======== */`），用下面的命令拿全量，行号会漂、注释不会：

```bash
grep -n "^/\* =\{10,\}" index.html
```

大致分区顺序：CSS（Reset → 暗夜 → 布局 → 各模块 → 响应式 → 登录页 → 纸墨细节 → 墨线图标）→ HTML 骨架（SVG symbol 图标库 / 登录页 / 侧边栏 + 各 page / 各功能 Modal / 学生详情侧滑）→ JS → 尾部移动端 Tab 栏（**注意：这部分在 `</script>` 之后，DOM 仍可被前面 JS 查询到**）。

JS 主要小节（按出现顺序，不记行号）：PWA 注册 · Data Layer（`STORE_KEY`/`state`/`loadData`/`saveData`）· **Git Cloud Sync**（`smartMergeData`/`autoSyncFromCloud`/`autoPushToCloud`/`doPushToCloud`）· Sample Data · Navigation · More Drawer · Toast/Ripple/CountUp · 头像与课程表（`compressImage`）· Dashboard（Canvas 分布图）· Students/Add/Import/Detail · Committee/Seating/Duty · Credits/批量/图表 · Settings/DarkMode/Profile/WorkLogs/Honors · Export/Import/Clear · SyncStatus · 登录与 SHA-256 · **Init**（登录拦截 → `loadData` → `renderAll` → `autoSyncFromCloud`）· PWA 安装提示 · 考试/待办预览 · 学生搜索/请假 · 成绩/待办 · 饮水机值日 · 通知模块。

页面（page id）：`dashboard` `students` `profiles` `committee` `seating` `duty` `attendance` `grades` `todo` `worklogs` `notices` `credits` `honors` `analytics` `settings` `dorm` `bank` `publicity`。移动端底部 5 tab = 首页/学生/待办/学分/设置，其余进「更多」抽屉。

## 4. 数据模型

### state（内存单例）→ localStorage `classManagerData`

- `className`
- `students[]`：`{id, sid, sidAt?, name, credit, tags[], profile?{gender,birth,guardian,phone,address,notes,timeline[]}}`
- `operations[]`：学分流水 `{id, studentId, studentName, amount, reason, time, coin?, revoked?}`
- `reasons[]`、`reasonScores`
- `committee{...}`（存学生 id；职位可自定义）
- `seating{cols, rows, seats[], closed?}` —— `closed` 是「关闭座位」的墓碑标记，**塞在 seating 内部而非新开 state 字段**（少一条会忘的同步链路）
- `duty{currentWeek, schedule[], waterDuty[], waterUsedIds[], waterRound}`
- `leaves[]`：`status: pending/extended/returned`，含 `history`
- `exams[]`：`scores` 以学生 id 为 key
- `todos[]`：`priority: normal/important/urgent`，`pinned`
- `workLogs[]`、`honors[]`
- `notices{templates[], history[], draft, updatedAt}`
- `nextXxxId` 各类计数器、`creditBase`（学分币派生基）
- `scheduleImage` / `classAvatar`（base64）、`classMotto`

### 其他浏览器存储

- localStorage：`classManagerData`、`classManagerLoginPwd`、`classManagerAdminPwd`、`gh_sync_token`、`cm_theme`、`pwa_dismissed`、`pwa_ios_dismissed`
- sessionStorage：`classManagerUnlocked`（登录态，关标签页失效）

## 5. 云同步机制（接手必读）

> 📌 **当前口径（2026-09-26 起）：数据在私有仓 `cheeeom/class-manager-data`**（见 `GH_REPO` 常量）。
> ⇒ 私有仓匿名访问一律 404，**拉取与推送都必须带 Token**。
> ⇒ 站点仓里的 `./data.json` 已于 2026-09-26 删除，现返回 404。
> ⚠️ **不变的结论**：**站点仓（Pages 那个）仍然是公开的**（免费版 Pages 只能用公开仓），所以「凡是落在站点仓里的东西都必须先脱敏 / 加密」依然成立。
> 加密已从「唯一根本解」降级为**第二道锁**：Token 泄露或仓库被误设公开时，没有口令依然打不开。

### 5.1 推送与拉取

- **推送**：任何写操作 → `saveData()` → `autoPushToCloud()`（2 秒防抖）→ 私有仓 Contents API：GET 取 sha → 闸门 → 与云端合并 → 加密 → PUT。
- **拉取**：页面加载 + `visibilitychange` → `autoSyncFromCloud()` → 读私有仓 contents → 解密 → `smartMergeData()` 合并。
- **推送白名单**：共享常量 `CLOUD_SYNC_FIELDS`（auto/manual 共用）。`notices` 推送前经 `stripNoticeHistoryImages()` 剥离历史图片 base64（单张近 1MB，防拉取超时）——历史图片仅留在生成它的设备本地。
- **Token**：仅存各设备 localStorage `gh_sync_token`，源码不内置。`configGHToken()` 保存前先 GET 验证（200 才存）。未配置时 `autoPushToCloud()` 静默跳过（每会话 toast 提醒一次）。
- **图片体积防线**：上传即压缩（头像 400px/0.7、课程表 800px/0.7 JPEG）；启动时课程表 base64 > 400KB 自动再压；渲染用 Blob URL。

### 5.2 合并规则（`smartMergeData`）

| 数据 | 规则 |
|---|---|
| students / leaves | 按 id 合并，`updatedAt` 新者胜；**学号另有独立版本戳 `sidAt`**（防被云合并回退） |
| operations / exams / workLogs / honors | 按 id 去重并集 |
| todos | 按 id，已完成优先 |
| notices | 整个对象按 `updatedAt` 取新 |
| reasonScores | 键并集，冲突时云端优先 |
| committee / seating / duty | 比较 `exportedOpsCount`，大者整体胜出 |
| nextId 系列 | 取最大值 |
| 图片 | 偏好更小版本，防旧超大图把数据撑爆 |

### 5.3 加密信封与关键函数

搜索注释 `云同步加密（v2.8.0）` 可定位整块代码。

```json
{ "enc":1, "alg":"PBKDF2-SHA256(250000)/AES-GCM-256",
  "salt":"<base64>", "iv":"<base64>", "data":"<base64 密文>", "updatedAt":"ISO" }
```

salt / iv 明文存放是标准做法，安全性 100% 取决于口令强度。**口令必须独立于 6 位登录密码**（6 位数字仅 10⁶ 组合，加密了也扛不住暴力破解）。

| 函数 | 作用 |
|---|---|
| `encryptForCloud` / `decryptFromCloud` | 明文 ↔ 信封；无口令时原样返回明文（向后兼容） |
| `configSyncPwd` | 交互式配置口令（≥8 位、二次确认、可留空关闭） |
| `checkPushSafety(remoteJson)` | **推送闸门**，返回 `{ok, msg, resync, remote}` |
| `doPushToCloud(message)` | **统一推送实现**（auto/manual 共用） |
| `applyCloudData` / `buildCloudPayload` | 统一落地 / 构造推送负载 |

### 5.4 三条不能破的约束

1. **全站只有一处 PUT**。`doPushToCloud` 是唯一写远端的入口，任何新增推送需求都必须走它，否则会绕过加密把明文推上去。改完用 `grep -n "method: *'PUT'" index.html` 确认仍然只有 1 处。
2. **推送前必须与云端合并**（`smartMergeData`）。直接覆盖会顶掉另一台设备的新增内容。
3. **不要让空数据覆盖云端**。`checkPushSafety` 闸门 + `syncInProgress` 同步锁 + `_pushPending` 延迟补推，三者合起来防的就是「新设备清缓存后用空 state 把云端推成 0」。历史上真实发生过（学生数 68→0→54→0→56 反复抖动），别拆这三个东西。

### 5.5 学分币的不可逆约定（v2.20.4 起，不要退回）

改错了会直接伤到学生的账。

- **奖励资格线**：写死 `CB_REWARD_MIN = 100`、不可调。一切奖励权益以**学生当前总分 `credit`** 为唯一口径；<100 时三处收紧：月度结算净增不参与定档、加分发币按 5 折（`CB_COIN_DISCOUNT = 0.5`）、兑换商店不开放。
- **发币系数「写流水那一刻定死」**：`applyCreditDelta` 写 `op` 时按**加分后总分**算出 `op.coin`。币只随撤销/恢复增减 —— **日后跌破 100 不追回、回升也不追补**。若改成「实时按当前总分算」，学生掉线时会**瞬间清零已有币**，已兑换账面还会变负。
- **历史加分回溯打折**（v2.20.5 推翻了「不追溯」）：`cbRecomputeOpCoins` 按 **`creditBase + Σ(本人流水中 time ≤ 本笔 time 的 amount)`** 还原「加分当时的总分」，逐笔重写 `op.coin`。
  ⚠️ **不要改成「按当前总分逐笔重算」** —— 会追回学生已有的币。
  细节：按 `time` 升序（同刻按 `id` 升序）重放；`revoked` 跳过；`amount <= 0`（扣分）**直接跳过**（否则 toast 笔数灌水）；缺 `creditBase` → 返回 0 绝不瞎猜；幂等。
- **0.5 币是刻意不取整的**：+1 分打 5 折就是 0.5 币，四舍五入会让最常见的 +1 变成「压根没打折」。

## 6. 开发工作流

**完整发版流程见 `skills/release-checklist/`**（含"这次发不发版"的硬门槛、版本号落点分类、回归、推送验收）。

只留三条最容易违反的：

1. 改 `index.html` 的功能代码 ≈ 必须发版（SW 缓存会让老用户拿旧代码）。
2. 纯文档改动**不要**碰版本号。
3. 提交信息惯例 `vX.Y.Z: 中文描述`。

## 7. 版本演进

**不在这里维护。** 逐版内容看 `PROGRESS.md` 文末各版章节，或 `git log --oneline`。

## 8. 已知问题（只列仍然成立的）

### 需要线下动作（代码侧已处理）

- **旧 GitHub Token 仍未吊销**：旧 token 永久留在 git 历史中，**唯一确定能消除风险的动作是到 GitHub → Settings → Developer settings → 吊销它**，不受历史是否已清除影响。顺序：各设备先配好新 fine-grained token（仅本仓库 + Contents: R/W）→ 部署新代码 → 最后吊销旧 token，同步不断线。

### 需要决策

- **`dutyDays` 含周日不含周六**：`['周一','周二','周三','周四','周五','周日']`。疑似寄宿制周末排班场景，**改动前先确认业务**。
- **学生档案成长记录删除无确认弹窗**。
- **手机窄屏（≤520px）学分原因菜单**：切大类时居中弹窗会重排 24~30px，理论上存在「下一击点错」风险。已不再闪（hover 被 `@media(hover:none)` 拦死），要根治需「窄屏改顶部锚定」或「给 `.qc-items` 定高」，两者都有可见代价。

### 技术债

- **`escapeHtml` 覆盖不全**：早期模块仍有未转义点（统计卡姓名、Top5、学生表格、`<option>` 姓名、档案列表、todo 文本）。姓名会流入 `title`/`onclick` 等**属性上下文**，建议统一转义。自查时对比 `grep -c "innerHTML" index.html` 与 `grep -c "escapeHtml(" index.html` 的数量差。

### 已解决，别再翻旧账

云同步字段缺口 / `openLeaveModal` 重复定义 / `reasonScores` 不持久化 / `closeMoreDrawer` 重复 / 硬编码 Token（代码侧）/ 空本地覆盖云端竞态（v2.8.0）/ 明文 data.json 泄露（加密 + 历史重写 + 转私有仓三重止血）。

## 9. 风格与约定

### 9.5 设计系统「纸墨·新中式」（改动 UI 必读）

**设计语言**：宣纸暖白底 + 浓墨文字 + 朱砂红主色 + 五彩颜料辅助色（胭脂/琥珀/青花蓝/石绿/青莲）。标题用宋体族（`--font-display`），正文用现代黑体栈（`--font-body`）。**零网络字体依赖**，全部系统字体栈。

**核心令牌**（定义于 `:root` / `html.dark`，改色只动这里）：

| 令牌 | 亮色 | 暗色（玄墨） | 用途 |
|---|---|---|---|
| `--primary` | `#A63A2B` 朱砂 | `#CE6B52` | 主色：激活态/高亮/主按钮 |
| `--bg` / `--card-bg` | `#F6F2E9` / `#FFFDF7` | `#191613` / `#23201A` | 宣纸底 / 纸白卡 |
| `--text` / `--text-secondary` / `--text-muted` | `#2B2B33` / `#5C574F` / `#8C8577` | `#EAE4D6` / `#B3AA98` / `#7E776A` | 浓墨/次墨/淡墨 |
| `--border` | `#E6DECD` 纸纹线 | `#3A352C` | 边框 |
| `--success` / `--warning` / `--danger` | `#2F7D5B` / `#C08A2D` / `#B42318` | 同族提亮 | 石绿/琥珀/胭脂 |
| `--gold` / `--silver` / `--bronze` | `#C9A227` / `#9BA0A3` / `#A97142` | 提亮版 | 奖牌金银铜 |

### 9.6 触摸端铁律

**`innerHTML` 重画 + `:hover` 改样式 ⇒ 触摸端必闪。** 机制：Blink 在 DOM 变更后会重算 hover，把「手指停点下**新插入**的那颗元素」直接判成 `:hover` → 松手 hover 被清 → 看到「边框加深闪一下」。

修法：

- `@media(hover:none){ …回落基线… }` 守卫，**必须写在 `.active` / `.selected` 之前**（同特异度靠源序，否则触摸端选中项会被夺走高亮）。
- 补 `-webkit-tap-highlight-color: transparent`（默认 `rgba(0,0,0,0.18)` 半透明黑，按下也会瞬态变深）。
- **凡「跟随指尖的中间态」（悬停预览/高亮/提示）在触屏上都不做**，连 CSS 伪类一起封。

验收手法：真实鼠标移动做 A/B —— 触屏媒体下移到元素上，`matches(':hover')` 为 `true` 但样式仍是基线（证明是守卫拦住的，不是没触发）；桌面媒体下同样移动，样式照常变（证明电脑端没改坏）。
⚠️ **CDP `CSS.forcePseudoState` 在本机 Chromium 上不生效**，别指望它。

## 10. 接手陷阱

### 10.1 🪤 不要用 zip / raw 拿代码，会被 CDN 缓存骗

`codeload.github.com/…/zip/refs/heads/main` 给的是**过期快照**（实测拿到的 `index.html` 与数据都不是 HEAD 内容，正好卡在某次数据被清空的时刻）。`raw.githubusercontent.com` 加 `?t=` / `Cache-Control: no-cache` 也不保证生效。

**结论：一律用 `git clone`（或已 clone 的本地仓库）作为唯一事实来源。**

### 10.2 代理：每次开工先读环境变量

**代理端口每个会话都会变**，写死在 `.git/config` 里的端口过一天就废（表现为 `Failed to connect to github.com:443 over proxy`）。

```bash
env | grep -i proxy
git config --local http.proxy  "$http_proxy"    # 只写本仓库，别动全局
git config --local https.proxy "$https_proxy"
```

**代理会选择性抽风**：`api.github.com` 通、`github.com` 返回 502，其他 `*.github.com` 子域全通。`git push` 走 `github.com` 就会一直失败，看着像网络坏了。

```bash
for h in github.com api.github.com codeload.github.com raw.githubusercontent.com; do
  printf "%-32s " "$h"
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 "https://$h/"
done
```

**应对**：间歇性故障（实测 6 次里通 1 次），**重试有效**，别一失败就换方案。推送走 `gh api`（`api.github.com`）则完全绕开这个问题 —— 见 `skills/push-github/`。

**推二进制的通用坑**：API 推文件必须按 Buffer 读，绝不能按 UTF-8 字符串读（`encoding:'utf8'` 会把 PNG/ICO 的无效字节替换成 `U+FFFD`，体积膨胀约 1.8 倍，图标直接损坏，PWA 图标当场全废）。

**shell 判断成败的坑**：`cmd | tail -2 && echo ok` 判断不了成败 —— `$?` 拿的是 `tail` 的退出码。要么别接管道，要么用 `PIPESTATUS[0]`。

### 10.3 数据是活数据，别在本地改完就推

数据每隔几秒就被线上设备自动推送覆盖。本地对它的任何修改都会被冲掉且污染提交历史。改数据请在应用界面里改，让它自己走 auto-sync。

### 10.4 敏感数据纪律

库里含**真实家长手机号、住址、生日**。调试时不要外传、不要贴到公开场合、不要写进任何会推到公开仓库的文件。站点仓是公开的，落进去就等于公开。

## 11. 学生查询端（接手必读）

> 完整规格与决策记录见 `SPEC_学生查询端.md`（威胁模型、字段白名单、测试清单）。这里只留最容易踩的。

学生打开 `…/portal/?o=<owner>&g=<gistId>`，输入**学号 + 自己的 8 位码**，看到**只属于自己**的学分、等级、本周/本月净变化、学分币与流水明细。数据来自**公开 Gist** 里一份**全密文**发布包 —— 老师点「🔑 学生查询端 → 发布」生成。

### 🔴 三条铁律（破一条就是事故）

1. **绝不复用同步口令**（`getSyncPwd` / `encryptForCloud`）。那个口令能解开全班家长手机号、住址、生日。学生端走的是「每人一个 8 位码 + 每人独立盐」的另一条派生路径。`_v370_test.js` ⑨ 会断言这整块代码里不出现 `getSyncPwd()`。
2. **两端加密参数必须同步**。`index.html` 的 `PBKDF2_ROUNDS` / `PORTAL_CODE_LEN` / `normalizePortalCode` 与 `portal/index.html` 的 `PBKDF2_ROUNDS` / `CODE_LEN` / `normCode` 必须逐字等价。改了一边忘了另一边 → **全班当场解不开**，而且**只有真实发布后才暴露**（本地测试全绿也发现不了）。
3. **公开发布包只能含密文**。发布前检查 Gist 里没有任何明文字段。

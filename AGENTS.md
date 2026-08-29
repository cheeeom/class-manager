# AGENTS.md — 班主任工作台 开发笔记

> 面向后续开发者（人类或 AI 助手）的项目全景认知与接手指南。
> 行号以 **v2.6.0（commit `9a5f341`）** 为准，代码变动后会漂移；定位代码时优先搜小节注释（形如 `/* ==================== XXX ==================== */`）。
>
> **更新记录：2026-08-29 v2.6.1** —— 修复云同步字段缺口（workLogs/honors/notices/reasonScores 上云）、smartMergeData 嵌套 bug、请假弹窗重复定义、closeMoreDrawer 重复、reasonScores 持久化；**移除源码内置 GitHub Token**（改为纯 localStorage 配置 + 保存前 API 验证 + 未配置提醒）；sw.js CACHE_NAME → v2.6.1；README 全面更新（详见第 8 节）。

---

## 1. 项目定位

- **班主任工作台 v2.6.0**：面向班主任的班级管理 Web 应用（班级管理 · 学分统计 · 班委协作）。
- 线上地址：https://cheeeom.github.io/class-manager/ （GitHub Pages，`main` 分支根目录即站点）。
- **技术形态：纯单文件应用。** 零框架、零构建、零 npm 依赖。整个应用 = 一个 `index.html`（约 7505 行 / 350KB：CSS + HTML + JS）。双击即可运行，file:// 协议下除云同步外全部可用（fetch 本地文件会失败，属预期）。
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
行 1~1672     CSS（Reset→暗夜模式→布局→各模块样式→响应式 768/480px→登录页）
行 1673~2611  HTML 骨架
              ├─ 登录页 loginOverlay（数字键盘）
              ├─ .app：侧边栏(16 个 nav-item) + topbar + 各 page（id="page-xxx"）
              ├─ 各功能 Modal（加学生/请假/考试/待办/批量学分/通知编辑器/通知生成/学生选择）
              ├─ 学生详情侧滑面板 sidePanel
行 7369~7505  移动端 Tab 栏（5 tab + 更多抽屉）+ 档案/留痕/荣誉等后加的 Modal
              （注意：这部分在 </script> 之后，DOM 仍可被前面 JS 查询到）
行 2612~7368  JS（脚本主体在 2612 开始，7368 结束）
```

JS 各模块（按小节注释定位）：

| 小节 | 起点(约) | 内容 |
|---|---|---|
| PWA | 2612 | SW 注册 |
| Data Layer | 2619 | `STORE_KEY`、GH 常量、`state` 定义、`loadData/saveData` |
| Git Cloud Sync | 2767 | `smartMergeData`、`autoSyncFromCloud`、`autoPushToCloud`、`pushToCloud/pullFromCloud/restoreFromCloud` |
| Navigation / More Drawer | 3169 | `navigateTo()` 按 page 分发渲染 |
| 班级头像&口号 / 课程表图片 | 3288 | 图片压缩 `compressImage`、Blob URL 渲染、Ctrl+V 粘贴 |
| Dashboard / Students | 3567 | 统计卡、Top5、Canvas 分布图、学生表格、详情面板、标签 |
| Committee / Seating / Duty | 4039 | 班委任命、座次（3 策略）、值日排班（教室/公共区各 4 人，含周日） |
| Credits / Batch / Analytics | 4469 | 学分操作+撤销、批量加减、纯 Canvas 图表（range/pie/trend）、成绩分析 |
| Dark Mode / Profiles / WorkLogs / Honors | 5139 | v2.6.0 四模块；`ensureProfile` 惰性建档案 |
| Export/Import/Clear | 5634 | JSON 导出/导入（导入前自动备份下载）/清空 |
| 登录&密码 | 5798 | sha256、`hashPwd`、默认哈希、键盘输入支持 |
| Init | 5984 | 登录拦截、`loadData`、自动云同步、resize 重绘图表 |
| PWA 安装提示 | 6046 | beforeinstallprompt + iOS Safari 提示 |
| 仪表盘考试/待办预览 | 6100 | |
| 请假管理 | 6204/6322 | ⚠️ `openLeaveModal` 定义了两次（见已知问题 #2） |
| 成绩管理 / 待办 | 6468/6644 | CSV 模板/导入/导出；todo 置顶排序 |
| 饮水机值日 | 6761 | 3 人/轮，`waterUsedIds` 轮转 |
| 通知模块 | 6833~7365 | 12 内置模板、变量 `{xxx}` 提取/填充、草稿自动保存、Canvas 生成图片、历史记录 |

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

## 6. 开发工作流（每次发版 checklist）

1. 改 `index.html`。
2. **版本号两处**：登录页 `<div class="login-version">`（约 1685 行）+ 侧边栏 `<div class="sidebar-footer">`（约 1787 行）。
3. 动了 SW 或想强制刷新缓存 → bump `sw.js` 的 `CACHE_NAME`。
4. commit → push main（需代理，见 deploy.sh）→ Pages 自动部署。
5. **永远不要手动编辑 `data.json`**（它是活数据，会被下一次 auto-sync 覆盖）。
6. 本地调试：直接双击 index.html；要测云同步则起本地 HTTP 服务。
7. 提交信息惯例：`vX.Y.Z: 中文描述`；数据提交只有 auto-sync，不掺入手动改动。

## 7. 版本演进

| 版本 | 日期 | 内容 |
|---|---|---|
| v2.0.0 | 2026-08-08 | 移动端响应式 + Git 云同步 + GitHub Pages 部署（详见 upgrade_v2.0.0 md） |
| v2.3.9~12 | 2026-08-13 | PWA 基础、图片压缩、首屏性能（100s→2-8s）、移动端空白修复 |
| v2.4.0/2.4.1 | 2026-08-15 | 底部 Tab 栏重设计（5 tab + 更多抽屉）、WCAG AA 对比度、SW 语法修复 |
| v2.5.0 | — | 通知模块（模板库/变量填充/图片生成/历史） |
| v2.6.0 | — | 暗夜模式、学生档案、工作留痕、荣誉墙 |

tags：`v2.5.0`、`v2.6.0`。v2.6.0 之后全部为 auto-sync 数据提交。

## 8. 已知问题清单（按优先级）

### P0（真实数据/功能缺陷，改动小）
1. ~~云同步字段缺口~~ **已修复于 v2.6.1**：推送白名单统一为 `CLOUD_SYNC_FIELDS`，workLogs/honors/notices/reasonScores 及其 ID 计数器均可上云；顺带修掉了 honors/workLogs/notices 合并逻辑被错误嵌套在 exams 分支内的问题（远端数据缺 exams 字段时这些模块会被跳过合并）。
2. ~~`openLeaveModal` 重复定义~~ **已修复于 v2.6.1**：删除了后定义的旧下拉版，保留带学生搜索/自动聚焦/时长预览的版本。
3. ~~`reasonScores` 不持久化~~ **已修复于 v2.6.1**：纳入 state 初始化、loadData/saveData 及云同步（并集合并）。
4. ~~`closeMoreDrawer` 定义两次~~ **已修复于 v2.6.1**。

### P1（需决策 / 常规修复）
5. **硬编码 GitHub Token —— 代码侧已修复于 v2.6.1**：源码回退段已删除，改为纯 localStorage 配置（保存前 API 验证 + 未配置提醒）。**遗留的线下动作**：① 旧 token 已确认仍有效（验证过 api.github.com/user 返回 cheeeom），且永久留在 git 历史中，**必须到 GitHub → Settings → Developer settings → Personal access tokens 吊销**；② 生成 fine-grained token（仅本仓库 + Contents: Read and write）并在各设备设置页重新配置。建议顺序：先在各设备配好新 token → 再部署新代码 → 最后吊销旧 token，同步不断线。
6. ~~手动/自动推送白名单不一致~~ **已修复于 v2.6.1**（统一为 `CLOUD_SYNC_FIELDS`）。
7. ~~版本卫生~~ **已完成于 v2.6.1**：CACHE_NAME → v2.6.1；README 全面更新；`avatar-img.txt`/`schedule-img.txt` 已确认无代码引用，可删（未删，留待确认无其他用途）。

### P2（一致性/体验）
8. 部分 innerHTML 渲染未走 `escapeHtml`（如学生表格姓名、todo 文本），数据虽自录入、风险低，建议统一。
9. `dutyDays` 含周日不含周六（寄宿制场景？改动前先确认业务）。
10. 学生档案的 `profile` 随 students 同步（无独立问题），但档案里的成长记录删除无确认弹窗。

## 9. 风格与约定

- 中文 UI、中文注释；emoji 广泛用作图标。
- 渲染模式：每页一个 `renderXxx()`，直接 innerHTML 模板字符串；onclick 内联绑定全局函数。
- 图表全部手写 Canvas（含 `roundRect`、DPR 适配、resize 重绘），无图表库。
- 无障碍：v2.4.1 做过 WCAG AA 达标（对比度、aria-label、44px 触摸目标），改 UI 时保持。
- 移动端断点：768px（tabbar）/ 480px；底部 5 tab = 首页/学生/待办/学分/设置，其余进“更多”抽屉（`more-drawer`，注意它和 PWA 安装提示互斥）。

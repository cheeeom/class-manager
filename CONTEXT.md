# CONTEXT.md — 项目当前快照

> **接续开发必读入口。** 本文件是「压缩版上下文」，让任何 AI 工具（WorkBuddy / Claude Code / Cursor / Windsurf / Copilot）
> 在拿到仓库的 30 秒内建立全貌，不用从 38KB 的 AGENTS.md 里翻。
> 细节查 `AGENTS.md`（架构与约定），逐版本历史查 `PROGRESS.md`（含每次会话记录与踩坑）。
>
> 最后更新：2026-09-06（v2.15.0 开发中）

---

## 一、项目是什么

**班主任工作台** —— 给幼儿园/中小学班主任用的单页应用，纯前端、零框架、零构建。

- **唯一功能改动文件：`index.html`**（约 45 万字符，内含全部 HTML/CSS/JS）
- 唯一例外：`sw.js` 只改 `CACHE_NAME = 'class-manager-v2.x.x'`
- 线上：GitHub Pages，仓库 `cheeeom/class-manager`（**public**）
- 无 npm、无打包、无框架。改完直接推，刷新即生效

## 二、版本与仓库状态

- 当前 `v2.15.0`（学分一致性修复 + 学分公示模块，开发中）
- 上一稳定版 `v2.14.0`（commit `4d72d6c`）
  > ⚠️ 历史摘要里出现过的 `730f8067` **不是有效 commit**（amend 前的临时 sha），别再引用。
- 版本号必须**三处同步**，漏一处就会出现"页面显示新版本但缓存是旧的"：
  1. `index.html` 登录页版本号
  2. `index.html` 侧栏版本号
  3. `sw.js` 的 `CACHE_NAME`
- 验证方式：**逐位置 grep**，不要只看 `grep -c`

## 三、推送方式（重要）

云端 `data.json` 是 **AES-GCM-256 密文**（v2.8.0 起），离线不可解。
**禁止整仓 force push / 整目录覆盖**，否则会连带把云端真实数据冲掉。

```bash
export GH_TOKEN=$(cat /d/a/chee777/scripts/_gh_token.txt | tr -d '\r\n')
cd /d/a/chee777/class-manager
node D:/a/chee777/scripts/cm-push-incremental.js "提交信息" index.html sw.js PROGRESS.md
```

- 脚本做**增量推送**，保住云端 `data.json`
- ⚠️ Windows 下 `node` 参数必须用 `D:/...` 正斜杠形式，用 `D:\...` 会被转义吃掉

## 四、测试

九套回归，**共 156 项**（改动后必须全跑，全绿才能推）：

| 文件 | 项数 | 覆盖 |
|---|---|---|
| `_v290_test.js` | 25 | v2.9.0 班委/合并 |
| `_v2100_test.js` | 19 | 值日轮次制/罚扫 |
| `_v2110_test.js` | 21 | 名单同步/同名配对 |
| `_v2113_test.js` | 13 | wipeAt 重置全链路 |
| `_v2120_test.js` | 11 | 学分原因目录 |
| `_v2130_test.js` | 11 | 班委模式白名单 |
| `_v2140_test.js` | 16 | 批量学分/劳动整改 |
| `_sync_test.js` | 26 | 同步与合并 |
| `_xss_test.js` | 14 | XSS 防护 |

```bash
cd /d/a/chee777/class-manager
for f in _v290 _v2100 _v2110 _v2113 _v2120 _v2130 _v2140 _sync _xss; do node ${f}_test.js; done
```

**做法**：用正则从 `index.html` 抽取真实函数源码，`eval` 后跑断言 —— 测的是线上代码，不是复制品。

**三个反复踩的坑**：
1. `eval` 解析对象字面量必须加括号：`eval('(' + src + ')')`
2. `eq` 断言**不能传数组**（引用比较必失败），要传基本类型
3. 版本号验证要逐位置 grep，不能只数出现次数

## 五、关键架构记忆

### 1. 学分双写模型（v2.15.0 重构）
- `student.credit` 是**快照**，`state.operations[]` 是**流水**
- 真理来源是流水：`credit = student.creditBase + Σ(该学生所有 operations.amount)`
- `creditBase` 为迁移期反推的基线（老学生初始分不全是 100，不能直接按 100 重算）
- **所有学分写入必须走统一入口**，禁止裸写 `student.credit += x`

### 2. smartMerge 并集合并
- 推送前、拉取后都做并集合并
- `students` 按 id 合并、取 `updatedAt` 新的；**学生对象原本没有 updatedAt → 永远取本地**（这是 v2.14.0 及之前学分不一致的根因，v2.15.0 已修）
- `operations` 按 id **去重并集**，永不裁剪（唯一清空途径是 `clearData`）
- 本地空 + 云端有人 → 拦截并从云端恢复（防误清）

### 3. wipeAt 重置戳
- 应用内清空/直接删云端文件都**无效**：空本地保护 + 并集合并会让数据复活
- 唯一正解：`state.wipeAt = Date.now()`，`checkPushSafety` / `applyCloudData` 双端拦截
- `wipeInProgress` 锁屏蔽 wipe 期间的常规推拉，防竞态

### 4. 班委模式
- `sessionStorage.cm_role` + `window.__cmRole`
- **白名单制**：仅 首页/学分/值日/座次/待办/荣誉 6 页
- 三重拦截：`navigateTo` 入口 + 导航裁剪 + `exportData/importData/openAddStudentModal` 函数级
- 推送**保留**（禁推会让班委加的学分本地蒸发）

### 5. 「皮肤」模式（重要模式，沿用）
- v2.12.0 原因选择器、v2.14.0 批量多选：原 `<select>` **保留为隐藏数据载体**（`display:none`），新 UI 只是可视皮肤
- 好处：`quickCredit` / `confirmBatchCredit` / `undo` 等既有逻辑**零改动**

### 6. escapeAttr 白名单
- 白名单 `[a-zA-Z0-9_-一-龥 ]`，**不含 emoji**
- `➕ 加分` 会被剥成 ` 加分` → **目录键必须纯中文**，emoji 只进显示文本

## 六、版本演进（近两日）

| 版本 | 内容 |
|---|---|
| v2.11.0-2 | 学生列表排序（默认学号↑/点学分切）+ 名单同步（按姓名合并保留学分标签，修 115 人重复导入事故） |
| v2.11.3 | 彻底重置：wipeAt 全链路，连云端一起清，其他设备自动对齐 |
| v2.12.0 | 学分原因多级选择器（加分/扣分/其他 → 大类 → 原因，26 项制度原因，点选带分值） |
| v2.13.0 | 班委免密入口，白名单 6 页，档案/成绩/设置/导入导出全屏蔽 |
| v2.14.0 | 学分批量多选；罚扫→劳动整改（教室/公共区/搬水，默认 7/7/1 天）；初始学分统一 100；关闭键美化 |
| v2.15.0 | 学分一致性修复（统一入口 + 基线自愈 + 全视图刷新）；学分公示模块 |

## 七、待办

- [ ] 老板验收 v2.14.0（批量学分 / 劳动整改 / 关闭键）
- [ ] GitHub 工单（清 force push 后旧 sha 缓存视图）回复后，验证旧 sha 返回 404
- [ ] v2.15.0 学分公示模块开发

## 八、备份

- `D:\a\chee777\backups\data.json.bak-20260905-154027` —— 清空前密文备份，可回滚
- 仓库外（不进 public 仓库）：`D:\a\chee777\名单同步_26幼2_59人.txt`（59 人含两名同名）

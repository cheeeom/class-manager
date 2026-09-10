# class-manager 全量代码审查报告

- 审查对象：`index.html`（单文件 SPA，唯一功能文件）
- 版本：v2.18.2
- 审查时间：2026-09-10
- 规模：**12,976 行 / 688,397 字节**（CSS 1,880 行 · HTML 1,440 行 · JS ≈9,500 行）
- 函数总数：**542** 个

> 本报告为只读审查产物，未改动任何功能代码。`index.html` 保持 444 只读冻结。

> **📌 修复状态（2026-09-10 追加，v2.18.3）**：本报告列出的 **4 个 P0 缺陷已全部修复并随 v2.18.3 发版**——
> P0-1 处分记录云同步（三链路补齐）✅ / P0-2 `saveData` 写入失败不再静默 ✅ /
> P0-3 唯一 XSS 漏网点补 `escapeHtml` ✅ / P0-4 工作留痕搜索框补齐（跨日期检索）✅。
> 另新增「重置云端加密口令」功能。**P1 风险与 P2 累赘（8 死函数 / 38 死 CSS / 重复块）仍未处理**，
> 下文对应条目保留原样作为后续优化清单。

---

## 一、总体结论

代码质量**高于同类单文件项目**。几个值得肯定的地方：

| 项 | 实测 | 评价 |
|---|---|---|
| HTML 转义覆盖 | `escapeHtml` 177 处 / `escapeAttr` 35 处，175+ 处规范 | ✅ 纪律好 |
| 内联事件处理器 | 引用不存在的函数 **0 处** | ✅ 干净 |
| 撤销机制 | `state='revoked'` 标记 + `liveOps` 统一过滤，无物理删除 | ✅ 设计正确 |
| 币派生 | Σ有效流水派生，不落钱包字段 | ✅ 免疫漂移 |
| 云合并 | `operations` 按 `stateTime` 大者胜 | ✅ 设计正确 |
| `eval` / `new Function` / `debugger` | 0 处 | ✅ 无高危执行 |
| 幂等守卫 | `showPwaInstallTip` / `cbScanAlerts` 等均有 | ✅ 有意识 |

但存在 **4 个真实缺陷**、**3 类潜在风险**、以及**成规模的冗余**。

---

## 二、P0 — 真实缺陷（建议尽快修）

### 2.1 处分记录完全不参与云同步 ⚠️ 最严重

`punishments` / `nextPunishId` 两个字段**只走过 5 条数据链路中的 2 条**：

| 链路 | 位置 | 状态 |
|---|---|---|
| ① `state` 默认值 | 4003–4044 | ❌ **缺失** |
| ② `loadData()` 恢复 | 5393–5394 | ✅ 有 |
| ③ `saveData()` 写本地 | 5461 | ✅ 有 |
| ④ `CLOUD_SYNC_FIELDS` | 3353–3357 | ❌ **缺失** |
| ⑤ `smartMergeData()` 合并 | 5504+ | ❌ **缺失** |

**后果**：
- `buildCloudPayload()`（3603）按 `CLOUD_SYNC_FIELDS` 过滤 → 处分记录**从未上传到云端 `data.json`**
- `smartMergeData()` 从 `localData` 克隆起步、逐字段合并，无 `punishments` 分支 → **云端处分记录永远不会合并进来**
- 手动导出的 JSON 备份**包含**处分记录（`exportData` 直接导 localStorage 原文，10410）

**触发场景**：换手机 / 换电脑 / 清浏览器缓存后，用云同步恢复数据 → **所有处分记录消失**，而本地备份文件里其实有。

**修复**：三处补齐（`state` 默认值加 `punishments: [], nextPunishId: 1`；`CLOUD_SYNC_FIELDS` 加两个字段名；`smartMergeData` 加按 `id` 合并分支）。

---

### 2.2 `saveData()` 无异常保护，配额爆掉会中断保存链

`index.html:5439`

```js
function saveData(){
  cbScanAlerts();
  cbExpireCoupons();
  localStorage.setItem(STORE_KEY, JSON.stringify({ ... }));   // ← 无 try/catch
  autoPushToCloud();
}
```

数据里含 **base64 班级头像 + 课表图片 + 通知历史内嵌图**，`localStorage` 5MB 配额是真实可达的。
一旦 `setItem` 抛 `QuotaExceededError`：

1. 异常向上冒泡，**`autoPushToCloud()` 不会执行** → 云端停留在旧数据
2. 外层若在事件处理器中，后续渲染逻辑被跳过 → 界面状态与内存 `state` 不一致
3. 用户看到"操作成功"但实际没落盘

**修复**：`try/catch` 包住 `setItem`，失败时 `showToast('本地存储已满，请先导出并清理历史数据', 'error')`，并仍然执行云推送。

---

### 2.3 XSS 漏网点：`op.reason` 未转义

`index.html:6965`，位于 `openDetailPanel()`（6927）的学生详情面板：

```js
<div class="tl-text">${sign}${op.amount} 学分
  <span style="color:var(--text-muted)">— ${op.reason}</span></div>
```

`op.reason` 是教师在加减分弹窗里**自由输入的文本**，会被持久化并在此处裸插进 `innerHTML`。

**对比证据**：同文件 8633 行渲染同样的字段时写的是 `escapeHtml(op.reason)` —— **不一致即漏洞**。
全库 45 个文本字段插值点中，**这是唯一一处 innerHTML 上下文未转义**（其余 28 处已转义，17 处非 HTML 上下文）。

**后果**：教师在原因里输入 `<img src=x onerror=alert(1)>` 即触发存储型 XSS。单机应用危害有限（自己坑自己），但若录入了含 `<` 的正常文本（如"作业 <60 分"）会**破坏详情面板 DOM 结构**，导致面板渲染残缺 —— 这个更常见。

**修复**：改为 `${escapeHtml(op.reason)}`。

---

### 2.4 工作记录搜索是死代码（功能残缺）

`index.html:9577`，`renderWorkLogs()` 内：

```js
const kw = (document.getElementById('wlSearch')?.value||'').toLowerCase();
let list = state.workLogs.filter(w=>{
  ...
  if(kw && !(w.title||'').toLowerCase().includes(kw) && ...) return false;
```

但工作记录页（2544+）只有 `wlDate` / `wlCats` / `wlStats` / `wlList`，**全文没有任何 `id="wlSearch"` 元素**。

**后果**：`kw` 恒为 `''`，关键词过滤**永远不生效**。等于写了一套搜索逻辑但没有搜索框——要么是搜索框从未落地，要么是重构时被删掉了。

**修复二选一**：① 补上搜索输入框（推荐，功能更完整）；② 删掉 `kw` 相关 4 行死逻辑。

---

## 三、P1 — 潜在风险（建议排期）

### 3.1 `punishments` / `nextPunishId` 依赖加载时序

二者不在 `state` 默认对象里（4003–4044），靠 `loadData()` 在 10928 行启动时赋值兜底。
目前能跑通是**依赖调用顺序**：任何早于 `loadData()` 的 `state.punishments.unshift(...)`（7737）都会 `TypeError`。

**修复**：加进 `state` 默认对象即可消除隐患（与 2.1 同一处修改）。

### 3.2 6 处原生 `prompt()` 与整体 UI 风格割裂

| 行 | 场景 | 评价 |
|---|---|---|
| 3434 / 3455 / 5737 | 加密口令、GitHub Token | ✅ 合理（敏感输入，原生控件反而合适） |
| **6111** | 修改班级口号 | ❌ 该用模态框 |
| **10126 / 10138 / 10151 / 10163** | 原因目录新增方向/大类、重命名 | ❌ 4 处原生弹窗 |
| **11353** | 请假续假日期 | ❌ 该用日期选择器 |

原生 `prompt` 无法校验、移动端体验差、无法取消区分（`null` vs 空串）。
项目已有成套模态框体系，这 6 处是明显的"没走完"。

### 3.3 相等比较混用

`== null` / `!= null` 共 71 处 + 双等号 25 处。
其中 `x == null` 是**有意**覆盖 `undefined` 的惯用法（应保留），但长文件中混用双等号容易在后续维护时埋坑。建议至少对**非 null 判断**统一为 `===`。

---

## 四、P2 — 累赘代码（可安全清理）

### 4.1 零引用死函数（8 个）

**全库零引用，可安全删除（6 个）**：

| 函数 | 定义行 |
|---|---|
| `revertCreditOp` | 3926 |
| `cbCreditOf` | 4316 |
| `autoDuty` | 7653 |
| `clearDuty` | 7655 |
| `renderCreditStudentSelect` | 8377 |
| `onCreditInputSearch` | 8405 |

**仅被测试引用，删除需同步改测试（2 个）**：
- `cbStoreSidPick`（4794）← `_v2179_test.js`
- `dutySlotsPerWeek`（7392）← `_v2100_test.js`

> `autoDuty` / `clearDuty` 是值日排班被 v2.10.0 轮次制重构后的**残留壳**，只剩一行转发或空体。
> `revertCreditOp` 是撤销机制重构为 `state='revoked'` 后遗留的旧路径。

### 4.2 死 CSS 类（38 个）

```text
credit-table, data-table, data-table-container, detail-panel, dragover,
fade-in, grade-bar, hidden-tab, hl-2, hl-3, hl-4, hl-5, lv-dark, lv-orange,
lv-red, lv-yellow, motto-quote, profile-info, pub-boards, punish-student-row,
pwa-banner, search-input, search-row, status-extended, status-pending,
status-returned, student-card, student-grid, table-striped, tag-close,
tag-list, tag-negative, tag-positive, tl-contact, tl-critic, tl-other,
tl-praise, tl-talk
```

其中 `lv-*`（4 个）是 v2.18.0 学分五档徽章重构后被 `cbCreditBadge` 取代的旧等级样式；
`tl-*`（5 个）是时间线分类标签的遗留。**建议整体删除**，预计省 ~4–6KB。

### 4.3 仅定义、无任何引用的 id（30 个）

`page-committee`、`page-dorm`、`page-seating`、`page-duty`、`page-credits`、`page-attendance`、
`page-grades`、`page-todo`、`page-profiles`、`page-worklogs`、`page-honors`、`page-notices`、
`page-settings`、`dutyEmptyHint`、`dutyWaterCard`、`waterDutyBtn`、`leaveStats`、`todoStats`、
`noticeUnfilled`、`dormMemberAddWrap`、`cbLedgerTypeSel`、`cbBankBody`、`tagDisplay`、
`mobileTabbar`、`moreGrid`、`settingsAbout`、`settingsReleaseNotes`、`themeSystemBtn`、
`themeLightBtn`、`themeDarkBtn`

**说明**：
- `themeSystemBtn/LightBtn/DarkBtn` → 由 `applyTheme` **动态构造 id** 查询（`'theme'+M+'Btn'`，9262），**不是死代码**
- `page-*` → 页面切换走 class，id 属纯装饰
- `settingsAbout` / `settingsReleaseNotes` → 静态展示区块，无需 JS 引用

**结论**：这 30 个**不构成缺陷**，属"可留可删"的洁癖项。优先级最低。

### 4.4 重复代码块（32 处 3 行块）— 最值得重构的部分

| 重复内容 | 出现位置 | 次数 |
|---|---|---|
| **学生搜索下拉组件** | `filterPunishStudents`(7685) / `filterCreditStudents`(8295,8312) / `filterLeaveStudents`(11240) / 通知选人 | **4–5 份近似复制** |
| 撤销流水行渲染 | `renderOpItem`(8603) / `revoked`(8630) | 2 份 |
| 图表 canvas DPR 样板 | `drawDistChart`(6377) / `drawRangeChart`(8997) / `drawPieChart`(9089) / `drawTrendChart`(9179) | **4 份** |
| worklog 月度导出 | `copyMonthLogs`(9659) / `exportMonthLogs`(9674) | 2 份 |
| 课表图上传处理 | `triggerSchedulePaste`(6259) / `deleteScheduleImage`(6294) | 2 份 |
| `p()` 补零助手 | `cbFmtTime`(5059) / `formatOpTime`(8598) | 2 份 |

**最突出的两处**：

1. **学生搜索下拉**：`dd.innerHTML='无匹配学生'` + `mousedown preventDefault` + `mouseenter/mouseleave` 高亮这一整套，在 4 处几乎逐字复制。抽成 `studentSearchDropdown(anchorEl, onPick)` 可**一次消除约 200 行重复**，且后续修 bug 只需改一处。
2. **图表 DPR 样板**：`const dpr = window.devicePixelRatio || 1;` + `const rect = canvas.getBoundingClientRect();` + 尺寸设定，4 个绘图函数各写一遍。抽 `setupCanvas(canvas)` 即可。

### 4.5 `duty` 默认对象三处硬编码

同一份含 12 个键的值日对象字面量，写在 **3 个地方**：

- `state` 默认值（4022–4023）
- `loadData()` 回退（5389）
- `clearData()` 重置（10521）

**风险**：v2.10.0 轮次制引入 `queue/cursorId/round/servedIds/roundLedger/lastGenWeek/waterCursorId` 时，必须三处同步改；漏一处就会出现"重置后字段丢失"的隐蔽 bug。

**修复**：提取 `function defaultDuty(){ return { ... } }`，三处调用同一工厂。

### 4.6 `console.log` 21 处无开关

多为 `[Sync]` 前缀的同步诊断日志（3508/3546/3567/3583/3599/5675/5698…）。单机调试有用，但生产环境污染控制台、且**云推送日志会打印明文/密文状态**（3546 `'(PLAINTEXT!)'`）。

**建议**：加 `const DEBUG = location.search.includes('debug')` 开关，或统一走 `function dbg(){}`。

---

## 五、优化方向（架构层面）

### 5.1 消灭"漏加字段"这类 bug 的根因 ⭐ 最高价值

本次最严重的缺陷（2.1）本质是**数据链路分散在 5 个地方手工同步**：

```
state 默认值 → loadData → saveData 白名单 → CLOUD_SYNC_FIELDS → smartMergeData
```

每加一个字段要改 5 处，漏一处就是静默数据丢失。**这是结构性隐患，不是偶发失误**。

**建议方案**：引入单一 `SCHEMA` 描述表驱动五处：

```js
const STATE_SCHEMA = {
  students:    { def: () => [],     merge: 'byId' },
  punishments: { def: () => [],     merge: 'byId' },   // ← 一处声明，五处自动生效
  creditBank:  { def: () => ({...}), merge: 'bank' },
  sortDir:     { def: () => 'desc',  persist: false }, // ← 显式标注不持久化
  ...
};
```

- `saveData` 遍历 schema 生成对象（而非手写 35 行）
- `CLOUD_SYNC_FIELDS = Object.keys(schema).filter(k => schema[k].sync !== false)`
- `smartMergeData` 按 `merge` 策略分发

**收益**：新增字段从"改 5 处 + 跑 29 套测试赌没漏"降为"改 1 处"，从根上杜绝此类 bug。
**代价**：一次性重构，需重跑全部回归套件。属于**值得做的中期投入**。

### 5.2 转义全覆盖：把漏洞变成不可能

目前靠"记得写 `escapeHtml`"。177 处写对了、1 处忘了。**纪律靠不住，机制才靠得住**。

**建议**：引入标签模板函数，让默认行为即安全：

```js
const html = (strings, ...vals) =>
  strings.reduce((a, s, i) => a + s + (i < vals.length ? escapeHtml(vals[i]) : ''), '');
// 用法：html`<div>${op.reason}</div>`  ← 自动转义，忘记才需要显式 opt-out
```

渐进迁移：新代码一律用 `html\`\``，旧代码触及时顺手改。

### 5.3 渲染性能（当前影响小，可暂缓）

141 处 `innerHTML` 赋值，绝大多数是"整块重建"。当前规模（每班 40–50 人）下帧率无感。

**未来若出现卡顿**，优先增量化这三处：
- 学生表（`renderTable`）— 全表重建
- 学分时间线（`renderCreditsTimeline`）— 已有 `LIMIT 50` 截断，风险低
- 公示看板（`renderPubBoards`）— 6 个榜全量重算

### 5.4 事件监听：已核实无泄漏

初查 `addEventListener` 28 处 / `removeEventListener` 0 处，疑似泄漏。**逐一核实后确认全部为一次性注册**：

- 顶层 `document`/`window` 监听（ripple 6005、通知草稿 11954/11967/11982）→ 注册一次
- `showPwaInstallTip`（11023）有 `if(getElementById('pwaTip')) return;` 幂等守卫 → 不会重复
- 列表项监听（6508/7697/8313）绑在**每次重建的新元素**上 → 随元素销毁

✅ **无需处理**。

---

## 六、修复优先级建议

| 优先级 | 项 | 工作量 | 影响 |
|---|---|---|---|
| **P0-1** | 处分记录补 3 处链路（2.1 + 3.1） | 小 | 数据丢失 |
| **P0-2** | `escapeHtml(op.reason)`（2.3） | 1 行 | XSS / DOM 破坏 |
| **P0-3** | `saveData` 加 try/catch（2.2） | 小 | 保存链中断 |
| **P0-4** | 工作记录搜索：补框 或 删死码（2.4） | 小 | 功能残缺 |
| **P1** | 6 处 `prompt` 换模态框 | 中 | 体验 |
| **P2-1** | 删 6 个死函数 + 38 个死 CSS 类 | 小 | 体积/可读性 |
| **P2-2** | 抽学生搜索下拉组件（消 ~200 行重复） | 中 | 可维护性 |
| **P2-3** | `duty` 默认值提取工厂 | 小 | 防漏字段 |
| **P3** | SCHEMA 表驱动重构（5.1） | 大 | 根治结构性隐患 |
| **P3** | `html\`\`` 标签模板（5.2） | 中 | 根治 XSS |

---

## 七、附：本次审查所用检测方法

均基于 `index.html` 静态分析（node 脚本），未运行期注入：

1. 函数清单 + 重复定义 + 零引用检测（542 个函数）
2. DOM id 契约核对（375 个 id × 262 个查询点）
3. 内联事件处理器存在性校验（严格版过滤成员调用后 **0 缺陷**）
4. CSS 类使用率检测（HTML/JS 双向比对）
5. 文本字段 HTML 转义覆盖审计（45 个插值点）
6. `JSON.parse` try 覆盖检查（23 处）
7. `addEventListener` 作用域归属分析（缩进 + 宿主函数回溯）
8. `state.*.sort()` 原地变异检测（确认为展开复制，安全）
9. `state` 字段五链路一致性比对（40 × 35 × 34）
10. 重复代码行/3 行块检测（207 类重复行 / 32 处重复块）

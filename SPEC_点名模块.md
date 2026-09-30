# 随机点名模块 · 设计方案

> 目标版本 **v2.21.0**｜基线 **v2.20.11**（`index.html` 15,636 行 / 854,142 字节 LF）
> 状态：**设计评审中，尚未改动任何代码**
> 设计语言：沿用「纸墨·新中式」（`AGENTS.md` §9.5），不引入任何新框架、构建步骤、网络字体或图标字体。

---

## 一、需求原文拆解

| # | 老板原话 | 落地定义 |
|---|---|---|
| 1 | 随机抽人功能 | 从**候选池**中无放回随机抽取 |
| 2 | 可选择抽人人数 | 1 / 2 / 3 / 5 人，或自定义 1–10 |
| 3 | 所有姓名卡片上绿色边框特效不停滚动 | 滚动期内，绿色描边在候选池卡片间**快速跳动**，逐级减速 |
| 4 | 抽中的姓名卡片变成黄色边框着重显示 | 定格后换黄描边 + 外圈光晕 + 轻微放大 + 弹跳 |
| 5 | 已抽过的不再重复抽取 | 抽中即移出候选池 |
| 6 | 直至一轮抽完点击重置 | 候选池空 → 按钮变「本轮已抽完 · 重置」 |
| 7 | 卡片展示所有人的姓名 | 响应式卡片墙，一屏放下全班 |
| 8 | 点击姓名卡片则变为灰色 | 手动切换「已点到」 |
| 9 | 自动统计未点到人数和名单 | 顶部指标 + 名单 chips |
| 10 | 姓名卡片自动标记当天请假 | 读 `state.leaves` 自动判定 |
| 11 | 右上角绿色圆圈里面写着假字 | 石绿实心圆 + 白字「假」，直径 22px |
| 12 | 美术风格统一 | 全部走现有设计令牌，零硬编码色值 |

---

## 二、页面归属（待拍板 A）

| 方案 | 做法 | 优点 | 代价 |
|---|---|---|---|
| **A1 独立新页（推荐）** | 侧栏新增「课堂点名」，`data-page="rollcall"` | 点名常被投影/大屏展示，独立页最干净；不动权限链路 | 侧栏多一项 |
| A2 并入请假页做双 tab | `page-attendance` 升级为「考勤」，tab1 点名 / tab2 请假 | 语义上同属考勤 | 请假页是纯列表页，加 tab 要重构；点名需要全屏空间，挤 |
| A3 首页弹层 | 不占侧栏，首页按钮唤出 | 无侵入 | 大屏展示体验差，且要与首页卡片抢空间 |

**推荐 A1**。理由：点名是**高频 + 需要仪式感 + 需要整屏**的动作；A2 会让两个本就独立的功能互相牵制。

无论选哪个，**`COMMITTEE_PAGES` 都不加 `rollcall`**（一期仅教师可用，见 §十、）。

---

## 三、美术风格统一（本设计的核心）

「纸墨·新中式」的调性是**宣纸暖白底 + 浓墨文字 + 朱砂红主色 + 矿物颜料辅助色**。老板要的「绿色」与「黄色」，在这个体系里**不能直接用纯色**，必须落到已有的矿物颜料令牌上。

### 3.1 颜色映射表

| 用途 | 令牌 | 亮色值 | 暗色值 | 为什么是它 |
|---|---|---|---|---|
| 滚动高亮边框 | `var(--success)` | `#2F7D5B` **石绿** | 同值 | 中国画矿物颜料「石绿」，项目已在 `chipPop` / `stat-trend.up` 用过，是体系内的绿 |
| 中签边框 | `var(--warning)` | `#C08A2D` **琥珀** | 同值 | 赭黄系矿物颜料。**刻意不用 `#FFD700`**——纯度太高的金黄与宣纸暖白底打架，且暗色主题下刺眼 |
| 中签外圈光晕 | `rgba(192,138,45,.32)` | — | — | 琥珀的 32% 透明版，模拟"墨韵外扩" |
| 滚动外圈光晕 | `rgba(47,125,91,.20)` | — | — | 石绿的 20% 透明版 |
| 假徽章底 | `var(--success)` | `#2F7D5B` | 同值 | 老板指定绿色圆圈 |
| 假徽章字 | `#FFFFFF` | — | — | 实心圆上用纯白，对比度拉满 |
| 卡片默认底 | `var(--card-bg)` | `#FFFDF7` | `#23201A` | 与全站卡片一致 |
| 卡片默认边 | `var(--border)` | `#E6DECD` | `#3A352C` | 纸纹线 |
| 卡片默认字 | `var(--text)` | `#2B2B33` | `#EAE4D6` | 浓墨 |
| 已点到底 | `var(--bg-secondary)` | `#EFE9DC` | `#26221B` | 退到纸背 |
| 已点到字 | `var(--text-muted)` | `#8C8577` | `#7E776A` | 淡墨 |
| 面板分隔 | `var(--border)` | `#E6DECD` | — | |
| 圆角（卡片） | `var(--radius-sm)` | `8px` | — | 小圆角，卡片密排不显肿 |
| 圆角（面板 / 中签卡） | `var(--radius-sm)` / `10px` | — | — | 中签卡放大后用 10px 更协调 |
| 过渡 | `var(--transition)` | `.3s cubic-bezier(.4,0,.2,1)` | — | 同族曲线 |
| 弹跳（中签） | `cubic-bezier(.34,1.56,.64,1)` | — | — | **项目既有**曲线，与 `.nav-icon` / `chipPop` 同源 |
| 标题字 | `var(--font-display)` | 宋体族 | — | 页面主标题「课堂点名」 |
| 正文字 | `var(--font-body)` | 黑体栈 | — | 姓名、按钮、标签 |

> ⚠️ **新代码里一个十六进制色值都不写**，全部 `var(...)`。这样明暗两套主题自动跟随，不需要额外适配。
> （反面教材：现有 `page-attendance` 的 `style="color:#2F7D5B"` 是历史遗留，本次**不跟着学**。）

### 3.2 关于「绿」与「绿」撞色

老板要的两处绿色：**滚动边框**（绿）与 **假徽章**（绿）。它们几乎不会同时出现——请假学生**不进候选池**，滚动边框永远不会停在请假卡上。即便如此，两者仍用**形态**做二次区分：

- 滚动边框 = **空心描边**（2px 线 + 外圈淡晕）
- 假徽章 = **实心圆**（22px 实心 + 白字）

一空一实、一整体一边角，一眼可辨。

### 3.3 新增墨线图标

现有 27 个 `i-*` symbol，缺「点名」。新增 **`i-roll`**：一个「抽签筒 + 探出的签」墨线符号，1.7 描边、round cap，与既有一致。

用法：`<svg class="ic"><use href="#i-roll"/></svg>`（侧栏 19px、移动端抽屉 24px）。

---

## 四、卡片墙布局

```
grid-template-columns: repeat(auto-fill, minmax(Wpx, 1fr));
gap: 10px;
```

| 断点 | 最小宽 `W` | 姓名字号 | 预期列数（30 人） |
|---|---|---|---|
| ≥1200px | 104px | 14px | 8–9 列 |
| 768–1200px | 96px | 14px | 6–8 列 |
| <768px | 78px | 13px | 4–5 列 |

- 卡片高 **60px**（≥44px 触摸目标 ✓），中签时放大到 `scale(1.08)` 视觉约 65px
- ⚠️ **姓名不可被省略号吃掉**：`minmax` 下限 78px 是按三字姓名 + 14px 字号反推的，**不要为了塞更多列而调小**
- 姓名过长（复姓/四字）时 `text-overflow:ellipsis` 兜底，但 `title` 属性给全名
- 卡片墙容器 `max-height` 配合 `overflow-y:auto`，人多时内部滚动，不把工具栏顶出屏幕

---

## 五、卡片状态机

### 5.1 五态定义

| 状态 | 类名 | 视觉 | 进入方式 |
|---|---|---|---|
| 待点到 | （无） | 默认底 + 纸纹边 + 浓墨字 | 初始 |
| **已点到** | `.rc-done` | 纸背底 + 淡墨字 + `opacity:.6` | 点击卡片 / 被抽中后自动 |
| **滚动中** | `.rc-roll` | 石绿 2px 描边 + 20% 淡晕 + `scale(1.06)` | 动效循环期间 |
| **中签** | `.rc-pick` | 琥珀 2.5px 描边 + 32% 光晕 + `scale(1.08)` + 弹跳 | 动效定格 |
| **当天请假** | `.rc-leave` | 卡面保持默认，仅右上角石绿实心圆「假」；**不可点选** | 自动（读 `leaves`） |

### 5.2 关键设计：中签卡的「黄」与「灰」不冲突

一个看似矛盾的点：**中签 = 点到了 = 该变灰**，但中签又要黄框醒目。

**解法——黄框与灰色互斥，用时间错开：**

```
抽中 → 加 .rc-pick（黄框，保持正常底色，醒目）＋ 计入 rcDone（不再进池）
     ↓ 老师下次点「开始抽取」时
清除上一批 .rc-pick  →  那些卡因为已在 rcDone 里，自动落回 .rc-done（灰）
```

于是视觉历史自然分层：
- **黄** = 刚抽出来的（本批结果）
- **灰** = 本轮所有已点到（抽中的 + 老师手点的）
- **白** = 还没点到

`.rc-pick` 的 CSS 必须写在 `.rc-done` **之后**（同特异度靠源序压住），或直接提升选择器特异度为 `.rc-card.rc-pick`。

### 5.3 触屏闪烁守卫（项目已验证两次的坑）

项目在 `.key` 与 `.qc-cat` 上各踩过一次：`innerHTML` 重画 + `:hover` 改样式 ⇒ 触摸端必闪（Blink 在 DOM 变更后重算 hover，把手指停点下新插入的元素直接判成 `:hover`）。

本模块的对策：
1. **动效期间绝不 `innerHTML` 重画卡片墙**，只做 `classList.remove/add`（见 §七）
2. 卡片 hover 只做轻微上浮，且加守卫，**必须写在 `.rc-pick` / `.rc-done` 之前**：

```css
.rc-card:hover{ transform:translateY(-2px); border-color:var(--primary-light); }
/* 触摸端回落成基线——必须写在 .rc-pick/.rc-done 之前，否则选中态被夺走高亮 */
@media(hover:none){ .rc-card:hover{ transform:none; border-color:var(--border); } }
.rc-card.rc-pick{ ... }
.rc-card.rc-done{ ... }
```

3. 卡片加 `-webkit-tap-highlight-color:transparent`（默认 `rgba(0,0,0,.18)` 半透明黑，按下会让整块瞬态变深）

---

## 六、抽签池与「一轮」的语义

```
候选池 = 全体学生 − 已点到(rcDone) − 当天请假(rcLeaveMap)
```

一个集合就同时表达了「不重复」和「请假不抽」两条规则，**不需要额外的「本轮已抽过」集合**。

| 事件 | 对候选池的影响 |
|---|---|
| 被抽中 | 加入 `rcDone` → 移出池 |
| 老师手点某卡 | 切换 `rcDone` → 进出池 |
| 重置 | 清空 `rcDone` 与 `rcPicked` → 全员回池 |
| 学生当天请假 | 自动移出池（请假记录改动后即时生效） |

### 6.1 抽取算法

无放回随机 = **部分 Fisher–Yates 洗牌**，取前 N 个，O(N) 且无重复：

```js
function rcSample(cands, n){
  var a = cands.slice(), out = [], k = Math.min(n, a.length);
  for(var i=0; i<k; i++){
    var j = i + Math.floor(Math.random() * (a.length - i));
    var t = a[i]; a[i] = a[j]; a[j] = t;
    out.push(a[i]);
  }
  return out;
}
```

⚠️ **先抽签、后滚动**：中签名单在动效开始前就算好，滚动只是「表演」。这样定格点是确定的、可测的，不会出现「滚完再随机」导致的不确定行为。（GitHub 上的 `react-raffle-picker` 把这种模式叫 *rigged freeze*，是业界通行做法。）

### 6.2 边界处理

| 情况 | 行为 |
|---|---|
| 候选池为空 | 按钮变「本轮已抽完 · 重置」，点击即重置 |
| 选 5 人但池里只剩 2 人 | 自动降为 2 人，toast 提示「本轮仅剩 2 人可抽」 |
| 候选池仅 1 人 | 正常抽，滚动时长短（1.2s） |
| 全班 0 人 | 空状态：`.empty-state` + 「请先到学生管理添加学生」 |
| 当天全员请假 | 空状态：「今天全班请假，无需点名」 |

---

## 七、动效规格

### 7.1 时间轴（抽 1 人，约 2.4s）

```
   0ms ──────────────────────────────────────────────────────── 2400ms
   │                    │                                      │
   ├─ 起手 300ms ───────┤
   │  按钮禁用，卡片墙轻微"呼吸"（可选）
   │                    ├────── 滚动 ──────────────┤
   │                      绿框在候选池跳动，间隔 70ms → 220ms（减速）
   │                      总时长 = clamp(1600 + 60×池大小, 1600, 2400)
   │                                              ├─ 定格 120ms ─┤
   │                                                绿框停在中签卡（已预先算好）
   │                                                            ├─ 揭晓 ─→
   │                                                             绿框移除、黄框接替
   │                                                             scale 1.08 + 弹跳 .45s
   │                                                             toast「抽中：陈嘉和」
```

**减速曲线**（inertia，避免骤停的手感）：

```js
progress  = elapsed / duration
interval  = 70 + 150 * Math.pow(progress, 2.2)   // 70ms → 220ms
```

前段快得看不清、后段一格一格慢下来——这是抽奖类交互的通用手感（`react-raffle-picker` 的 `inertia` 选项即此意）。

### 7.2 抽 N 人（N > 1）：逐个揭晓

不做并行多边框（画面会乱且认不出谁是谁）。改为**逐个揭晓**，且滚动时长随序号递减，制造「越来越快」的节奏：

| 序号 | 滚动时长 | 停顿 |
|---|---|---|
| 第 1 人 | 1600ms | 400ms |
| 第 2 人 | 1300ms | 350ms |
| 第 3 人及以后 | 1000ms | 300ms |

抽 5 人总计约 **6.4s**。可接受；若老板觉得久，可提供「快速模式」把系数整体乘 0.6。

### 7.3 技术实现

**`requestAnimationFrame` 循环 + 只改 classList**，不用 `setInterval`（后台标签页会被节流到 1s 后突然暴走），也不重建 DOM：

```js
var RC = {
  raf:0, t0:0, dur:0, nextAt:0, progress:0,
  pool:[],        // 候选池 DOM 引用（非 id，避免反复 querySelector）
  targets:[],     // 预先抽好的中签 id
  cur:null,       // 当前高亮的那张
  phase:'idle'    // idle | rolling | settling | done
};

function rcTick(ts){
  if(!RC.t0) RC.t0 = ts;
  var el = ts - RC.t0;
  var p  = Math.min(1, el / RC.dur);
  if(el >= RC.nextAt){
    RC.nextAt = el + 70 + 150 * Math.pow(p, 2.2);
    var next = RC.pool[Math.floor(Math.random() * RC.pool.length)];
    if(next !== RC.cur){                 // 同一张不重复 remove/add（会闪）
      if(RC.cur) RC.cur.classList.remove('rc-roll');
      next.classList.add('rc-roll');
      RC.cur = next;
    }
  }
  if(el < RC.dur){ RC.raf = requestAnimationFrame(rcTick); }
  else { rcSettle(); }
}
```

**收尾必做**（否则会留下脏状态）：
- `cancelAnimationFrame(RC.raf)` —— 页面切换、重置、动画被中断时
- 移除所有 `.rc-roll`（不能只移除 `RC.cur`，中断时可能残留）
- `RC.phase` 复位、按钮解禁
- 关闭页面 / `visibilitychange` 隐藏时中止

### 7.4 无障碍

```js
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  // 跳过滚动，300ms 后直接揭晓
}
```

- 按钮有 `:focus-visible`（全站已有 3px 朱砂描边）
- 中签结果同时用 `showToast` 播报（不只靠颜色）
- 卡片是 `<button>` 语义元素？—— 否，用 `<div role="button" tabindex="0">` 与全站一致，并补 `Enter`/`Space` 键盘响应

---

## 八、当天请假判定（新增函数，此前不存在）

现有代码里有 13 个请假函数（`msLeaves` / `openLeaveModal` / `confirmAddLeave` / `extendLeaveApply` / `returnLeave` / `deleteLeave` …），但**没有任何「某天是否在假」的判定**。需新造：

```js
/* v2.21.0 当天是否在假
   判据：startDate <= date <= min(endDate, returnDate||endDate)
   1) 纯字符串比较（'2026-09-14' <= '2026-09-14'），绝不用 new Date()——项目已因 UTC 踩过多次坑
   2) 提前销假时 returnDate 早于 endDate，必须取 min，否则学生已回校却仍标"假"
   3) 半天（am/pm）本期不细分：只要当天落在区间内就标"假"（老师看"假"即知此人今天不在） */
function rcLeaveEnd(l){
  return (l.returnDate && l.returnDate < l.endDate) ? l.returnDate : l.endDate;
}
function rcOnLeave(l, date){
  return !!date && l.startDate <= date && date <= rcLeaveEnd(l);
}
function rcLeaveMap(date){
  var m = {};
  state.leaves.forEach(function(l){ if(rcOnLeave(l, date)) m[l.studentId] = l; });
  return m;
}
```

> 📌 **可选增强（P2）**：若老板要求「上午请假下午来」这类区分，把 `rcOnLeave(l, date, half)` 加一个 `'am'|'pm'` 参数，`startPeriod==='pm'` 时 startDate 当天上午不算假、`endPeriod==='am'` 时 endDate 当天下午不算假。本期不做。

---

## 九、统计面板与信息架构

```
┌─────────────────────────────────────────────────────┐
│ 课堂点名                              [设置日期]     │  ← 页头
├─────────────────────────────────────────────────────┤
│ 应到 28 │ 已点到 12 │ 未点到 16 │ 今天请假 2        │  ← 复用 .stat-grid
├─────────────────────────────────────────────────────┤
│ 抽 [ 1 ▾ ] 人        [ ▶ 开始抽取 ]   [ 重置本轮 ]  │  ← 工具栏
├─────────────────────────────────────────────────────┤
│  张伟   李思远  王雨晴  陈嘉和  刘沐阳  …           │  ← 卡片墙
│  赵一鸣 孙雅静  周子墨  吴桐    郑亦然  …           │
├─────────────────────────────────────────────────────┤
│ 未点到 16 人：赵一鸣 周子墨 吴桐 郑亦然 …           │  ← 名单 chips
└─────────────────────────────────────────────────────┘
```

- 指标卡复用 `.stat-grid` + `.stat-card`，数字用 `.stat-value`
- **未点到名单**用 chips（参考 `.stag` 形态），点击 chip → 滚动到该卡并闪烁一次（`.rowFlash` 已有此动画）
- 统计刷新与卡片墙**分离**：点击某卡只更新 `rcDone` 和指标/名单，**不重画卡片墙**

---

## 十、权限与落盘

### 10.1 权限（待拍板 D）

- 一期：`COMMITTEE_PAGES` **不加** `rollcall` ⇒ 班委模式看不见、进不去（三重拦截：`navigateTo` 入口 / 导航裁剪 / 函数级）
- 点名在 `committeeConfig` 里本是纪律委员/体育委员的职责，若要下放给班委，需单独评估（会改权限链路，建议二期）

### 10.2 落盘（待拍板 B）

| 方案 | 做法 | 说明 |
|---|---|---|
| **B1 不落盘（推荐一期）** | 状态存 `sessionStorage`，键 `cm_rc_<YYYY-MM-DD>` | 页面切换不丢、F5 刷新不丢、关标签页即清；**零同步链路成本**，不与云端墓碑机制纠缠 |
| B2 落盘到云端 | `STATE_SCHEMA` 新增 `rollcallSessions` + `nextRcId`，`MERGE_ST` 照抄 `msLeaves` | 跨设备可见、可回看历史；代价：动表驱动五链路 + 墓碑 + 测试 |

老师上课误按 F5 是真实场景，所以**最简也要 sessionStorage**（5 行代码）。

---

## 十一、GitHub 同类调研结论（避免重复造轮子）

搜到的项目全部是 React / Next.js / Electron 技术栈，**本项目零框架零构建，只借思路、不引依赖**。

| 项目 | 可借鉴的 | 不采纳的 |
|---|---|---|
| `songbaoming/random_roll_call` | **抽牌式不重复**（「保证所有学生均被点名前不会重复」）—— 与本设计的候选池完全同构，印证方案成立 | 数据写死在 `students.js` |
| `kirilinsky/react-raffle-picker` | ① **tick 不触发重渲染**，直接写 DOM（我们升级为只改 `classList`）② `noRepeat` 池抽干即自动禁用 + `onExhausted` 回调（= 我们的「本轮已抽完」）③ **inertia** 软启动软停止 ④ **先定终值后滚动**（rigged freeze） | 引入 npm 依赖；`noRepeat` 名字里带 repeat 语义反了 |
| `Jobin-S/random-name-picker` | ① **顺序高亮 → 逐个消除 → 中签特殊效果**（与我们的动效同构）② 大名单自动切紧凑模式 ③ 自动滚动跟随高亮 | Framer Motion / React Confetti 依赖；「消除」是真删 DOM（我们只改样式，保留全部卡片） |
| `SECTL/SecRandom` | 点名次数均衡的思想 | **动态权重跨轮平衡**——老板明确要「一轮内不重复 + 重置」，是**无放回**语义，与权重算法的目标不同。可作 P2 备选 |
| `BeiChen-CN/Stellarc` | 8 种抽取动画 / 3 档速率 / 沉浸模式（悬浮球）—— 可参考「投屏模式」 | Electron 重客户端 |
| `icelam/random-name-picker` | Web Animations API + `AudioContext` 音效 | 音效本期不做（教室场景易扰民） |

**结论：核心交互（顺序高亮 → 定格 → 逐个揭晓）在业界有成熟先例，本设计与之同构；我们用纯 CSS class + rAF 实现，不需要任何外部依赖。**

---

## 十二、代码落点清单

按 v2.20.11 实测行号（实施时需重新校准）：

| # | 位置 | 行号 | 改动 |
|---|---|---|---|
| 1 | 侧栏导航 | 2122 附近 | 新增 `nav-item` `data-page="rollcall"` |
| 2 | 移动端抽屉 | 15519 附近 | 新增 `more-item` |
| 3 | 页面容器 | 2571 后 | 新增 `<div class="page" id="page-rollcall">` |
| 4 | `pageTitles` | 6851 | 加 `rollcall:'课堂点名'` |
| 5 | `navigateTo` | 6883 附近 | 加 `if(page==='rollcall') renderRollCall();` |
| 6 | 墨线图标 defs | 1655 附近 | 新增 `<symbol id="i-roll">` |
| 7 | CSS | 页面样式区 | 新增 `.rc-*` 一段（约 60 行） |
| 8 | JS 逻辑 | 文件尾部 | 新增约 12–14 个函数（见下） |
| 9 | `sw.js` | `CACHE_NAME` | 跟版到 `v2.21.0` |
| 10 | 版本断言 | 38 文件 / 189 处 | 跑 `_bump_v2211.py` 同款脚本 |

**新增函数（约 14 个）**：
`renderRollCall` / `rcBuildCards` / `rcLeaveEnd` / `rcOnLeave` / `rcLeaveMap` / `rcCandidates` / `rcSample` / `rcStartDraw` / `rcTick` / `rcSettle` / `rcReveal` / `rcToggleDone` / `rcReset` / `rcRefreshStats` / `rcRenderNameList`

---

## 十三、测试计划

新增 **`_v2210b_test.js`**，覆盖：

> ⚠️ 命名避让：`_v2211_test.js` 已被 v2.20.11 占用、`_v2210_test.js` 已被 v2.20.10 占用，**直接写会覆盖既有测试**。沿用项目已有的避让后缀先例（`_v2191fix_test.js`）取 `b` 后缀。
> 断言写成**版本无关**形式（版本号从 `sw.js` 的 `CACHE_NAME` 反推），样板见 `_v2191_test.js` / `_v2210_test.js`。

1. **`rcSample` 无重复**：抽 N 个必得 N 个互不相同的 id；N > 池大小时返回全池
2. **候选池算法**：`rcDone` 成员与请假学生必不在池中
3. **`rcOnLeave` 边界**：
   - 边界日（startDate == date == endDate）
   - 提前销假（returnDate < endDate ⇒ 之后不标假）
   - 正常销假（returnDate >= endDate ⇒ 不受影响）
   - 跨月跨年
   - 纯字符串比较，不依赖 `new Date()` 时区
4. **重置**：清空 `rcDone` / `rcPicked` / 所有 `.rc-*` 类
5. **统计口径**：`已点到 + 未点到 == 应到`，`应到 == 全班 − 当天请假`
6. **拦截**：动画中断（页面切换）后无残留 `.rc-roll`、按钮已解禁

回归基线维护：全绿 **57 → 58 套**。

---

## 十四、待老板拍板

| 编号 | 问题 | 选项 | 我的推荐 |
|---|---|---|---|
| **A** | 页面放哪 | ① 侧栏新增独立页「课堂点名」 ② 并入请假页做双 tab「考勤」 ③ 首页弹层 | **①** |
| **B** | 点名结果要不要存档 | ① 不落盘（sessionStorage，关标签页即清） ② 落盘到云端，跨设备可见 | **①**（二期若要看历史再升级） |
| **C** | 中签黄框留多久 | ① 只标最近一批，下次抽人时清掉 ② 本轮所有中签都留黄框 | **①**（画面干净，灰框已表示"点过"） |
| **D** | 要不要给班委用 | ① 一期仅教师 ② 给纪律委员/体育委员 | **①**（不动权限链路） |

> 拍板后按项目铁律实施：单次补丁脚本写盘 + `chmod 444` → 新增测试 → 版本跟版 → `_runall.js` 全绿 → 逐行对齐线上 blob → 增量推送 → 服务端事实验收。

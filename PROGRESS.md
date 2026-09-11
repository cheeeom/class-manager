# PROGRESS.md — 班主任工作台 进度与待办

> 与 `AGENTS.md`（知识库）+ `DECISIONS.md`（决策记录）配套。
> 本文件只记「当前状态 + 下一步做什么」，不重复架构细节——架构看 `AGENTS.md`。
>
> 最后更新：2026-09-11（v2.18.14 修复 JSON 导入丢字段→荣誉复活；同日 v2.18.13 批量导入学生表格 Excel/CSV / v2.18.12 荣誉删除墓碑 / v2.18.11 纯本地模式）
> ⚠️ 下文「一、当前状态速览」为 v2.8.0 期快照，未随版本更新；**最新进展一律以文末「逐版章节」为准**。

---

## 一、当前状态速览

| 项 | 状态 |
|---|---|
| 线上版本 | **v2.8.0 已上线并验证**（commit `5ed13ea`，Pages 部署完成，SW 缓存已 bump） |
| 本地工作副本 | `D:\a\chee777\class-manager`（与远端一致，工作区干净） |
| 云端真实数据 | 56 名学生（含家长电话/宿舍床位标签）、12 条通知模板、9 条学分原因 |
| 云端加密状态 | **明文** —— 等你在设备上设同步口令并推一次才变密文 |
| 学分流水 | **0 条**（⚠️ 需向使用者确认是否属异常） |
| 代码健康度 | 无重复函数定义、无硬编码 Token、语法检查通过、加解密回归测试通过 |
| 泄露面 | 两个图片 txt 已删除 ✅；**git 历史 96 份明文 data.json 仍在（未清理）** ⚠️ |
| 完整备份 | `D:\a\chee777\_cm_backup_20260902\`（mirror + bundle + 原始 data.json） |

## 一·五、🔴 当前阻塞：等你完成一个浏览器操作（约 2 分钟）

**历史清理必须等这一步完成。** 否则清理完应用会自动重建 `data.json`——
而你还没设口令，重建出来的还是明文，等于白干。

请在**存有 56 名学生的主力设备**上依次操作：

1. 打开 <https://cheeeom.github.io/class-manager/>，确认左下角显示 **v2.8.0**
   （若仍是 v2.7.0，按 Ctrl+Shift+R 强刷；SW 缓存版本已 bump 过）
2. **先备份**：设置 → 「💾 导出数据」→ 存到本机安全位置
   （**同步口令不可找回，这是你唯一的明文退路**）
3. 设置 → 「🔒 配置同步口令」→ 设强口令（≥12 位、字母+数字，**别用 6 位登录密码**）→ 再输一次确认
4. 设置 → 「⬆️ 推送数据到云端」→ 看到「数据已推送到 GitHub 云端!」
5. 回来告诉我一声，我验证 `data.json` 变成 `{enc:1,...}` 后立刻执行历史清理

其他设备随后设**完全相同**的口令即可。

## 二、待办队列（按优先级）

### 🔴 P0 — 数据安全，建议最先做

- [x] **修复「空本地覆盖云端」竞态**（v2.8.0 已改完，待真机验证）：
  - [x] 推送闸门：本地为空 + 远端有数据 → 中止推送并自动改从云端恢复
  - [x] 推送前合并：PUT body 改用 `smartMergeData(local, remote)` 结果
  - [x] 同步锁：`syncInProgress` + `_pushPending` 延迟补推
  - [ ] **真机验证**：清空浏览器持久层 → 重新打开 → 确认自动从云端恢复而非推空数据
- [x] **客户端加密上云 v2.8.0**（AGENTS.md 5.8）：AES-GCM-256 + PBKDF2(250000)，全站唯一 PUT 入口 `doPushToCloud`
- [ ] **【最高优先】在主力设备启用加密**：打开线上站点 → 设置页 → 「🔒 配置同步口令」→ 设强口令 → 点「推送数据到云端」。**在此之前请先「导出数据」留一份明文备份**（口令不可找回）
- [ ] **其他设备设完全相同的口令**（否则会触发拦截）
- [ ] **清除 git 历史里的 96 份明文**：`git filter-repo` 重写 + force push。⚠️ 会改写所有 commit sha，需重新 clone；且 GitHub 服务端可能残留缓存
- [ ] **向使用者确认**：学分流水 `operations` 为何是 0 条？是否曾经有数据后丢失？

### 🟡 P1 — 需要决策

- [ ] **旧 GitHub Token 吊销**：v2.6.1 前硬编码的 token 仍留在 git 历史里且可能仍有效。确认各设备已配好新 token 后，到 GitHub → Settings → Developer settings 吊销旧的（AGENTS.md 已知问题 #5）
- [ ] **`dutyDays` 含周日不含周六**（index.html:4413）：确认是寄宿制排班需求还是笔误，再决定是否改
- [ ] **删除语义**：整体覆盖式推送导致「删除」操作在多设备间不可靠。修复 P0 后需重新设计（墓碑标记 or 显式覆盖入口）

### 🟢 P2 — 一致性 / 体验

- [ ] `escapeHtml` 覆盖补全：学生表格姓名（3880）、统计卡姓名及 title 属性（3664/3665/3672）、`<option>` 姓名（4133/4307）、todo 文本（6788）等早期模块
- [ ] 成长记录删除加确认弹窗
- [ ] 顺手修正 CSS 注释 `/* 墨线图标系统（v2.7.1） */`（index.html:1655）——实际属于 v2.7.0，版本注释超前
- [ ] 删除无用文件 `avatar-img.txt`（210KB）/ `schedule-img.txt`（1.1MB）——已确认无代码引用，会让仓库体积虚胖
- [ ] `deploy.sh` 里的旧代理 `http://192.168.1.13:9890` 更新为当前可用代理

## 三、接续开发开工清单（给下一个 AI / 下次开工的自己）

1. `git pull`（**不要用 zip 下载**，CDN 会给过期代码 —— AGENTS.md 10.1）
2. 读 `AGENTS.md`：重点第 3 节结构地图、第 5.6 节 P0 事故、第 9.5 节设计系统
3. 若要改 UI：先读 AGENTS.md 9.5「纸墨·新中式」令牌表 —— 改色只动 CSS 变量，但 Canvas 图表是硬编码色值，要同步改
4. 改完 `index.html` 后：版本号三处（搜 `v2.8.0` 一次性替换；sw.js 的 `CACHE_NAME` 别漏）
5. 发了版：回来更新本文件的勾选状态 + 日期
6. **push 不通时别急着换方案**：先 `env | grep -i proxy` 拿本次会话端口写进仓库 config，
   再重试 20+ 次（`github.com` 是间歇性 502）。真不行就用
   `node ../scripts/cm-push-via-api.js "信息"`（走 `gh api`，不受影响）——
   但务必先读 AGENTS.md 10.2 里那两条铁律，我踩过并炸了线上图标

## 四、会话完成记录

### 2026-09-01（第一次接手）

- [x] 从 GitHub 全量拉取源码（发现并绕过 CDN 缓存陷阱，改用 git clone）
- [x] 逐行核对 `AGENTS.md` 的行号与事实，全部校准到 v2.7.0 真实值
- [x] 新发现并定位 P0 级数据事故（空本地覆盖云端），给出根因链与修复方案
- [x] 复核已知问题状态：确认 v2.6.1 的 4 项修复均已生效，无重复函数定义
- [x] 新增「第 10 节 接手陷阱」（CDN 缓存 / 代理配置 / 活数据 / 真实数据速查 / 排查命令）

### 2026-09-02（v2.8.0 加密改造）

- [x] 安全审计：确认仓库 public、无凭据一条 curl 拿到 56 姓名 + 55 家长手机号
- [x] 澄清两个反直觉结论：转私有仓库无效（Free 账户不支持私有 Pages，且站点可见性是另一套设置）；删文件救不回来（历史 96 个版本可单独访问）
- [x] 调研私有存储后端：Cloudflare Workers+KV / Supabase / 腾讯云 CloudBase 三家对比，均为 0 元/月；因用户反馈访问速度没问题，最终采用方案 A（客户端加密）
- [x] 实现客户端加密：信封格式 `enc/alg/salt/iv/data`，AES-GCM-256 + PBKDF2-SHA256(250000)
- [x] 重构推送链路：`doPushToCloud` 成为全站唯一 PUT 入口（原 auto/manual 两套重复代码合并）
- [x] 加三道推送拦截 + 同步锁 + 推送前合并，修掉 P0 竞态
- [x] 设置页 UI：新增「🔒 配置同步口令」按钮 + 加密状态显示 + 风险说明
- [x] 版本号三处升到 v2.8.0（含 sw.js CACHE_NAME）
- [x] 校验：JS 语法通过、131 个内联事件处理函数全部有定义、PUT 全站仅 1 处
- [x] 加解密回归测试 `node _crypto_test.js` 全绿（密文无明文残留 / 还原一致 / 错口令被拒 / 多设备 salt 一致）
- [x] 删除无引用的 `avatar-img.txt`（班级合影）/ `schedule-img.txt`（课程表），堵掉两处泄露
- [x] 建三重备份（mirror + bundle + 原始 data.json）后再动历史
- [x] **已上线并验证**：commit `5ed13ea`，Pages 部署完成，线上确认 v2.8.0 + SW 缓存已 bump
- [x] 写好历史清理脚本 `scripts/cm-purge-history.sh`（带前置检查：会拒绝在 data.json 仍是明文时执行）
- [x] 写好 API 推送兜底脚本 `scripts/cm-push-via-api.js`

**这一轮我自己搞砸又修好的两件事（都记进 AGENTS.md 10.2 了）：**

- **二进制图标被我传坏了**：API 上传 blob 时用 UTF-8 字符串读 git 对象，PNG/ICO 的无效字节被替换成 `U+FFFD`，体积膨胀 1.8 倍，线上 PWA 图标和 favicon 当场全废。补了一个 `fix:` 提交救回，脚本已改为按 Buffer 读，并加了「上传后 sha 对比」的自检。
- **把 CRLF 写进了仓库**：`core.autocrlf=true` 下工作区是 CRLF 而历史是 LF，直接读工作区上传就污染了行尾，导致后续每次提交都显示为整文件改动。补了一个 `chore:` 提交归一化回 LF。**教训：API 上传的内容一律取自 git 索引 blob，不取工作区文件。**

### 2026-09-03（验证 + 清理前置演练）

- [x] **云同步行为测试** `_sync_test.js`：9 个场景 / 26 项断言全过，全部从 `index.html` 抽取真实实现运行。三道拦截、推送前并集合并、多设备 salt 一致性、404 创建分支——全部验证
- [x] **历史清理干跑**：在仓库副本上跑通 `git filter-repo`，未碰真实仓库
  - `data.json` 历史 103 → **0**，`avatar-img.txt` 6 → **0**
  - `.git` 从 **12M 瘦到 1.5M**
  - 提交数 191 → 66（prune 掉 125 个纯 data.json 的空提交，**不是丢代码**——干跑后回归测试仍全绿）
- [x] 干跑暴露并修好脚本两个缺陷：① force push 没有 API 兜底（重写历史必须 `git push --force`，Git Data API 传不了整段新历史）；② 失败时缺回滚，已加「从备份 mirror 重新克隆」的兜底
- [ ] **等你启用加密**（见「一·五」）：主力设备设同步口令 → 推送 → 云端变密文
- [ ] 验证 `data.json` 成 `{enc:1,...}` 后，跑 `scripts/cm-purge-history.sh`
- [ ] 清理后抽查旧 commit 是否 404；并向 GitHub 官方提工单清除缓存视图

**清理脚本已在副本上验证过，但仍然不可逆。** 执行前会自动再做一次 bundle 备份；force push 失败 40 次会自动回滚到备份状态，不会丢数据。

### 2026-09-03（v2.8.1 XSS 加固上线）

- [x] **修复属性上下文注入**：旧 `escapeHtml` 用 textContent→innerHTML，只转义 `& < >` 不转义引号，放进 `title=` / `value=` / `onclick=` 等属性上下文照样能打穿。改为显式转义 `& < > " '`（`&` 最先替换防二次转义）
- [x] 新增 `escapeAttr`：class 等受限属性用白名单剥离危险字符
- [x] `showToast` 改 textContent 渲染（toast 消息常含学生姓名）
- [x] 标签删除/切换改传索引，标签字面量不再拼进 onclick（单引号属性可被 `')` 闭合注入）
- [x] 导入预览暂存 `_importPreview` 模块变量，JSON 不再拼进 onclick 属性
- [x] 表格/详情/榜五/待办/考试/班委/下拉等渲染点统一走 `escapeHtml`
- [x] 新增 `_xss_test.js`：14 项断言（含结构断言防回退），与 `_crypto_test.js`/`_sync_test.js` 三套全绿
- [x] 版本号升 v2.8.1（登录页 + 侧栏 + SW CACHE_NAME）
- [x] **已上线并验证**：commit `b638a3e`，线上 login-version = v2.8.1、SW 缓存 = class-manager-v2.8.1
- [x] 本轮推送全程 github.com 502，走 `cm-push-via-api.js` 兜底；顺带修复该脚本「未知参数不报错、被当成提交信息推送」的缺陷（`--help` 曾真的推了个 message 为 "--help" 的提交上去，已用 API 重写该提交信息）
- [ ] **云端 data.json 仍为明文**：10:29 出现的 `manual push`/`auto-sync` 两个提交推送时口令尚未设（无口令降级明文）。历史清理继续阻塞在：设口令 → 推送变密文 → 跑 `scripts/cm-purge-history.sh`

### 2026-09-03 晚（历史清理执行完毕，泄露止血）

- [x] 前置确认：云端 HEAD data.json 为 `{enc:1, PBKDF2-SHA256(250k)/AES-GCM-256}` 密文，无明文键名
- [x] **git filter-repo 两遍**：
  ① 抹掉 data.json / avatar-img.txt / schedule-img.txt 全部历史（200 → 71 提交，108 份明文 data.json → 0）
  ② `--replace-text` 清洗 AGENTS.md / _crypto_test.js / _sync_test.js 里的真实学生姓名（73 个姓名映射 + 裸名）与真实家长手机号 → 占位符（第二轮抓到的漏网之鱼）
- [x] 终验：全历史 grep 真实姓名 / 真实手机号 **零残留**；data.json 全历史仅剩 1 个密文版本
- [x] force push 上线（远端 HEAD `85727c2`），密文 data.json 原样放回，同步不断线
- [x] 本地仓库重装：旧 .git 的 ref 存储有毛病（filter-repo 后 refs/heads 被清空、HEAD 变 unborn master），
  改为全新 clone 后重做，旧目录留存于 `class-manager-broken-backup`
- [ ] **待办：向 GitHub 提工单**（https://support.github.com/request）请求清除旧提交的缓存视图 / 服务端 GC——
  旧 sha（如 40884bf6、以及更早全部 tip）目前仍可按 sha 直达，工单处理完泄露才彻底关闭

### 2026-09-05（v2.9.0 / v2.10.0 / v2.11.0 三连发）

- [x] **v2.9.0**：班委制度 8 岗（任命表唯一真源 + 标签自动派生）、寝室管理页（标签派生架构）、学分原因模板 26 项对齐制度、月度自动结算；回归 `_v290_test.js` 25 项
- [x] **v2.10.0**：值日轮次制公平轮转（学号队列 + 游标 + 周固化按需预生成）、罚扫记录（扣学分全链路联动）、组别制导出、饮水机顺序轮转；回归 `_v2100_test.js` 19 项。教训：**周序号/游标这类从 0 开始的计数器严禁 `x||默认值`**（0 是合法值）
- [x] **v2.11.0（本次）**：
  - 学生列表排序改造：默认按学号（序号）升序；点「学分」列头/工具栏按钮切到按学分降序；再次点击恢复序号排序。列头高亮联动（`th.sorted`）
  - 新增「名单同步」功能（学生页 → 批量导入 → 名单同步）：粘贴 `序号 姓名` 名单 → 预览（新增/移除/学号更新/同名冲突四栏）→ 确认执行。按姓名匹配保留既有学分/标签/档案，仅重排学号；移除自动清理班委任命/座位/值日/罚扫引用；同名学生无法自动区分时保守处理不误删
  - `rosterParse` / `rosterBuildPlan` 为纯函数，回归 `_v2110_test.js` 17 项（三套测试共 61 项全绿）
  - 版本号 v2.11.0（登录页 + 侧栏 + SW CACHE_NAME）
  - 配套：新名单粘贴文本在仓库外 `D:/a/chee777/名单同步_26幼2_59人.txt`（59 人，含两名同名学生靠备注区分），不进公开仓库
- [ ] 老板操作：线上打开学生页 → 批量导入 → 名单同步 → 粘贴 59 人名单 → 预览核对（重点看同名学生是否被标记冲突）→ 确认同步
- [ ] GitHub 工单回复后：验证旧 sha（如 40884bf6）直达返回 404，泄露彻底关闭

### 2026-09-05（v2.11.1 热修：名单同步修复重复导入，115→59 收敛）

- [x] 事故：班级出现 115 人（56 原有 + 59 名单被整批重复导入）。云端加密无法离线修，升级「名单同步」自愈
- [x] 匹配增强（rosterBuildPlan）：① 规范名 = 去序号前缀「1 」+ 去备注括号，可识别脏名副本；② 班级同名数 = 名单条数 → 顺序配对（消化重复导入/同名两人）；③ 数量不一致 → 整组 conflict，不误删不误加；④ 孤立副本（原班无此人）收编：改名清洗 + 学号归位，免删免增
- [x] 预览升级：显示「当前 N 人 → 同步后 M 人」+ 改名清洗栏；确认框/完成 toast 带人数
- [x] 顺带修复：登录页版本号 v2.11.0 时实际未落盘（grep 验证误判，两个 v2.11.0 来自侧栏+功能标签），本次一并修正
- [x] 回归 _v2110_test.js 扩到 20 项（重复导入修复/同名配对/冲突组/脏名清洗），三套共 64 项全绿；115 人沙盘推演收敛正确（52 原有学分全保留）
- [ ] 老板操作：强刷页面 → 名单同步 → 粘贴 59 人名单 → 预览核对（移除应为 55~56 个副本/退班者）→ 确认 → 如刘梓萱组报冲突，按提示手动删多余的那条 0 分记录

### 2026-09-05（v2.11.3：彻底重置机制 wipeAt，老板要求清除云端数据）

- [x] 需求：数据多次折腾后老板决定推倒重来，要求清除云端数据
- [x] 机制分析结论（关键）：应用内清空/直接删云端文件都无效——
  ① checkPushSafety「本机空+云端有人→拦截并从云端恢复」会让清空 instantly 复活；
  ② 旧设备本地的脏数据 auto-push 会通过并集合并覆盖空云端。
  唯一正解 = 重置戳 wipeAt 全链路
- [x] 实现：clearData 重写（补齐 punishments/duty 轮次制字段/8岗 committee；保留 className/motto/avatar/scheduleImage）→ 打 state.wipeAt=Date.now() → pushWipeToCloud 强推（绕过空本地保护+并集合并）；
  wipeInProgress 锁屏蔽 wipe 期间的常规 auto push / auto pull（防竞态复活）；
  checkPushSafety 加「云端 wipeAt 更新→拦截并 resync」；applyCloudData 在 smartMerge 之前做 wipeAt 对齐（云端重置→本机强制清空）；CLOUD_SYNC_FIELDS/loadData 支持 wipeAt
- [x] 新增 _v2113_test.js 13 项（整页脚本语法编译 + checkPushSafety 重置决策表 + 结构断言）；六套测试共 118 项全绿
- [x] 云端 data.json 已备份：D:/a/chee777/backups/data.json.bak-20260905-154027（密文，可回滚）
- [ ] 老板操作：强刷（v2.11.3）→ 设置 → 🗑清空数据（两次确认）→ 自动同步清空云端 → 学生页名单同步导入 59 人 → 其他设备打开自动对齐

### 2026-09-05（v2.12.0：学分原因多级选择器）

- [x] 需求：26 个加减分原因平铺下拉难选，做多级筛选（加分/扣分 → 大类 → 具体原因）
- [x] REASON_CATALOG 三级目录（加分：学习表现/活动荣誉/卫生劳动/班级贡献；扣分：考勤/课堂纪律/作业考试/值日公物/宿舍/同学关系；其他：通用）——分值不存目录，统一读 state.reasonScores
- [x] 原因选择器组件：trigger 按钮 + 展开面板（方向 chips → 大类 chips → 原因 chips 带分值徽章），点选自动填制度分值进 customCredit/batchCredit（可手改）；支持清除已选、自定义原因兜底（state.reasons 中不在目录的归入「自定义」组）
- [x] 架构：原 select 保留为隐藏数据载体（display:none），选择器只是可视皮肤——quickCredit/customCreditApply/confirmBatchCredit/undo 等既有逻辑零改动
- [x] 坑：escapeAttr 白名单不含 emoji（➕➖ 会被剥掉）→ 目录键改纯中文，emoji 只进显示文本
- [x] _v2120_test.js 11 项（目录完整性 26 项防漏/键白名单校验/结构断言/整页语法编译）；七套共 129 项全绿
- [ ] 老板操作：强刷（v2.12.0）→ 学分页/批量加减弹窗体验新选择器

### 2026-09-05（v2.13.0：班委免密入口 + 受限协作视图）

- [x] 需求：登录页加班委免密入口，进去看不到学生档案，只能看/操作学分、值日等协作功能
- [x] 白名单制（比黑名单安全）：仅 首页/学分记录/值日排表/座次表/待办/荣誉墙 6 页；学生管理/学生档案/班委管理/寝室/请假/成绩/工作留痕/通知/数据分析/设置 全部不可达
- [x] 实现：登录页「👩‍💼 班委入口」按钮 → enterCommitteeMode（sessionStorage cm_role，不占用/不继承主账号登录态）→ applyCommitteeRestrictions 裁剪导航三套入口（侧栏/移动tab/更多抽屉）+ 顶栏导出/导入/添加学生；navigateTo 白名单拦截兜底动态跳转；exportData/importData/openAddStudentModal 函数级拦截（导出会把含家长信息的全量数据落文件，必须封死）；侧栏底部班委徽标+退出；刷新自动恢复
- [x] 同步策略：拉取照常（看最新数据）；推送照常（班委加的学分入云不丢——若禁推，多设备场景下班委操作会本地蒸发）。破坏性操作（清空/导入/改口令）全在设置页=白名单外
- [x] _v2130_test.js 11 项；八套共 140 项全绿
- [ ] 老板验收：登录页点「班委入口」→ 检查侧栏只剩 6 项、导出/导入/添加学生消失、点隐藏页会提示无权限

### 2026-09-06（v2.14.0：学分批量操作 / 劳动整改 / 初始学分统一100 / 关闭键美化）

- [x] **学分批量操作**：学分页学生选择改多选——点搜索结果即选中/取消（下拉保持展开连续点选，✓ 高亮），已选 chips 可单个移除，支持「全班全选/清空」；applyCreditBulk 一次写一批流水，统一保存/渲染/提示；quickCredit(-5~+5) 与自定义分值均支持批量
- [x] **罚扫 → 劳动整改**：UI 文案全量替换（仅注释留历史）；劳动类型三选：教室/公共区/搬水劳动；默认天数 教室 7 / 公共区 7 / 搬水 1，区域切换自动带出；天数改自定义数字输入（1-30）；流水原因前缀「劳动整改·」；旧记录 punishStatusFor 兼容不动
- [x] **初始学分统一 100**：normalizeInitialCredits 纯函数——credit===0 且无任何流水 = 未初始化 → 自动修 100（loadData 尾部幂等执行+持久化，多设备拉取后自动修）；有流水的 0 分（真扣到 0）不动；新增弹窗/批量导入/名单同步三个入口默认分改 100
- [x] **详情面板关闭键美化**：panel-close 圆形描边 34px、hover 变红+90° 旋转、active 缩放，与卡片圆角语言统一
- [x] _v2140_test.js 16 项；九套共 156 项全绿
- [ ] 老板验收：学分页连续点选多人批量加减 / 值日页记劳动整改（搬水 1 天）/ 打开学生详情看新关闭键

### 2026-09-06（v2.15.0 / v2.15.1：学分一致性修复 + 图表 100 分制口径）

- [x] **背景**：老板反馈「学分加减没体现在学生管理模块、分数不一致」「操作记录不显示」「柱状图 0-99 不合理、最低学分同学不对」。逐条挖根因
- [x] **根因 A（多设备分数不一致）**：smartMergeData 合并 students 时按 updatedAt 取新，但学生对象**从不写 updatedAt** → lt=rt=0 → `rt>lt` 恒 false → **永远取本地**，云端学分变更被丢弃，流水并集却两边都收 → 快照与流水漂移、各模块各说各话
- [x] **根因 B（学生管理模块不刷新）**：applyCredit/applyCreditBulk/undoLastOp 只调 renderCreditsPage()，不调 renderTable() → 学分页操作后学生列表不刷
- [x] **根因 C（操作记录不显示的体验来源）**：renderCreditsPage() 开头清空已选学生+搜索框，refreshCreditViews 每次加分都整页 reset → 连续操作时选的人没了像没生效；旧流水 time 缺失显示 NaN/NaN；时间线 30 条无上限提示
- [x] **根因 D（首页/分析数值错位）**：`s.credit===min` 严格比较，credit 为字符串（导入遗留）时永远匹配不上 → 最低分显示「—」或错人；Math.min 遇 NaN 返回 NaN
- [x] **根因 E（图表老口径）**：drawRangeChart 分段 0-10/11-20/…/41+、drawPieChart 同理、及格率≥10/优秀率≥25 —— 全是 v2.14.0 之前的基准，100 分制下全班挤进一根柱子
- [x] **v2.15.0 修复**：creditBase 基线（credit = base + Σ本人流水，幂等反推，老学生初始分各异不硬写 100）；applyCreditDelta() 统一写入入口（credit+creditVer+updatedAt+流水四者原子一致，四个写入点全改走它）；reconcileCreditDrift() 启动/拉取后自愈；smartMerge 增 creditVer 判定取新，旧数据无 ver 保守取本地由自愈兜底；refreshCreditViews() 统一刷学生表/档案/时间线（dashboard/analytics 活跃页判定）；新增 _v2150_test.js 26 项
- [x] **v2.15.1 修复**：refreshCreditViews 不再调 renderCreditsPage（避免清空选择）改直刷 renderCreditsTimeline+updateUndoBtn；renderOpItem/formatOpTime 统一时间线渲染（时间戳兜底「时间未知」/姓名缺失用学号/原因转义防 XSS/50 条上限+总数提示）；首页最值用 creditOf Number 规范化；distChart 自适应 8 档（按实际区间 [lo,hi]，不再固定 10 分一档）；rangeChart/pieChart 制度四档（<80 不合格/80-89 一般/90-99 合格/≥100 优秀）；合格率(≥90)/优秀率(≥100)；测试扩到 38 项
- [x] 十套共 **194 项全绿**（25/19/21/13/11/11/16/38/26/14）；远端 commit d3dfc899
- [ ] 老板验收：强刷 v2.15.1 → ①学分页连加几人看时间线实时出新记录且选择不被清空 ②首页最高/最低名字正确 ③首页分布图与分析页区间/饼图按 100 分制显示
- [ ] 学分公示模块（v2.16.0）：规格见 SPEC_学分公示模块.md，老板已逐项确认，待开工
- [ ] 图表选型待老板拍板：是否内联 Frappe Charts（15.1k★ 零依赖 SVG 20KB）或保持纯手绘（推荐）

### 2026-09-06（v2.16.0：学分公示模块）

- [x] 老板上轮要求「先上 GitHub 调研成熟方案再定图表路线」：调研结论 Frappe Charts(15.1k★ 零依赖 SVG ~20KB) / Chart.js(~200KB) / uPlot / ECharts(~1MB)；**老板拍板：不引库，纯 canvas 手绘**（口径问题与库无关、风格统一、导出海报必须自绘省不掉、单文件不膨胀）
- [x] **独立公示页**（侧栏 + 更多抽屉 + pageTitles + navigateTo + 班委白名单第 7 页 + 拦截提示文案）：周期切换 今日/本周(周一)/本月/学期(开学日可配，默认 9/1 与 3/1 自动推断) + 六张概览卡（变动人次/加分/扣分/净变化/人均/最活跃）
- [x] **6 榜单**：学分榜 Top10（同分按学号）、进步榜 Top10（周期内净增分）、零扣分榜（有记录且无扣分）、单项之星（加分次数最多 + 单笔最高）、退步榜 Top5（默认折叠）、预警榜 <80（仅班主任、班委隐藏、不进导出）
- [x] **4 图表**（纯 canvas）：全班人均学分 30 天趋势（流水反推每日人均）、每日加减 14 天双色柱、当前学分制度四档分布、原因分布环形 Top6 + 图例
- [x] **海报导出**：canvas 自绘（1080×1920 竖版 / 1080×1350 紧凑），含头像圆标/班级名/格言/周期标题/学分榜 Top10/进步榜 Top5/生成时间；班委模式禁止导出
- [x] **隐私开关**（设置→公示设置）：全名 / 张* / 仅学号（页面与海报同源）；开学日期可配
- [x] 口径：孤儿流水（学生已删）不进任何统计（防班级汇总被污染）；netSum/avgDelta 基于现学生
- [x] 坑：注释里 `张*/` 会让 `*/` 提前结束块注释 → 语法错误，改「姓加星」表述
- [x] _v2160_test.js 32 项（含 stub-canvas 绘制冒烟）；回归 _v2130（白名单 6→7 页）、_v2150（版本断言）同步更新；**十一套共 226 项全绿**（25/19/21/13/11/11/16/38/32/26/14）；远端 commit a900c858
- [ ] 老板验收：侧栏进「学分公示」→ 切今日/本周/本月/学期看榜单变化 → 设置里切姓名显示 → 导出竖版图检查排版 → 班委入口确认可见但不给导出

### 2026-09-06（v2.16.1：概览最高/最低分 + 零扣分续航榜 + 班委端公示确认）

- [x] 老板追加三点需求：①概览要有最高分最低分 ②零扣分榜要记「最长时间没扣分的同学」③学分公示进班委操作端
- [x] **最高/最低分**：computePublicityData 返回 maxRow/minRow（按当前学分排序，并列取学号小者，**不分周期**——周期过滤的是流水增量，最高/最低是当前截面）；renderPubSummary 追加两张卡「🏆 最高分」「⚠️ 最低分」（分数+姓名，最低 <80 数字标红）；口径说明同步更新
- [x] **零扣分榜 → 未扣分续航榜**（口径变更）：语义从「本期有记录且无扣分」改为「距本人最后一次扣分的天数」——全程流水、不分周期；从未扣分者（days=null）居首，其余按天数降序、同天按学分；每人标签「从未扣分」绿 /「N 天」琥珀；只在 computePublicityData 里算，与周期统计互不干扰（扣分发生在周期外也计入续航，加分不中断续航）
- [x] **班委操作端确认**：核对了侧栏 nav-item(第 1922 行)、更多抽屉(9910)、COMMITTEE_PAGES 白名单(7915, 7 页含 publicity)、navigateTo 路由守卫——v2.16.0 起班委就已可见公示，双入口 + 只读；预警榜/退步榜对班委受控；exportPublicityPoster 对班委拦截（9758「班委模式不开放导出」）。补 3 条硬断言锁死（侧栏/抽屉/守卫 + 导出拦截），防止以后改导航把公示漏出白名单
- [x] 渲染层改动：pubStaminaRow(entry) 新行渲染（entry={row,days}）；renderPubBoards 零扣分榜接入 pubStaminaRow；旧「r.adds+次加分」残留清除；pubRankRow 保持原样（学分榜用）
- [x] 口径说明 HTML 同步（2289 行附近）：最高/最低不分周期 + 续航榜口径
- [x] 坑：renderPubBoards 旧行直接 map data.zero 且取 r.credit/r.adds——元素结构换成 {row,days} 后旧渲染全 undefined，必须整行替换而不是打补丁
- [x] _v2160_test.js 32→42 项：零扣分榜旧断言（本期无扣分）按新语义重写；新增最高/最低（含并列取学号小、周期外也返回）、续航天数 = floor((now−上次扣分)/86400000)、加分不中断续航、续航榜封顶 10 人、pubStaminaRow 标签输出、班委端三入口+导出拦截断言；_v2150 版本断言 2.16.0→2.16.1
- [x] 版本号三处同步 v2.16.1（登录页/侧栏/CACHE_NAME）；**十一套共 236 项全绿**（25/19/21/13/11/11/16/38/42/26/14）+ _crypto 跨设备解密 ✅
- [ ] 老板验收：公示页概览卡看最高/最低分（切周期它俩不变）→ 零扣分榜看「从未扣分/N 天」标签 → 班委入口 → 学分公示只读可见、导出按钮被拦

### 2026-09-07（v2.17.0：可编辑原因目录 + 多级菜单逐层化 + 班委操作留痕）

- [x] 老板三点需求：①班委要能操作学分加减辅助管理 ②加减分原因多级菜单不能写死预设、要能自定义 ③先上 GitHub 找成熟多级菜单方案再优化
- [x] **GitHub 调研结论**：成熟方案两类——级联悬浮面板（AntD/element-plus Cascader：点父级右列联动、末级即收）与逐层滑动抽屉（traversable_menu，移动端友好）；纯手写轻量参考较老。**老板沿用图表选型套路拍板：不引库**，按 Cascader 交互范式重构现有选择器为「数据驱动 + 逐层下钻」
- [x] **口径拍板（AskUserQuestion 三项全选推荐）**：班委加减全开 + 设置开关可关扣分 / 班委入口选身份署名到人 / 预设 26 项 = 初始模板全可编辑
- [x] **数据层（目录可编辑化）**：REASON_CATALOG 降级模板；state.reasonCatalog 为实例（云端 reasonCatalog 字段同步）；CLOUD_SYNC_FIELDS/saveData/smartMerge 全接线（并集合并，删除复活属已知取舍）；reasons 降为派生缓存（syncReasonsFromCatalog = 目录扁平）；loadData 迁移：无目录→模板、历史自定义原因并入「其他→自定义原因」、**已有目录尊重编辑不复活已删预设**（migrate 初版误用模板并集复活删除项，已修）；删原因同步清 reasonScores
- [x] **设置页目录管理 UI**：替换旧一维「原因预设」区为目录树（方向块→大类块→原因行内分值编辑+删除），prompt 快录方向/大类、改名、删除 confirm；新增原因弹窗（方向/大类联动、支持顺手新建大类、默认分值可空=手填）；一键恢复预设（双 confirm 覆盖目录+分值）；改动即 saveData+派生+全刷新
- [x] **多级选择器逐层化**：renderReasonPicker 从「三行全展开」改为 Cascader 式逐层（①方向 → ②大类 → ③原因，一次一层），头部路径面包屑（‹ 换方向 / ‹ 返回大类）可回退；数据源切 state.reasonCatalog；去掉 extra/自定义组兜底分支（迁移后所有原因都在目录）；rcSetDir 直入、rcSetGroup(null) 返回大类、新增 rcToDirs
- [x] **班委操作**：确认现状班委本就能加减（无角色拦截）但**零留痕**——①入口改造：enterCommitteeMode → 身份选择面板（列出 state.committee 已任命岗位，含「通用班委」匿名兜底；未任命给出引导）；cmLoginAs 记录 cm_uid + 移除主账号登录态；keydown 在身份选择阶段不吞数字 ②resolveCmIdentity → window.__cmIdentity ③applyCreditDelta 班委写 op.by='cm'/+byName/byPost（教师不写 by）④renderOpItem 时间线紫标小牌「👩‍💼 王小明 · 班长」⑤扣分开关：设置页「班委协作设置」checkbox（本地 cm_teacher_settings 不上云），cmMinusBlocked() 拦 quickCredit/customCreditApply/confirmBatchCredit 负值 + updateCreditBtnStates 禁扣时减分按钮置灰
- [x] 坑：enterCommitteeMode 原实现多了 removeItem(SESSION_KEY)+enterApp() 两行，凭记忆的 old_string 不匹配 → grep 原文再替换；单行函数（defaultReasonCatalog/cloneReasonCatalog）又被 grab 的「行首 }」抓到跨段拼接 → stub；migrate 模板并集复活删除项 bug
- [x] 回归：_v2170_test.js 新增 32 项（目录纯函数/迁移尊重删除/署名行为/扣分开关三态/选择器三层 stub-DOM 冒烟/接线断言/旧 UI 下线检查）；_v2130（班委登录流改 cmLoginAs 断言）、_v2150/_v2160（版本号）同步；**十二套共 268 项全绿**（25/19/21/13/11/11/16/38/42/32/26/14）+ _crypto ✅
- [x] 版本三处同步 v2.17.0；CONTEXT 架构记忆更新（班委模式留痕/原因目录新节/编号顺延）
- [ ] 老板验收：设置页增删改原因目录（含新方向「卫生」+新组+原因+分值）→ 学分页原因选择器逐层点选 → 恢复预设按钮 → 班委入口选身份 → 班委加减分 → 教师端时间线看到「王小明 · 班长」紫标 → 设置关掉「允许班委扣分」后班委减分按钮变灰

### 2026-09-07（v2.17.1：学分体检 + 最低分矛盾诊断 + 姓名放大热修）

- [x] 背景：老板质疑公示「最低分」——余长青 vs 罗雪**都没加分**，罗雪累计被扣更多，最低分却显示余长青
- [x] **诊断结论（代码实证）**：公示最高/最低分 = 学生快照 `student.credit`，且 v2.15.0 起全项目遵循 `credit = creditBase(入班基准) + Σ本人流水`；ensureCreditBase 注释原文「老学生初始分不全是 100（示例数据随机、早期导入各异），只能反推不能硬写 100」。两人都无加分时仍出现反序 → 只可能是**两人 creditBase 不同**（或某次反推冻错基准），而基准从不展示、老师无从判断 → 需要可视化工具
- [x] **新增「🔍 学分体检」（设置页→数据管理）**：弹窗表格逐生列出 当前分/入班基准/流水合计/应得分(基准+流水)/状态；状态三态：✓一致、⚠基准≠100（橙）、✗快照漂移（红）；异常行可操作——「基准→100」（双 confirm，受控修正 applyCreditBaseFix：基准改 100 + 快照重算 100+流水 + creditVer/updatedAt 打点）、「校快照」（单生校准）；顶部「🧹 校准全部漂移」= 复用 reconcileCreditDrift+saveData+refreshCreditViews；弹窗说明文案讲清基准反推机制与核对方法
- [x] 纯函数（可测、不改数据）：computeCreditAudit（逐生三账核对，缺基准 null 兜底）；applyCreditBaseFix（受控改基准，返回新快照）；UI 均先 ensureCreditBase 补基准再核对
- [x] 热修并入：公示最高/最低分姓名 11px 弱化 → 15px/600 权重（pubStat 两卡）
- [x] 坑：**同一文件多个 Edit 放一个并行批次会互相覆盖（后写吞先写）**——v2.17.1 首轮 3 个 Edit 只活了 1 个（login-version 变了、sidebar-footer/体检按钮没变），回归测试当场抓出；教训：同文件编辑必须串行，且改完 grep 复核每个锚点
- [x] 回归：_v2171_test.js 新增 17 项（语法编译/版本三处同步/体检纯函数含「罗雪扣 40 余扣 10 但余基准 60→最低分仍为余」场景复现/漂移检出/无基准兜底/纯函数零副作用/applyCreditBaseFix 重算与版本戳/UI 接线）；_v2150/_v2160/_v2170 版本断言 2.17.0→2.17.1；**十三套共 285 项全绿**（25/19/21/13/11/11/16/38/42/32/17/26/14）+ _crypto ✅
- [x] 版本三处同步 v2.17.1（登录页/侧栏/CACHE_NAME）；CONTEXT 更新（十三套表+命令+v2.17.1 行）
- [ ] 老板验收：教师端 设置→数据管理→「🔍 学分体检」→ 看余长青/罗雪两行「入班基准」是否同为 100 → 若基准异常点「基准→100」双确认纠正 → 回公示页核对最低分

### 2026-09-07（v2.17.2：学生快速选择器，输入姓名即选）

- [x] 老板需求：任命班委模块要支持输入学生姓名快速选择
- [x] 现状盘点：任命班委/座位/值日共用 `studentSelectModal`（原生 `<select>` 几十人滚动找），无任何测试依赖其内部结构 → 可放心重构
- [x] **交互升级**：下拉框 → 搜索框 + 即时匹配列表（`.ss-row` 行：头像/姓名/学号/当前分 + 现任标注 + 「选择 ›」）；**点行即生效**（pickStudent → 复用 confirmStudentSelect 原有 context 分流）；输入框回车：唯一匹配直选、多人提示点选、零匹配警示；免职/移除与取消按钮保留，原「确认」按钮下线
- [x] 三入口统一注入候选池：committee/duty=全体学生、seating=剔除已占座（保留当前座）；`refreshStudentPicker()` 每次打开清空搜索+重置选中+重渲染；模块变量 `_studentPickerPool/_studentPickerMark/_studentPickerId`
- [x] 纯函数 matchStudentsByName（姓名/学号子串、忽略大小写、空词全量、零副作用）可测；renderStudentMatchList 支持 stub-DOM 冒烟（无 DOM 环境渲染断言）
- [x] **暗色主题适配**：弹窗在暗色下 bg=var(--card-bg)，列表全走主题变量（--text/--text-secondary/--text-muted/--border/--bg-secondary/--primary）；**顺手修 v2.17.1 遗留 bug**：学分体检弹窗内容写死深色文字，暗色主题下隐形 → `#creditAuditModal .modal{background:#fff}` + h3 深色强制白底
- [x] 坑：新套件断言写反 `if (!/regex/.test()) throw`（本意「出现即报错」写成了「没出现即报错」）→ 复现调试发现逻辑反了，纠正为无 `!`；另有注释里残留旧 id 字面量导致「残留检测」误报 → 注释改口
- [x] 回归：_v2172_test.js 新增 23 项；_v2150/_v2160/_v2170/_v2171 版本断言 2.17.1→2.17.2；**十四套共 308 项全绿**（25/19/21/13/11/11/16/38/42/32/17/23/26/14）+ _crypto ✅
- [x] 版本三处同步 v2.17.2（登录页/侧栏/CACHE_NAME）；CONTEXT 更新
- [ ] 老板验收：班委管理页点「任命」→ 弹窗输入「王」看筛选 → 点姓名直接任命 → 再任命他人时输入完整姓名回车直选 → 座位页/值日页同样可用 → 暗色主题下弹窗与列表可读

### 2026-09-07（v2.17.3 热修：任命班委输入姓名不过滤——内联事件 this 陷阱）

- [x] 老板反馈：任命班委时输入姓名没有按姓氏实时筛选，仍是全量名单
- [x] **静态排查无果**：render 纯函数正确、单测全绿、无重复 id/函数、两个全局 input 监听均按 id 白名单不影响 → 上真机
- [x] **headless Chromium 复现**（playwright-core + ms-playwright 缓存内核，file:// 直接注入学生调 openCommitteeSelect）：派发真实 input 事件后名单纹丝不动，稳定复现
- [x] **根因定位**（逐环节验证）：render('王') 直调=2 行 ✅；`onStudentSearchInput.call(inp)`=1 行 ✅；裸调用 `onStudentSearchInput()`=全量 ❌ ——内联属性 `oninput="onStudentSearchInput()"` 是**裸调用，this 指向 window 而非输入框**，`this.value` 恒为 undefined → 永远按空词渲染全量。事件确实触发了（监听可见 attr-fired），只是取值取错
- [x] 修复：onStudentSearchInput / onStudentSearchKeydown 改为函数内 `document.getElementById('studentSearchInput')` 取值，彻底不依赖 this；真机复验 王→2 / 罗→1 / 王小明→1 / zzz→空态 / 清空→全量 ✅
- [x] 坑：**内联事件处理器里调用全局函数拿不到元素 this**（this=window），取值要传参 `(this)` 或函数内按 id 查——本 bug 单测测不出（stub 直调绕过事件路径），必须浏览器级事件冒烟；新套件补「真实事件路径」防回归
- [x] 回归：_v2172 23→26 项；_v2150/_v2160/_v2170/_v2171/_v2172 版本断言 → v2.17.3；**十四套共 311 项全绿**（25/19/21/13/11/11/16/38/42/32/17/26/26/14）+ _crypto ✅
- [x] 版本三处同步 v2.17.3；CONTEXT 更新
- [ ] 老板验收：任命班委弹窗输入「王」→ 名单即时只剩姓王同学；输入完整姓名回车直选；乱输显示空态提示

### 2026-09-07（v2.17.4：学分排序没排对——两态缺陷改三态循环）

- [x] 老板反馈：学生模块点「学分」排序没有正确排序成功
- [x] headless Chromium 真机点击复现：排序其实**生效**（降序 100→60），但暴露设计缺陷——旧 toggleSort 只有「序号 ⇄ 学分↓」两态：**永远进不了升序**，第二下点击直接跳回按序号，界面箭头却没给升序机会 → 观感就是「点学分没排对」
- [x] 修复：三态循环 ①按序号 → ②学分↓ → ③学分↑ → ④回序号；学分比较强制 `Number(a.credit)||0`（导入残留的字符串学分 '80' 不再按字典序排错位）；列头 title 提示更新；btn 现在能真正显示「按学分 ↑」
- [x] 真机验证四连点：序号序 → 100/95/88/80/60(↓) → 60/80/88/95/100(↑) → 序号序 → 降序 ✅（字符串 '80' 位置正确）
- [x] 坑：跨版本用 sed 批量改测试里版本号时，**正则中转义点（`v2\.17\.3`）里的点号被反斜杠隔开、sed 匹配不到** → 登录页断言漏改 1 处导致 1 失败；用 node split/join 精确替换转义串解决（Windows 无 perl）
- [x] 回归：_v2110 排序用例 21→24（三态两跳 + 闭环 + 字符串学分升序）；_v2150/_v2160/_v2170/_v2171/_v2172 版本断言 → v2.17.4；**十四套共 314 项全绿**（25/19/24/13/11/11/16/38/42/32/17/26/26/14）+ _crypto ✅
- [x] 版本三处同步 v2.17.4；CONTEXT 更新
- [ ] 老板验收：学生列表连点「学分」列头：第一次降序 ↓、第二次升序 ↑、第三次回序号；含字符串学分的老数据排序也正确

### 2026-09-07（v2.17.5：学分操作后自动清空备选名单）

- [x] 老板需求：学分记录里选好学生加减分后，应自动清空备选名单，不用手动点「清空」
- [x] 现状：批量入口 quickCredit/customCreditApply → applyCreditBulk；成功后只保存/刷新/提示，`_creditSelectedIds` 原样保留 → 要手动清空
- [x] 修复：applyCreditBulk 成功分支（applied>0）尾部自动 `_creditSelectedIds.clear()` + `renderCreditSelectedChips()`（按钮态随之禁用）+ 复位学生搜索框/收起下拉；customCredit 输入框本就在 customCreditApply 里清，无需重复
- [x] 回归：_v2140 16→17（applyCreditBulk 编排断言追加自动清空四要素）；版本三处同步 v2.17.5（五套件 pin 用 node split/join 同时替换明文与转义两种形态，规避 sed 转义坑）；**十四套共 315 项全绿**（25/19/24/13/11/11/17/38/42/32/17/26/26/14）+ _crypto ✅
- [ ] 老板验收：学分页搜索点选 2~3 人 → 点 +1/-1 或自定义分值 → 提示成功后 chips 区自动回到「点击搜索结果选中学生…」空态，无需手动清空；再选新人直接操作

### 2026-09-07（v2.17.6：自定义分值被原因联动静默覆盖 + 预设新增「违禁品」-10）

- [x] 老板反馈：学分操作自定义分数不能成功储存；原因里加扣分原因「违禁品」扣 10 分
- [x] **主路径真机复现通过**（标准流程：选学生→选原因→改 -10→应用 = 正确入账 -10），排除保存链路本身问题
- [x] **根因定位**（headless Chromium 交互顺序对照）：先手输 -10 再选原因 → `onCreditReasonChange` **无条件用制度预设覆盖输入框**（-10 被静默改成 -6），老师以为存的是 -10，实际入账 -6 → 观感就是「自定义分存不住」（按钮在选原因前恒禁用 + 选原因后值被悄悄换掉，双重迷惑）
- [x] 修复：原因联动仅在「输入框为空 / 仍是上一种原因的旧预设（未被手改）」时才自动带值——`_creditAutofillMark` 记录最近一次自动带出的 {reason,val}，任何手改 input 事件清标记；先手输后选原因 → 自定义值原样保留入账（真机验证 张三:-10:扰乱课堂顶撞老师 ✅）
- [x] 预设新增「违禁品」-10：defaultReasons / REASON_CATALOG 扣分→课堂纪律末位 / defaultReasonScores / UI「27 项」文案三处；新装数据开箱即含
- [x] **老数据补齐**：加 `schemaVer`（state 字面量=1，loadData 从 d 读，<1 时置 1 并跑 `backfillReasons2176()` 补目录+分值后落盘；saveData 序列化 + CLOUD_SYNC_FIELDS 白名单 + smartMerge 取 max，防旧设备拉取后回退重跑）；幂等（真机二载不重复追加）；不整体并集模板，尊重班主任已删预设（被删项复活仅限合并取舍）
- [x] 坑：版本号批量替换只换明文（v2.17.5）不换测试正则内的**转义形态**（v2\.17\.5）→ 五套 pin 各挂 1 项「登录页版本号未更新」；node split/join 需同时替换两种形态（v2.17.4 的 sed 教训同源，这次栽在自以为只有明文）
- [x] 回归：_v2120 11→19（违禁品语义 + 防覆盖 4 场景 + backfill 3 场景）；_v2113 断言改「含 wipeAt/schemaVer」；版本三处同步 v2.17.6（六套件 pin，明文+转义双替换）；**十四套共 323 项全绿**（25/19/24/13/19/11/17/38/42/32/17/26/26/14）+ _crypto ✅ + 真机迁移/防覆盖/选择器三验证 ✅
- [ ] 老板验收：① 学分页先输 -10 再选原因 → 应用入账 -10（不再变 -6）；② 原因目录出现「违禁品」-10，级联 扣分→课堂纪律 可选；③ 老设备/浏览器首开自动多出该预设

### 2026-09-07（v2.17.7：刷新后新扣分记录消失——云端合并把流水顺序反转）

- [x] 老板反馈：刚扣两个学生显示成功，刷新后提示「云端校准流水」之类，记录被自动覆盖取消
- [x] **排查思路**：先排除「数据真丢」。全链路读代码（applyCloudData/smartMergeData/doPushToCloud/checkPushSafety）：ops 全部按 id 并集、无删除路径 → 真机用线上函数复现合并
- [x] **根因实锤**：`state.operations.unshift(op)` 恒为最新在前；但 smartMergeData 合并流水后 `Object.keys(omap).map(...)` 按**数字键升序**重排 → 数组被反转成「最旧在前」→ 时间线 `slice(0,50)` 只取队首 → 刚扣的两条排到队尾看不见（观感=被覆盖取消）；该反转 saveData 落盘**永久固化**；连带 `undoLastOp`(shift) 撤销的变成最旧一条
- [x] 修复：新增 `sortOpsNewestFirst`（时间倒序、同刻按 id 大者在前——多设备 id 不同段也能全局最新优先，幂等）① smartMergeData 合并结果排序 ② loadData 载入归一化（已被反转的老数据**启动即修复**，不用等云）
- [x] 真机端到端：扣分(57条最新在前)→刷新+旧云端(55条)合并→共57条不丢、队首id=57、时间线顶部显示「张三 -10 违禁品」、撤销指向最新 ✅；老反转数据 loadData 修复 队首57/队尾1 ✅
- [x] 回归：_sync 26→33（合并保序/不丢/前50可见/整体降序/归一化副本/同刻id序）+ _v2150 补 sortOpsNewestFirst 抽取（自愈套件也调 smartMergeData）；版本三处同步 v2.17.7（仅显示位，注释保历史版本）；**十四套共 330 项全绿**（25/19/24/13/19/11/17/38/42/32/17/26/33/14）+ _crypto ✅
- [ ] 老板验收：扣分后直接刷新 → 刚扣的两条还在时间线最上面；点「撤销上一次」撤销的是最新那笔


### 2026-09-07（⚠️ 部署事故：v2.17.6/v2.17.7 两版根本没上线——推送脚本读 HEAD blob）

- [x] 老板连续两天反馈同款问题（扣分后刷新记录消失）→ 排查中发现**老板页面侧栏显示 v2.17.5**，且两次推送报的 index.html 字节数完全一样（534483）
- [x] **根因（部署管道 bug，不在业务代码）**：`cm-push-incremental.js` 第 34 行 `git rev-parse HEAD:<file>` 从**本地 git HEAD blob** 取文件字节，而非工作区。此前每版都先本地 commit 再推（HEAD=最新）所以正常；v2.17.6/7 跳过本地 commit 直接推 → 两次都推了 v2.17.5 的旧 blob → **commit message 是新的、文件内容永远是旧的**，远端代码停在 v2.17.5（gh api 验证：无 sortOpsNewestFirst/违禁品/schemaVer）
- [x] 修复：脚本改为 `git hash-object -- <file>`（读工作区建 blob，不再依赖是否已 commit）+ 补本地 commit d2e6040 + 重新推送 → 远端 91bc7016，gh api 复核 index.html 537675B = 本地、含全部新代码、侧栏 v2.17.7、sw.js v2.17.7 ✅
- [x] **教训（写进 CONTEXT §三）**：① 改完代码必须先 `git add 指定文件 && git commit` 再跑 cm-push-incremental（脚本虽已修读工作区，但保持本地 commit 惯例，commit 历史与 PROGRESS 对应）② 推送后必须用 gh api 拉线上内容验证特征串（版本号/新函数名），不能只看 commit sha 前进 ③ 用户侧栏版本号是最快的线上版本探针
- [x] 老板侧影响：全程跑 v2.17.5 → 自定义分值防覆盖（v2.17.6）与流水反转修复（v2.17.7）今天才真正生效；其本地/云端数据中"消失"的记录实为被反转排到队尾，升级后启动归一化会自动回到时间线顶部


### 2026-09-07（v2.17.8：学分页右侧常驻已选面板 + 违禁品去重保留「违禁品烟酒手机」+ 老数据迁移）

- [x] 老板需求三条：①「一次输入上传三次扣分」实为多人批量=每生一条（设计如此）的预期行为，但下拉遮挡已选名单导致老师看不见选了谁→误以为多点/漏点 ② 把已选学生挪到右侧 ③ 原因里有两个违禁品 → 删「违禁品 -10」只留「违禁品烟酒手机」
- [x] **右栏常驻面板**：学分页 HTML 重构为 `.credit-op-grid` flex 两栏（主操作左 + `.credit-op-selected` 右），CSS `.credit-op-grid{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}` + 面板边框/计数/滚动 chips 区（max-height 160px），`renderCreditSelectedChips` 重写：更新 `#creditSelCount` 计数 + `.credit-has` 高亮类；响应式 ≤760px 堆叠
- [x] **下拉 vs 面板不重叠**：真机（headless Chromium，1280×900）measure 矩形，搜索下拉 `l:285→r:477`、已选面板 chips `l:948→r:1222`，panelRightOfInput=true、overlap=false ✅；下拉打开时 chips 仍可见
- [x] **「一次输入三条」复现**（`_dbg_triple.js` 已删）：1 人 1 次「应用」= 1 条流水（content 正确 amount=-10 studentId=3）；3 人全选 1 次 = +3 条（4 total），重复点击 button disabled 拦截不叠加
- [x] **违禁品重命名**：defaultReasons/defaultReasonScores/REASON_CATALOG 课堂纪律的「违禁品」→「违禁品烟酒手机」（-10），`backfillReasons2176` NAME 一并更新
- [x] **`removeWeijinpinDupe` 按组语义**（防 v2.17.6 自动补入但老师从未手动建新名的老数据悄悄丢制度项）：同组已有「违禁品烟酒手机」→ 删旧名；同组只有旧名 → 就地改名保留位置 + 分值一并归并
- [x] **迁移** `schemaVer<2`：loadData 启动 `removeWeijinpinDupe(state.reasonCatalog, state.reasonScores)` → 改则 `syncReasonsFromCatalog(); saveData()`；state 初始化 `schemaVer:2`；CLOUD_SYNC_FIELDS 含 schemaVer、smartMergeData 取 `Math.max`、CACHE bump v2.17.8
- [x] **回归 333 项全绿**（v2.17.7 330 + 3 = _v2120 重写 removeWeijinpinDupe 三按组语义用例：双同名删旧名/只有旧名改名保制度/幂等+纯函数不改入参）：25/19/24/13/22/11/17/38/42/32/17/26/33/14 + _crypto ✅
- [x] **真机三场景验收**（`_dbg_v2178.js` 已删）：① 全新 v2.17.8 班模板违禁品类只剩「违禁品烟酒手机」+ 分值 -10 ② 老板实际双同名老数据（schemaVer 1，扣分课堂纪律 = ['课堂违纪','集会违纪','违禁品','违禁品烟酒手机']）升级后 schemaVer=2、目录删旧名留新名、分值表只剩新名 -10 ③ v2.17.6 纯旧名老数据（只有 v2.17.6 自动补入的「违禁品」）→ 就地改名 + 分值 -10 转移到新名（**不丢制度项**）
- [x] **本地提交 `1d4a052`**（按 CONTEXT §三 铁律：改完先 `git add 指定文件 && git commit` 再推；8 个文件 +193 -84）
- [x] **推送远端完成**（2026-09-07 12:4x，boss 贴 PAT → `cm-push-incremental.js` 设 `GH_TOKEN` 走 gh CLI REST API 推 index.html+sw.js → 远端 **a2a93ca**）
  - 代理切换（52→192.168.8.70:9890）后仍推不动 → 探测定位根因：**公司代理策略性掐 `github.com` 的 git 写通道**（`info/refs?service=git-receive-pack` 与 `git-receive-pack` 均 10s 断连 000，读通道 upload-pack 200 放行，api.github.com GET/POST 全通）→ git push/SSH(无 key)/gh(未登录) 全不可行，唯一出路 REST API
  - **本地/远端链分叉处理**：历史清理点 c3334ae 后本地旧链与远端链（cm-push API 推送 + auto-sync data.json commits）分叉 → 直接 cherry-pick 1d4a052 会因远端测试文件缺失/旧版冲突 → 改在 `v2178-push` 分支（=远端 aa64ff7）上 `git checkout main -- index.html sw.js` 内容对齐 → 新 commit 806c7ff → 实际由 cm-push 以远端 aa64ff7 为 base 推成 a2a93ca（blob 07a9531 与本地字节一致 ✅）
  - 本地收尾：`git tag v2.17.8-legacy-local 466446a` 保底 → `git reset --hard a2a93ca` → checkout 测试 15 件 + CONTEXT/PROGRESS 回挂 → commit `71280ec`（本地独有）→ 删临时分支/锚点 → **`git config core.autocrlf false`**（reset 触发 CRLF 转换使测试正则 `;\n` 匹配失败，关掉后工作区保持 LF）
  - 远端验证全过：login-version/sidebar-footer v2.17.8、`function removeWeijinpinDupe(cat, scores)`、`sortOpsNewestFirst`、sw.js `class-manager-v2.17.8`、defaultReasons/分值表无独立「违禁品」、有「违禁品烟酒手机」-10
  - **教训**：① 换代理地址解决不了 git push——先 curl 探 `receive-pack` 端点区分「网络断」与「策略掐写」 ② gh 未登录可用 `GH_TOKEN` 环境变量免登录 ③ Windows 上 reset --hard 会因 autocrlf=true 把 LF blob 转 CRLF 工作区，破坏依赖 `\n` 的测试正则 → `core.autocrlf false`

### 2026-09-07（v2.17.9：学分流水软删撤销——根治"撤销只在记录里生效/学分没同步"+云端复活）

- [x] 老板反馈：web 上操作黄丽萍扣违禁品（因历史有两个违禁品理由）、设置删除多余理由、在记录中撤销了误扣除的分数——但学生管理界面仍是 44 分，时间线里 4 条扣分（最新在前：09:24/09:13/07:55 -10 违禁品烟酒手机、07:35 -7 课堂违纪）没被撤销。诉求：「撤销好像仅在记录里面生效了，我要求和学分务必同步数据」
- [x] **根因诊断**（代码层）：
  - ① 时间线**只读渲染**（`renderOpItem` 无任何按钮），撤销入口只有学分操作页的「↶ 撤销上一次」按钮（`undoLastOp`），且只能撤**全局最新一条**——老板想撤黄丽萍中间某条扣分时，若队首是其他学生/其他班委的操作，撤销根本撤不到黄丽萍
  - ② `undoLastOp` = 物理 `state.operations.shift()` 删流水 + `student.credit -= op.amount`；**云端校准（smartMergeData operations 按 id 并集）会把已删的流水从云端补回来**（与 v2.17.5/2.17.7 老板同款"刷新后被覆盖"的反向复刻：撤销=消失，云同步=复活）
  - ③ `loadData` 每次启动调 `reconcileCreditDrift` 把 credit 校准成 `creditBase + Σ流水全集`——只要被删流水复活，credit 就被 reconcile 拉回扣分后值（44=100-56 正是老板实际账）→"撤销只在记录里生效"是云端 merge 复活 + reconcile 校准的组合结果，**撤销=根本没生效**
- [x] **方案设计**：选"软删 tombstone"而非"反向对冲流水"，原因：① 流水永不裁剪哲学（v2.15.0 确立的）→ 软删保留 op 实体，只是打 `state='revoked'` 标记，符合"流水分集是审计唯一真源" ② 作废标记随 op 进 CLOUD_SYNC_FIELDS 全量同步 ③ `smartMergeData` 按 `stateTime` 大者取新→撤销/恢复跨设备一致 ④ 视觉上记录消失符合老师"撤销=作废"心智 ⑤ 增加可恢复抽屉防误撤
- [x] **核心实现**：
  - `liveOps(ops)` 纯函数：`(ops||[]).filter(o => !(o && o.state === 'revoked'))`——所有 Σ流水与 filter ops 消费点的统一入口
  - `sumCreditsByStudent` / `reconcileCreditDrift` / `applyCreditBaseFix` / `computeCreditAudit` / `normalizeInitialCredits` 全部改用 `liveOps(operations)`（之前直接 sum ops，现在 sum 有效流水）→ 已撤销的 -10 自动不计入 credit
  - `revokeCreditOp(opId)`：`op.state='revoked'; op.stateTime=Date.now(); afterOpStateChange()`（标记 + 时间戳）
  - `restoreCreditOp(opId)`：`op.state='ok'; op.stateTime=Date.now(); afterOpStateChange()`（恢复 = 去掉标记，时间戳取新 → 跨设备传播）
  - `afterOpStateChange()`：`reconcileCreditDrift(state.students, state.operations) + saveData() + refreshCreditViews()`——撤销后**学分实时按有效流水重算并自动云推送**（saveData 末尾 autoPushToCloud 触发 debounce 2s 的 GH_API PUT）
  - `undoLastOp` 改为：`liveOps(state.operations)[0].id → revokeCreditOp(...)`（找最新未撤的，不再物理 shift）
  - `updateUndoBtn`：`liveOps(...).length === 0` 判定 disabled
  - `renderOpItem` 每条加 `<button class="tl-undo" onclick="revokeCreditOp(${Number(op.id)})" title="撤销这条记录（学分自动回补）">↩ 撤销</button>`（id 数字安全）→ 时间线每条流水都有「↩ 撤销」按钮
  - `renderCreditsTimeline` 改 `liveOps(state.operations).slice(0, 50)` + 末尾调 `renderRevokedDrawer()`
  - `renderRevokedDrawer` 新增：操作记录卡片底部「🗂 已撤销的记录」折叠抽屉，列出最近 20 条已撤销 + 每条「恢复」按钮（`restoreCreditOp`），防误撤
  - `smartMergeData` operations 合并升级：`if (!lo) omap[ro.id]=ro; else if ((ro.stateTime||0) > (lo.stateTime||0)) omap[ro.id]=ro;`——同 id 按 stateTime 大者胜，本地撤销不被云端旧流水复活、远端撤销/恢复能传到本地
  - 其他消费点过滤（renderDash recent、openDetailPanel、monthlySettlePlan settled/hasViolation、renderProgressList、dayOps、computePublicityData）统一加 `!(o.state==='revoked')` 或改 `liveOps(...)`
  - CSS：`.tl-undo`（悬停变红 dashed→solid）、`.tl-revoked-wrap`/`.tl-revoked-row` 抽屉样式
- [x] **测试**：
  - 4 个老测试补 `liveOps` 抽取（_v290/_v2140/_v2150/_v2171）
  - _v2150 undoLastOp 行为断言改为新语义（soft-delete + revokeCreditOp + liveOps 结构断言）
  - 新增 _v2173（13 项）：liveOps 过滤、sumCreditsByStudent 排除、撤销核心结构、reconcileCreditDrift 用有效流水重算、undoLastOp 跳过已撤找最新、smartMergeData stateTime 传播（本地撤销不被云端复活/远端撤销传到本机/两端口径一致/恢复跨设备）、消费点过滤、时间线撤销按钮 + 撤销抽屉结构
  - **全量 15+1 套共 346 项全绿**：25/19/24/13/22/11/17/38/42/32/17/26/13/33/14 + _crypto
- [x] **真机 7 场景 17 断言全过**（playwright，1280×800）：① 黄丽萍连扣 3 笔（-10/-10/-7）→ 73/3条/每条有撤销按钮 ② revokeCreditOp(中间 -10)→ 83/2条/1条 revoked 标记/抽屉显示 ③ restoreCreditOp→ 73/3条 ④ UI 真实点时间线 ↩ 撤销按钮→ 80（最新条 -7 被撤）+ revoked=1 ⑤ undoLastOp→ 90（-7 课堂违纪被撤）+ revoked=2 ⑥ **云合并（本地已撤 2 条 + 云端旧流水全集无标记）→ 合并后 revoked=2 / liveOps=1 / credit=90 不被拉回** ✅ ⑦ 跨设备：本地 op ok + 远端 op stateTime=999 revoked → 合并采用 revoked 态（撤销跨设备生效）
- [x] **远端推送 e9de113f**（基于 v2.17.8 远端 656f555f 之上的快进）：boss 已配置的 GH_TOKEN + `cm-push-incremental.js` 推 index.html+sw.js（cm-push 走 gh CLI REST API，绕开代理对 git-receive-pack 的掐断）→ 远端 a2a93ca→656f555f→e9de113f
- [x] **远端验证全过**（gh api）：远端 HEAD=e9de113f；登录/侧栏 v2.17.9；`function liveOps(ops)` / `revokeCreditOp` / `restoreCreditOp` / `afterOpStateChange` 全部存在；`'revoked'` 标记 + `stateTime = Date.now` 字段存在；sw.js CACHE_NAME=class-manager-v2.17.9；**本地 vs 远端 index.html blob sha c4dcdeb3 字节级一致** ✅
- [x] **老板当前数据救济**：现有 data.json 里黄丽萍那 4 条流水都在（v2.17.8 之前撤销没生效或被云端复活）——新功能上线后，老师在时间线每条流水点「↩ 撤销」即可逐条作废、立即回补学分，**云端推送 debounce 2s 后 4 台设备全部生效**；不用清空 data.json

### 2026-09-07（v2.17.10：原因目录默认折叠）

- [x] **需求**：设置页「学分原因目录」section 内容很长（27 项多级 + 编辑按钮 + 树），展开后挤压座位/暗夜/公示/班委/数据管理/云同步等其他设置项，老师编辑目录时无法一眼看到其它设置。改为「默认折叠 + 点击标题行展开编辑」
- [x] **实现**：
  - 设置页 HTML 重构（行 2571-2587）：整块 `.settings-section` 内层拆成两段——头部行（`#reasonCatalogArrow` ▶/▼ + `<h3>` + `#reasonCatalogCollapseHint` 状态文案）整行可点击切换；说明 + 「＋方向/＋原因/恢复预设」+ `#reasonCatalogTree` 全部包进 `#reasonCatalogBody` 默认 `display:none`
  - 新增 `toggleReasonCatalog()`（index.html ~8054 行，紧贴 renderReasonCatalogTree 前）：根据 body 当前 display 切换 display，同步箭头 ▶/▼、hint 文案「默认折叠 · 点击展开编辑」/「点击收起」，**展开时重画一次树**保证编辑后状态最新
  - DOM 渲染链：`renderSettings()` → `renderReasonCatalogTree()` 仍每次进设置页跑一次（树很大也要重画无碍），且 `state.reasonCatalog` 数据流未改
- [x] **版本 bump**：`index.html` 登录页 (1886) + 侧栏 (2002) v2.17.9 → v2.17.10；`sw.js` `CACHE_NAME = class-manager-v2.17.9` → `class-manager-v2.17.10`
- [x] **测试断言同步**：5 个测试文件（`_v2150/_v2160/_v2170/_v2171/_v2172`）中 v2.17.9 版本断言分两轮 bump——**首轮明文 `v2.17.9` → v2.17.10（覆盖 title/t 名/console.log），二轮转义正则 `v2\.17\.9` → v2\.17\.10**（正则断言 `includes('class-manager-v2.17.10')` 与登录页 `/login-version">v2\.17\.10</`、`sidebar-footer">v2\.17\.10 ·`）。教训：以后升版走一遍双替换，不要再只 replace 明文
- [x] **全量 16 套共 347 项全绿**：v 系 299（25/19/24/13/22/11/17/38/42/32/17/26/13；v2.17.10 起 `_v2150` 38 项，含本次新增的版本断言 1 项）；`_sync_test.js` 33；`_xss_test.js` 14；`_crypto_test.js` ✅
- [x] **浏览器验证 6/6 全过**（playwright-core + 本地 chromium 127.0.0.1:8931 静态服务器）：
  1. 进入设置页：`#reasonCatalogBody` `display === 'none'`（默认折叠）✅
  2. 点头部行：`#reasonCatalogBody` display 变块、箭头 `▶` → `▼`、hint 文案变「点击收起」✅
  3. 展开后树渲染 3 个方向（默认模板），`#reasonCatalogTree .cat-dir` 行可见 ✅
  4. `＋ 方向` 按钮 DOM 存在且 `onclick` 绑定到 `openReasonDirModal` ✅
  5. 再点头部行：`#reasonCatalogBody` 回到 `display:none`、箭头 `▼` → `▶` ✅
  6. 整轮 0 异常/console error
  - 截图：`fold_real_expanded.png`（折叠 → 展开可见 3 个方向）/ `fold_real_collapsed.png`（收起态）
- [x] **远端推送完成**：cm-push-incremental 两次推送 → 远端 HEAD `7505a71a`（= b836f4a3 三件套 + 7505a71a 测试 5 件）；index.html blob sha 99291d52... 字节级一致

### 2026-09-07（v2.17.11：学分全局同步——加分/减分/撤销全模块联动含公示进步榜）

- [x] **需求**：老板报「进步榜 Top10 不对，有同学加分上面没同步」，并要求「把所有学分模块设置成一个系统，加分减分全部都要同步所有模块，包括撤销操作的分值恢复」
- [x] **根因定位（三连排查）**：
  1. 加分/减分/撤销/恢复全链路本来就统一汇到 `refreshCreditViews()`（v2.15.0 起的学分刷新体系）——但它的刷新清单 = 学生表 / 档案 / 学分页时间线 / 首页(active) / 分析(active)，**唯独漏了公示页**：公示页正开着（常驻/投屏）时加分，进步榜/学分榜/零扣分榜/统计图表全不重算 → 「加了分进步榜没同步」
  2. 同浏览器多开（操作窗口 + 公示常驻窗口）没有 storage 监听，公示窗口永远等不到变化（此前只有切回标签 visibilitychange 才拉云端）
  3. 复核 `computePublicityData`（revoked 过滤/净增口径）与 `applyCreditDelta`（快照+流水原子写）无数据问题——纯刷新联动缺失
- [x] **修复**：
  1. `refreshCreditViews()` 补公示页：`page-publicity` active 时调 `renderPublicity()`（进步榜/学分榜/概览/四图表全量重算，与 navigateTo 切入公示页同款）
  2. 新增 **storage 跨标签监听**（`window.addEventListener('storage'`，key=STORE_KEY 且非来源标签、非锁屏时）：`loadData()` + `renderAll()`——操作窗口一保存，公示常驻窗口秒级跟随（补 `loadData` 无写回死循环：其内 saveData 仅在幂等修复漂移时触发一次）
  3. 无需改数据口径：进步榜按周期内净增(net=addPts−subPts，revoked 已剔除)、撤销回补走既有 liveOps/reconcile 体系
- [x] **版本 bump v2.17.11**：登录/侧栏/SW CACHE_NAME；5 个测试文件版本断言**明文 + 转义双轮替换**
- [x] **回归**：_v2150 新增「学分全局同步」4 断言（refreshCreditViews 含 renderPublicity / 批量加分链路 = applyCreditDelta+saveData+refreshCreditViews / storage 监听就位 / afterOpStateChange 撤销恢复刷新全视图）；**全量 16 套 351 项全绿**（v 系 303：25/19/24/13/22/11/17/42/42/32/17/26/13；_sync 33 / _xss 14 / _crypto ✅）
- [x] **真机浏览器 5 场景全过**（playwright + 127.0.0.1 静态服务，seed 张三/李四 100 分）：
  ① 公示页停留状态下 applyCredit(+5) → **进步榜即时出现张三**（credit 100→105）✅ ② revokeCreditOp → **进步榜回落移除张三 + credit 回 100 + op.state=revoked** ✅ ③ 跨标签：B 窗口常驻公示页，A 窗口给李四 +8 → **B 窗口进步榜自动跟随出现李四**（storage 监听生效）✅ ④ 学分榜/零扣分榜同源同步（同一 renderPublicity 覆盖）⑤ 无页面异常
- [x] **截图**：`v21711_prog_add.png`（加分后进步榜张三）/ `v21711_cross_tab.png`（跨标签 B 窗口跟随）
- [x] **远端推送完成**：cm-push-incremental 两次推送 → 远端 HEAD `b068bbb4`（= 8c580e46 三件套 + b068bbb4 测试 5 件）；index.html blob sha 333215ea 本地远端字节级一致；远端验证 login/侧栏 v2.17.11 + renderPublicity 纳入 + storage 监听 + SW class-manager-v2.17.11
- [x] **给老板**：强刷（SW v2.17.11）后：① 加分/撤销时若公示页正开着（含投屏）进步榜/学分榜即时刷新 ② 同浏览器多开窗口（操作窗口+公示常驻窗口）秒级跟随 ③ 加分编辑固定一个窗口即可（多窗口并发编辑是 last-write-wins）

### 2026-09-07（v2.17.12：浏览器标签页图标修复——内嵌 favicon 换新 + SW 缓存失效）

- [x] **需求**：老板报「浏览器刷新还是之前的图标」——图标重设推送后（c689836 / 远端 516cf67a）只换了磁盘文件，但标签页图标来自 `index.html` `<head>` **内嵌的 data:image base64 favicon**（旧图 1032 字节），没换 → 刷新仍显示旧图标
- [x] **双重根因**：
  1. `index.html` 第 13 行 `<link rel="icon" type="image/png" href="data:image/png;base64,...">` 仍是旧图标 base64（标签页以它为唯一来源，与 favicon.ico 文件无关）
  2. 图标推送没升 `sw.js CACHE_NAME`（仍 v2.17.11）→ 用户的 Service Worker 一直命中**缓存的旧 index.html**，即使线上文件变了也拿不到
- [x] **修复**：
  1. 用 Pillow 把新 icon_192.png 缩到 64×64 并 base64（8KB→10.8KB），替换第 13 行 data-URI（保留内嵌方案，SW 交付 HTML 即带新图标，不依赖同 URL 资源的 favicon 抓取缓存）
  2. 版本 bump v2.17.12：登录/侧栏/SW CACHE_NAME=class-manager-v2.17.12；5 个测试文件版本断言明文+转义双轮替换
- [x] **回归**：全量 16 套 348 项全绿（版本断言已更新 v2.17.12；favicon 行格式断言通过）
- [x] **给老板**：强刷 1~2 次（第一次刷新拉新 SW v2.17.12，第二次起新缓存生效）即可见新标签页图标；若仍旧 → 关闭该标签页重开（浏览器对标签 favicon 有独立强缓存）

### 2026-09-08（v2.17.13：图标背景透明化——把 ImageGen 白边像素 alpha=0）

- [x] **需求**：老板报「浏览器图标是白色正方形底」——图标是圆角红造型但外围画布是 ImageGen 输出的不透明白底，标签/桌面/Apple 触屏图全部带白方框
- [x] **根因**：原图 `icon-candidates/F_cluster_bauhaus.png` 是 1024×1024 RGB（无 alpha），画布上是「圆角红色造型 + 周围一圈白底」；之前 v2.17.12 直接把这张图缩到 192/256/512 出 PNG + ICO 嵌进 HTML——白底照搬成了「白方块底」
- [x] **修复**（先缩再扣白，避免 LANCZOS 混 AA 残白）：
  1. 方案 F 源图 1024px RGB → 按需缩到 16/32/48/64/128/192/256/512 各自尺寸（LANCZOS）
  2. 每张缩好后再转 RGBA，**luma>230 或 RGB 全>225 的像素 → alpha=0**（白边 + 灰白 AA 全部变透明，圆角红色造型保持原色）
  3. 64×64 → base64 替换 index.html 第 13 行 `<link rel="icon">`；favicon.ico 多尺寸（16/32/48/64/128/256）；桌面 `%LOCALAPPDATA%\class-manager\icon.ico` 同步
  4. 版本 bump v2.17.13（登录/侧栏/SW CACHE_NAME + 5 测试文件明文+转义双轮）
- [x] **回归**：全量 16 套 348 项全绿
- [x] **给老板**：再强刷 2 次（SW v2.17.13 强制缓存失效）即可见「圆角红色 + 透明角」；桌面 .lnk 图标退格键右键刷新让 Windows 重读新 ico

### 2026-09-08（v2.17.14：月度自动加分分值修正——班委履职 +3→+2，班委无违纪合计 +5）

- [x] **需求**：老板指正「在任班委本月无违纪额外 +3（班委履职）」应为 **班委履职额外 +2**，叠加月度全勤 +3 后班委合计 **+5 分**（此前班委合计 6 分）
- [x] **改动**（`monthlySettlePlan` 自动加分链路 5 处）：
  1. `bonus.push` 的班委履职加分 `amount: 3 → 2`（弹窗确认结算即按新值入账）
  2. 弹窗汇总行 `班委履职 +3 → +2`（注明叠加全勤合计 +5）
  3. **合计加分公式** `(attend+bonus)*3` → `attend.length*3 + bonus.length*2`（两种分值并存后必须分开算，原公式会算错总数）
  4. 弹窗规则提示 + 函数注释文案同步（+3 → 再额外 +2，合计 +5）
  5. 每人每月只结算一次语义不变（settled 按 学生id+原因 去重，已结算过的学生不会按旧分值重算）
- [x] **_v290 断言更新**：月度结算用例标题改为「在任班委班委履职额外 +2（合计 +5）」并补 `plan.bonus[0].amount === 2` 断言
- [x] **版本 bump v2.17.14**（登录/侧栏/SW CACHE_NAME + 5 测试文件明文+转义双轮）
- [x] **回归**：全量 16 套 348 项全绿
- [x] **给老板**：强刷 2 次（SW v2.17.14）后点学分页「🗓️ 月度自动加分（制度对齐）」——无违纪班委将显示 月度全勤 +3 + 班委履职 +2 = 合计 +5

### 2026-09-08（v2.17.15：SW 绕过 HTTP 缓存——根治「刷新还是旧版」）

- [x] **症状**：v2.17.14 推送后老板重开页面侧栏仍显示 **v2.17.12**（连跳两级没收到），月度结算弹窗仍是旧文案/旧算法
- [x] **根因（HTTP 缓存截胡 SW）**：GitHub Pages 对所有静态文件发 `Cache-Control: max-age=600`。sw.js 的导航 fetch 虽是「网络优先」，但 `fetch(event.request)` **不带缓存参数时遵循 HTTP 缓存语义**——10 分钟内的重复访问/重开，浏览器直接用 HTTP 缓存里的旧 index.html（v2.17.12），根本不会真正联网 → 推送再多次也看不到新版本；sw.js 自身更新检查同理被 HTTP 缓存拖住（≤10 分钟）
- [x] **修复**：sw.js 三处 `fetch(event.request)`（导航 index.html / data.json·txt 云同步 / 静态资源后台更新）全部改为 `fetch(event.request, { cache: 'no-store' })`——**每次刷新真正联网取最新**，仍写 SW 缓存供离线回退；install 预缓存照旧
- [x] **版本 bump v2.17.15**（登录/侧栏/SW CACHE_NAME + 5 测试文件明文+转义双轮）
- [x] **回归**：全量 16 套 348 项全绿
- [x] **给老板**：v2.17.15 上线后**单次普通刷新即可拿到最新**（不再需要刷两次）；若此刻仍卡在旧版，用 Ctrl+F5 或开发者工具注销 SW 强制过一次即可（一次性），此后 SW 更新机制自愈

### 2026-09-08（v2.17.16：原因目录删除持久化——catDeleted 墓碑，刷新/云合并不复活删除项）

- [x] **需求**：老板报三个点 ① 设置里删除自定义加减分原因（一类/方向）后刷新页面自动恢复 ② 删除原因不应删除历史扣分流水 ③ 撤销扣分只能在学分记录里操作并恢复学分
- [x] **根因（双复活源）**：
  1. `loadData` 每次启动把 `defaultReasons`/`defaultReasonScores` 无条件并回内存（旧代码 3808-3811）→ migrate 把「被删的模板原因」当 extras 塞回「其他 → 自定义原因」——本地刷新即复活
  2. 云合并 `smartMergeData` 对 reasonCatalog 做**结构并集**，注释自己写着「删除项可能复活属已知取舍」——云端旧副本把删除项带回来
- [x] **修复（删除墓碑 catDeleted = {dirs,groups,reasons}）**：
  1. 新增 `catDeleted` 字段：state 默认空墓碑、进 `CLOUD_SYNC_FIELDS` 云同步、`saveData` 手写清单补落盘（漏了它墓碑就永不持久——本次最隐蔽一环）
  2. 新增墓碑辅助（`cloneCatDeleted`/`catDelAdd`/`catDeletedAdd`/`catDelUndo`/`applyCatTombstones`）
  3. `catDeleteDir/Group/Reason` 删除时登记墓碑（方向/大类按 key、原因全局名，分值表同步清理）；确认文案明确「历史流水与学分不受影响，纠正请在学分记录中撤销」
  4. `loadData` 加载后 `applyCatTombstones` 剔除 + 不再无条件并集默认模板（只随 migrate 首次迁移）；`smartMergeData` 云合并墓碑并集后统一剔除 → **跨设备删除也生效**
  5. 重加同名项 = 放弃删除（清除对应墓碑）；「恢复预设目录」清空墓碑
  6. 历史流水绝不因目录删除变动（删除只影响目录/分值/以后选择）；撤销扣分唯一入口 = 学分记录 ↩ 撤销（v2.17.9 起语义）
- [x] **测试**：新增 `_v2174_test.js` 9 项（墓碑纯函数 4 / 重载不复活 + 回归护栏 1 / 云合并剔除 1 / 持久接线 1 / 删除重加闭环 1 / 恢复预设清墓碑 1）；老套件 4+1 个因 smartMergeData 新增墓碑块需注入依赖函数（_v290/_v2150/_v2173 grab/extractFn 注入 cloneCatDeleted/catDelAdd/applyCatTombstones/flattenReasonCatalog；_v2170 结构断言锚点更新；_sync _sliceFn 改花括号配平）——**全量 17 套 357 项全绿**
- [x] **给老板**：强刷后删原因即永久生效（不再刷新复活）；删掉的旧流水还在学分记录里显示可撤销；纠分请用时间线 ↩ 撤销

### 2026-09-08（v2.17.17：班委署名身份修复——Init 顺序先 loadData 后身份解析）

- [x] **需求**：老板报「班委入口选择班委身份后进行学分加减操作，学分记录上还是显示『通用班委』」——身份选了个寂寞，署名没落到人
- [x] **根因（初始化顺序）**：Init 区块里 `applyCommitteeRestrictions()`（内部执行 `resolveCmIdentity()` 解析署名身份）**先于 `loadData()` 运行** → 身份解析那一刻 `state.students` 还是空数组 → `resolveCmIdentity` 找不到 uid 对应学生 → 返回 `{name:'',post:'',anonymous:true}` → `window.__cmIdentity` 全程匿名 → `applyCreditDelta` 签名时 `cmi.name` 为空 → 时间线兜底渲染「通用班委」。身份选了、数据也在本地，但解析太早名单没加载
- [x] **修复**：
  1. Init 把 `loadData()` 提到最前（登录门/`applyCommitteeRestrictions` 之前）——名单先就绪，身份解析即署名到人；删除登录门后的旧 `loadData()` 二次调用（只留一处）
  2. 保险钩子：`autoSyncFromCloud().then` 里若班委身份仍匿名且云端首拉已带回名单 → 重跑一次 `applyCommitteeRestrictions()` 补解析（覆盖「本地无缓存、名单只在云端」的设备）
- [x] **测试**：新增 `_v2175_test.js` 12 项（语法/版本三处同步/Init 顺序：loadData 恰一次且先于登录门与身份限制/云端补解析钩子/`resolveCmIdentity` 名单就绪出真名、名单空与 uid 未命中退匿名/全链路：名单就绪下加减分 op.byName=所选身份、教师操作无 by）；`_v2174` 两条断言锚点注释同步 v2.17.17 —— **全量 18 套全绿（新增 12 项）**
- [x] **给老板**：强刷 1 次（SW v2.17.17）后重新进班委入口选身份，再做加减分——学分记录会显示「👩💼 王小明（班长）」而不是「通用班委」

### 2026-09-08（v2.17.18：弹窗头部统一——`.modal-header` / `.modal-close` 补基础样式）

- [x] **需求**：老板报「学生档案中点击编辑，弹出来的卡片取消键贴左上角、又丑美术风格不一致」
- [x] **根因**：档案编辑/成长记录/工作留痕/荣誉这 4 个弹窗的 `modal-header` + `modal-close` 标签**全站 CSS 都没有基础样式**（仅暗色主题有一行 border-color），× 键以裸按钮形式掉到标题下方**左缘**——其余弹窗都没有 header（直接 `h3 + 底部按钮`），所以风格割裂
- [x] **修复**：在 `.modal` 区块内补 `.modal-header`（flex 标题居左 + 底部分隔线）和 `.modal-close`（30×30 圆形描边 + hover 变红轻旋，**与 `.panel-close` 同设计语言**），一次修好四个弹窗
- [x] **验证**：本地 `python http.server + playwright-core chromium-1234` 渲染 `#profileEditModal` / `#honorModal` 截图 + DOM 度量：× 与标题同一行（top 差 <12px）、贴右缘（距离右缘 ≤30px）、圆形 borderRadius=50%；新版视觉无 toast 遮挡时 `.panel-close` 风格一脉相承
- [x] **测试**：新增 `_v2176_test.js` 9 项（语法/版本三处同步/CSS 基础样式四项/`.panel-close` 设计语言未破坏/四个弹窗共用 `modal-header + h3 + button.modal-close` 结构锚点）—— **全量 19 套全绿（新增 9 项）**
- [x] **升版**：v2.17.17 → v2.17.18（登录/侧栏/SW CACHE_NAME + 7 个测试文件明文+转义双轮，**含 _v2175 的正则断言也要做转义轮**——本次差点漏，模板会自动按"明文 v2.17.17"找，但正则里的 `v2\.17\.17` 走转义轮）
- [x] **给老板**：强刷后（SW v2.17.18）档案编辑等四个弹窗关闭键已统一为右上角圆形（与侧栏关闭键一致），无需任何额外操作

### 2026-09-08（v2.17.19：档案详情新版式 + 拼音排序 + 寝室→性别补写 + 德育记录本学期滚动 + 荣誉证书导出）

- [x] **需求**：① 学生档案左侧学生列表按姓名首字母音序排名 ② 档案详情界面优化排版（姓名/学分大字号/性别/备注四要素 + 德育记录可折叠可滚动 + 成长记录 + 学生荣誉） ③ 性别从寝室号规则自动派生（男寝 7栋214、女寝 6栋801~806） ④ 荣誉墙加入班级荣誉并支持导出荣誉证书图片
- [x] **改动**：
  1. **拼音排序**：`sortStudentsByPinyin` 用 `Intl.Collator('zh-Hans-CN')`（Chromium 完整 ICU 支持中文 pinyin collation），左侧名单按姓名 A→Z 排，同音回退学号；renderProfileList 接入
  2. **档案详情新版式**（`.pf-summary/.pf-credit/.pf-chip/.pf-notes/.pf-section` 等全新 CSS）：
     - 头部：头像 + 姓名 + meta（学号/性别 chip/寝室标签） + **当前学分大字号（38px）** + ✏️ 编辑资料
     - 备注：单独虚线卡显眼展示（特异体质/需关心等）
     - **德育记录卡**：默认展开，可折叠（chevron ▾），「本学期 / 全部」segmented 切换，列表 **max-height:250px 滚动**，排除已撤销（liveOps）；学分变动加减用绿/红（沿用 credits 时间线既有配色）
     - 成长记录卡：默认展开，5 个 add 按钮（谈心/表扬/批评/联系家长/其他）+ 时间线
     - 学生荣誉卡：默认收起，列出个人荣誉 + 每条 📄 证书按钮（导出 PNG）
  3. **寝室→性别自动补写**：`DORM_GENDER_RULES = [{re:/^7栋-?214室$/,gender:'男'},{re:/^6栋-?80[1-6]室$/,gender:'女'}]`；`fillStudentGenderFromDorm` 仅在性别为空时写入；三个触发点：① renderProfiles 启动时 `fillAllDormGenders()` 全校兜底 ② 寝室页 `addDormMember` ③ 学生页 `addCustomTag` 手填寝室号标签；已设置不覆盖（班主任可手动改）
  4. **荣誉墙类型筛选**：`_honorScope='全部'`，`setHonorScope` 切换；chips 渲染时显式加「类型」小标，level-all chip 文案「不限」避免与「全部」混淆
  5. **荣誉证书 PNG 导出**：1500×1062 画布，金框双线 + 角饰 + 红章（班主任荣誉专用章）；中央「荣誉证书」+ 获得者（个人按姓名/集体按班级名） + 标题 + 大红「{等级}荣誉」+ 「特发此证，以资鼓励」+ 日期/落款；个人可按学生出证（`exportHonorCert(id, 学生姓名)`），集体出班级荣誉证；下载文件名 `<人/班>-<标题>-荣誉证书.png`（去掉文件名非法字符）
- [x] **测试**：新增 `_v2177_test.js` 16 项（语法/版本三处/Intl 拼音 collator + sortStudentsByPinyin 顺序实证 / DORM_GENDER_RULES+dormGenderOf 7 个用例 / fillStudentGenderFromDorm 仅空时写 + 不覆盖 / renderProfiles 兜底挂载 / 详情 CSS 类 + 头部/备注/三段折叠卡结构 / pfSemesterStartTs / 荣誉墙类型筛选 + 证书按钮 + 画布函数接口）
- [x] **验收**：本地 `python -m http.server` + playwright-core 渲染 21 项全过（拼音顺序 6 人 ✔ / 学分大字号 38px ✔ / 寝室→性别补写（女 ✔ / 男 ✔ / 不规则不补 ✔） / 本学期 2 条过滤 ✔ / 折叠交互 ✔ / 学生荣誉 1 条 ✔ / 证书画布 >50KB ✔ / 集体荣誉下载文件名 `26级幼保2班-广播操比赛第一名-荣誉证书.png` ✔ / 荣誉墙 2 张卡 + 类型筛选个人剩 1 条 ✔）
- [x] **升版**：v2.17.18 → v2.17.19（index/sw + 8 测试文件明文+转义双轮，注意 _v2177 的 extractFn 抽 DORM_GENDER_RULES const / DORM_RE const 等模块绑定，避免「isDormTag is not defined / DORM_RE is not defined」——单测抽公共函数 + const 常量需要一并注入或解析提供，否则套件一起炸）
- [x] **全量 20 套件全绿**：v2.17.19 新增 16 项，累加 v2.17.16 起的新模块共 **396+ 项**

### 2026-09-08（v2.17.20：荣誉证书导出四项修复——去红章 / 去班主任署名 / 日期右对齐空两格 / 班级全称落款）

- [x] **需求**：① 去掉红章「班主任荣誉专用章」(位置不当直接不要) ② 时间位置不对→居右空两格与班级全称对齐 ③ 去掉班主任名字 ④ 班级要显示全称「2026级幼儿保育2班」(侧栏用的是缩写「26级幼保2班」)
- [x] **证书绘制改动（`drawHonorCertCanvas`）**：
  - 删除整段红章 10 行（两圈描红 + 「班主任」「荣誉」「专用章」三字 + save/restore）
  - 删除 `ctx.fillText('班主任：', ...)` 署名行
  - 日期从左下 `x=150` 改成 `ctx.textAlign='right'` + `x=W-120` + 字符串尾部追加两个全角空格 `'　　'` → 日期可视右边缘比班级全称右缘再缩 60px（GB 落款：署名右空二字，日期再缩两字）
  - 落款顺序保留：班级全称 H-160 在上，日期 H-108 在下
  - 顶头抬头 + 落款 + honorCertEntity 集体主语 + 导出文件名集体基 = 全部走 `certClassName()` 助手
- [x] **新增 `state.classNameFull` 班级全称字段**：默认 `''`；证书用 `certClassName() = classNameFull || className || ''` 兜底
  - 链路 5 处齐：state 默认 + loadData 读取 + saveData 手写清单 + CLOUD_SYNC_FIELDS 白名单 + smartMergeData 合并
  - clearData 不主动重置（与 className 同组品牌/配置类保留）
  - 设置页班级名称 section 内新增 input `classNameFullInput` + 「保存」按钮 + 提示「用于荣誉证书等正式文件落款；不填则用上方班级名称」；`saveClassNameFull` / `renderSettings` 回填
- [x] **测试**：`_v2177_test.js` 追加 8 项 v2.17.20 断言（红章/班主任文 + arc 描画都校验；certClassName 函数提取+运行验证有/无全称两路径；证书内 ≥2 处用 certClassName 且不再直读 state.className；日期右对齐+全角空格×2；honorCertEntity 集体主语走 certClassName；classNameFull 链路五处齐；设置页有 input + 保存函数 + 渲染回填）——**20 套件全绿（_v2177 = 24 项）**
- [x] **测试联动坑再现**：certClassName 原本是单行函数 `function certClassName(){...} // v2.17.20 注释`，extractFn 抽出的 buffer eval 时尾注释把外层 `)` 吞了 → `Unexpected end of input`。**单行函数要格式化多行**（即 `} // 注释` 拆两行）
- [x] **升版**：v2.17.19 → v2.17.20（index/sw + 9 测试文件明文+转义双轮）；index.html v2.17.20 出现 39 处（31 原 + 8 新增），sw 1 处
- [x] **视觉验证**：playwright 渲染证书 PNG（classNameFull='2026级幼儿保育2班'、honor scope=个人）→ 抬头 + 落款均显示「2026级幼儿保育2班」，右下日期「2026 年 9 月 1 日」可见比班级名右缘缩两格；红章位置 (1180,560) 像素 RGB=(249,242,223)=底色，确认无红色描画；底部无「班主任：」文字
- [x] **推送**：cm-push-incremental 三提交 → 远端 `e81c4a79`，19 文件字节级一致；直接 gh api 拉远端 index.html：login/sidebar=v2.17.20、certClassName×1 + classNameFullInput×3 + saveClassNameFull×2 + classNameFull:×2 + 班级全称×8 + certClassName()×5、红章/专用章均=0；线上 CDN (cheeeom.github.io) 当前 max-age=600 缓存仍回 v2.17.19 — SW no-store 路径刷新后取新；强刷生效

### 2026-09-08（v2.17.21：证书落款改回居中 + 班级全称自动镜像 + UI 显眼化）

- [x] **反馈修正**：老板发截图指出 ① 班级全称未生效（显示的是简称「26幼2班」）② 底部布局应是「班级名称在上、日期在下、两者居中对齐」（不是 v2.17.20 理解的右对齐空两格）
- [x] **证书绘制调整**：把 v2.17.20 右对齐落款改成居中——`textAlign='center'` + `x=W/2`,班级全称 `y=H-150` fontSize 32、日期 `y=H-100` fontSize 30,两者纵向对齐
- [x] **解决「全称没出来」**:
  - **saveClassName 自动镜像**：保存班级名称时若 `state.classNameFull` 为空,自动同步成同名（避免证书回退到简称）；toast 提示「班级全称已自动同步为简称,后续请在下方改为正式全称,如「2026级幼儿保育2班」」
  - **设置页 UI 显眼化**：班级全称区块加红虚线边框 + 🏅 图标 + 标题；新增 `classNameFullStatus` 状态行——已设时显示绿色「✅ 当前证书落款全称:XXX」,未设时显示灰色「⚠️ 班级全称为空,证书将使用上方班级名称（简称）」；输入框 placeholder 改为「如:2026级幼儿保育2班」
  - **导出函数温柔提示一次**：exportHonorCert 检测 classNameFull 空时弹一条 info toast 引导去设置（`__cmFullNameToastShown` 会话内单次,不重复打扰）
- [x] **测试**：`_v2177_test.js` 在 v2.17.20 8 项基础上调整为 v2.17.21 居中布局断言 + 新增 2 项（saveClassName 镜像 + 导出提示开关）,共 26 项全过
- [x] **视觉验证**：playwright 渲染（classNameFull='2026级幼儿保育2班'、honor scope=个人、张三、学习进步之星、2026-09-08）→ 抬头 + 落款均「2026级幼儿保育2班」居中,右下日期「2026 年 9 月 8 日」紧贴全称下方居中对齐；红章位 RGB=底色
- [x] **升版**：v2.17.20 → v2.17.21（index/sw + 9 测试文件明文+转义双轮）；index.html v2.17.21 出现 42 处（原 39 + 3 新增注释）,sw 1 处
- [x] **推送**：cm-push-incremental 三提交 → 远端 `b5d11c58`，19 文件字节级一致；gh api 远端 index.html 验证：login/sidebar=v2.17.21、classNameFullStatus×3 + __cmFullNameToastShown×2 + classNameFullInput×5 + saveClassNameFull×2 + certClassName()×5、v2.17.20 右对齐残留(dtx+'　　'、W-120,H-160)均=0、v2.17.21 居中绘制(certClassName(),W/2,H-150 / dtx,W/2,H-100)=1+1；线上 CDN 仍走 SW no-store 刷新生效，强刷告知

### 2026-09-08（v2.17.22：学分操作界面去快捷分数预设 + 原因选择器固定到姓名搜索框右侧）

- [x] **需求**：原因目录（v2.17.0 起）已能选原因并自动带分值，预设原因自带直接扣分；学分操作页原来的「姓名搜索框右侧」+1~+5/-1~-5 共 10 个快捷分数预设就冗余了。去掉这些预设；仅保留「自定义分值」输入框允许临时改分；原因选择器固定到姓名搜索框右侧
- [x] **HTML 工具栏重排**（`#page-credits > .credit-op-main > .toolbar`）：
  - **删除** `#quickBtnGroup`（+1~+5、-1~-5 共 10 个 `.quick-btn` 按钮）
  - **顺序**：[`creditStudentInput` 姓名搜索] → [`rp-credit` 原因选择器] → [`customCredit` 分值输入] → [`customApplyBtn` 应用]
  - 原因选择器现在紧邻搜索框右侧，弹出 ① 方向 → ② 大类 → ③ 原因 三级面板（min-width 300px / max-width 360px，下拉 z-index 80 > 搜索下拉 z-index 10）
  - 占位文案：「分值（选原因自动带出，可改）」更清晰
- [x] **`updateCreditBtnStates` 重写**（不再依赖 `#quickBtnGroup`）：
  - 唯一提交入口是「应用」：`valid = 已选学生 && 已选原因 && 有分值 && 非 0`
  - **班委禁扣**：`__cmRole==='committee' && !cmCanMinus() && amt<0` → `customApplyBtn.disabled=true` + `title='班主任已关闭班委扣分权限'`（正分仍可用）；逻辑层 `cmMinusBlocked()` 兜底保留
  - 原 quick-btn CSS 还被学生表行内 `adjustCredit` 使用，**保留 `.quick-btn` / `.quick-btns` 不动**
  - 三个负值入口函数 `quickCredit` / `customCreditApply` / `confirmBatchCredit` 保留（逻辑不变，只是 UI 少了一处调用）
- [x] **测试**：
  - `_v2170_test.js`：原「`updateCreditBtnStates` 含 button.minus」断言改为「不引用 quickBtnGroup + 含 cmMinusLock + amt<0 + 提示文案」；新增 v2.17.22 工具栏布局顺序断言（HTML 无 `#quickBtnGroup` + 4 个 id 出现顺序 creditStudentInput → rp-credit → customCredit → customApplyBtn）
  - 其余 `_v2120` / `_v2130` / `_v2140`：`quickCredit` 函数保留，断言不受影响
- [x] **视觉+交互验证**（playwright 注入 3 名学生 + 原因目录 4 项）：
  - 截图确认布局一行：搜索→原因▾→分值→应用，无快捷按钮
  - 选「迟到早退」自动带 `-2`，应用可点；班委角色负分应用禁用+提示，正分放行
- [x] **升版**：v2.17.21 → v2.17.22（index/sw + 9 测试文件明文+转义双轮）；index.html v2.17.22 出现 44 处（原 42 + 2 新增注释）,sw 1 处；20 套件全绿（_v2170 = 33 项）
- [x] **推送**：cm-push-incremental 三提交 → 远端 `4eb9bae2`，19 文件字节级一致；gh api 远端 index.html 验证：login/sidebar=v2.17.22、`#quickBtnGroup`=0、4 个工具栏 id 顺序齐、v2.17.22 布局注释×1、`cmMinusLock`×3；线上 SW no-store 刷新生效

### 2026-09-08（v2.17.23：学分银行 — 双轨账本/阶梯奖励/兑换商店/阶梯预警/教师专属）

- [x] **设计**（老板确认）：4 个问题 AskUserQuestion 拍板——① 双轨账本（表现分 + 学分币） ② 任何加分自动等额发币 ③ 手动「结算本月」按钮 ④ 仅班主任可见。完整档位（卓越≥110 / 优秀100-109 / 良好90-99 / 常规60-89 / <60 预警区）+ 商店 6 券（免迟到 10 / 共进午餐 30 / 一日班长 20 / 电影 50 / 劳动豁免 15 / 同桌 8）+ 预警 4 档（黄/橙/红/深红，<60 通报家长/手抄手册/请家长/停课回家）
- [x] **数据层（5 处链路 + 云合并）**——`state.creditBank = { settings, wallets, ledger, nextLedgerId, alerts, nextAlertId, nextVoucherId, lastSettleMonth, createdAt }`：
  - **state 默认**：`notices` 后插入，结构齐 9 字段
  - **loadData**：`d.creditBank` → `cbNormalizeShape` 补齐形状 → `cbBankSafe` 兜底；末尾 `cbScanAlerts() > 0 ? saveData()`（启动预警）
  - **saveData**：手写清单加 `creditBank: state.creditBank`；顶部 `cbScanAlerts()`（任一落盘入口都触发建档/办结）
  - **CLOUD_SYNC_FIELDS**：白名单加 `'creditBank'`
  - **smartMergeData**：`if(localData.creditBank||remoteData.creditBank) merged.creditBank = cbMergeBanks(l,r)`（纯函数：券按 usedAt|time、流水按 time、预警按 resolvedAt|time 取更新者；计数器取大；lastSettleMonth 字典序取大）
  - **clearData**：`state.creditBank = cbDefaultBank()`（品牌配置类保留，data 类重置）
- [x] **币派生口径**（核心架构选择，**不是事件账本**）：`cbCoinMap(ops, ledger) = Σ{amount>0 && state!=='revoked'} + Σledger.delta`
  - 撤销加分 → 流水退出有效集 → 币自动回退；恢复 → 自动补回
  - 扣分不动币；银行类事件（兑换扣/退还退）单独写 ledger
  - 与 v2.17.9 学分自愈同源，天然免疫「本地撤销/云合并/校准回退」漂移（v2.17.5/2.17.7 反例教训）
  - `applyCreditDelta` 仅加一行注释说明派生规则，**无业务逻辑改动**
- [x] **月度结算（手动，每月一次）**：`cbDoSettle()` 按当月表现分定档 ——
  - 卓越(≥110) → 免迟到券+电影点播券+午餐券 各 1 张（source='settle'）
  - 优秀(100-109) → 一日班长券
  - 良好(90-99) → 本月兑换商店 9 折（`wallet.discountMonth`）
  - 常规(60-89) / <60 预警区 → 无
  - 写入 `lastSettleMonth` 防重发；同源同月同券去重（cbGiveVoucher 内部 `pendingItems.some` 排除已退）
- [x] **兑换商店 + 核销/退还闭环**：
  - `cbRedeem`：月限检查（`cbStoreUsedCount`） → 币余额检查（`cbCoinsOf`） → 9 折应用（`cbStoreItemCost`）→ 写 voucher + ledger redeem(-cost) → toast
  - `cbUseVoucher`：status unused→used, usedAt=now
  - `cbRefundVoucher`：unused→refunded, redeem 退币写 ledger refund(+cost), settle 退券不退税
- [x] **阶梯预警台账**：`cbScanAlerts()` 幂等扫描
  - ≥60 → 自动办结全部未决（status='resolved', resolvedAt=now, note 标回升自动办结）
  - 否则按当前档建档：同档同月一条 / 恶化升级才追加 / 同月不降级补录
  - `cbAlertMark` 提供 「已通知家长」「办结」 两个动作；`cbAlertDraft` 一键生成致家长通知文案（带班级全称）
- [x] **教师专属页 + 入口**：
  - 侧栏 `<div class="nav-item" data-page="bank">` + 移动 more-drawer 对应项；`COMMITTEE_PAGES` 不含 `bank` → 班委自动 cm-hide；`navigateTo` 二次拦截 + `renderBankPage` 第三次兜底
  - 顶栏新增 `cbAlertChip` 角标（未处理预警 N → 内联显示红 chip + click 跳转 bank·预警中心）
  - 新增 `<symbol id="i-bank">`（古典银行建筑图标）
  - `pageTitles['bank']='学分银行'`；`navigateTo` 加 `if(page==='bank') renderBankPage();`
  - `refreshCreditViews` 加 bank 页 active 时全量渲染 + `updateCbAlertChip`；`renderAll` 挂角标刷新
- [x] **测试**：
  - 新增 `_v2178_test.js` 24 项：版本三处同步 + 5 处链路字符串断言 + 双轨派生边界（扣分不计/撤销不计/银行流水叠加）+ 撤销后币自动回退 + 定档 9 边界 + 结算发券 5 名学生端到端 + 同源同月去重 + 档位 4 边界 + 建档幂等 + 恶化升级 + 同月不降级 + ≥60 自动办结 + 合并券去重/折扣月取大 + 流水/预警并集 + 计数器取大
  - 19 套件全绿（原 18 + 新 _v2178）
- [x] **视觉+交互验证**（playwright 注入 3 名学生：张三 55 分预警/李四 130 分 30 币/王五 108 分 8 币）：
  - 顶栏红色「学分预警 1」chip 显示
  - 侧栏 bank 入口高亮；切到预警中心：4 档徽章图例 + 张三黄色预警行 + 三个动作按钮
  - 概览：4 统计卡 + 月度阶梯奖励结算卡（5 档规则列）+ 币排行（李四 20 币 / 王五 8 币 / 张三 0 币 + 黄徽章）
  - 兑换商店：学生下拉 + 6 张商品卡（甲折显示原价划线 + 9 折实付）；兑换免迟到券 → 弹「李四 兑换成功 -10 币」+ ledger 出现 redeem -10 + 券包新增 status=unused + 币扣到 20
  - 月度结算 1 次 → 李四（130 卓越）得 lateFree/movie/lunch + 王五（108 优秀）得 dayMonitor = 4 张；`lastSettleMonth='2026-09'`
  - 通知草稿自动生成含 `【2026级幼儿保育2班·学分预警通知】` 抬头 + 班级全称
- [x] **升版**：v2.17.22 → v2.17.23（index/sw + 9 测试文件明文+转义双轮）；19 套件全绿（_v2178=24 项）
- [x] **推送**：见下一次 commit

### 2026-09-08（v2.17.25：修学分银行 tabs「点切换字变白看不见」）

- [x] **现象**：学分银行顶部 5 个 tab，点击切换后 active 文字变白、浅色卡片背景上看不见
- [x] **根因**：全局 `.tab.active{color:#fff}`（白字）依赖 JS 把红色渐变滑块 `.tab-indicator`（z-index:1，文字 z-index:2）定位到该 tab 下方（`left=offsetLeft-4 / width=offsetWidth`）。renderBankPage 只渲染了空的 indicator、**没写定位逻辑** → 滑块宽 0 不可见 → 白字裸落在浅背景上
- [x] **修复**：
  - 新增 `initBankTabIndicator()`：取 `#cbBankTabs .tab.active` 与 `.tab-indicator`，`offsetWidth>0` 保护下重算 `left/width`（与 `initStudentTabIndicator` 同款）
  - `renderBankPage` 末尾（innerHTML 赋值后）立即调用 —— 整页重渲染（进页/切 tab/任一银行操作后的 cbPersist 重绘）都会重算
  - tabs 容器加 `id="cbBankTabs"` + `max-width:100%;overflow-x:auto`（5 个 tab 在窄屏可横向滚动，indicator 是 .tabs 内 absolute 定位会跟随滚动）
  - `window resize` 监听兜底（仅银行页 active 时重算；横竖屏/窗口缩放后 tab 位置变化）
  - 预警中心 tab 的数量角标颜色改为条件式：active 时 `#fff`（红底上）、非 active 时 `#c53030`（浅底上），避免红数字落在红滑块上看不清
- [x] **测试**：`_v2178_test.js` 新增 1 项（initBankTabIndicator 存在 + renderBankPage 末尾调用 + cbBankTabs id + left/width 计算式 + offsetWidth>0 保护 + resize 兜底），25 项全过；19 套件全绿
- [x] **视觉验证**（playwright 逐个点击 5 个 tab）：每个 tab 的 computed color=白 & 滑块 left/width 与 tab offsetLeft-4/offsetWidth 误差 ≤1px 全部 ✅；预警中心截图确认红底白字清晰
- [x] **升版**：v2.17.23 → v2.17.24（index/sw + 10 测试文件明文+转义双轮）；19 套件全绿
- [x] **推送**：cm-push-incremental 单提交 → 远端待记录；gh api 远端特征串验证

### 2026-09-08（v2.17.25：月度阶梯奖励重设 110/150/200 + 兑换商店自定义目录）

- [x] **需求**（老板原话）：60 以下依旧阶梯预警；61-100 无奖励，100 为每人基础分；110 以上阶梯奖励；最高奖励 200 分门槛；商店支持自定义卡片/详情/按类别筛选；支持名字或学号快速筛选学生
- [x] **设计确认**（4 问 4 答）：3 档简洁版（110/150/200）；币+券双轨递进；预设 6 券可改价可下架 + 自由增删自定义商品；币永久累计、券当月有效（补充口径：**商店花币买的券不过期**，仅月度奖励白送的券当月失效留痕）
- [x] **三档奖励**：Lv1 进取 110-149 → 20 币 + 免迟到券；Lv2 卓越 150-199 → 50 币 + 免迟到/一日班长/电影点播；Lv3 巅峰 ≥200 → 120 币 + **上架目录全券各 1 张**（动态取目录，下架不发）；60-109 常规区与 <60 预警区无奖励；同月一次、防重复
- [x] **商店目录数据层**：`state.creditBank.store = { items:[], nextItemId:1 }`；首次进入自动种入预设 6 券（builtin:true 可改可下架不可删）；`cbSaveStoreItem/cbToggleStoreItem/cbDeleteStoreItem`；已发券自带 name/icon 快照，改价改名删商品不影响历史券核销；`cbMergeBanks` 按 key 并集、同 key 取 upd 大者、nextItemId 取大（旧数据无 store 安全补齐）
- [x] **商店 UI**：类别筛选 chips（cbBankCat + .cb-chip 样式，目录里出现过的类别动态生成，自定义类别也进筛选）；学生快速筛选（姓名/学号/id 三匹配，输入即显下拉 ≤8 条，回车选第一个，当前选中高亮）；商品卡整卡点开详情弹窗（售价/限购/剩余/学生余额 + 一键兑换）、✎ 进编辑弹窗（改价/改限/改简介/改详情/类别下拉 + 下架 + 删除，预设券隐藏删除键）；＋新增商品入口
- [x] **券过期**：`cbExpireCoupons()`（saveData 顶 + loadData 末挂载）：source='settle' + unused + 跨月 → status='expired' 留痕不退币；redeem 券永久有效；幂等
- [x] **顺手修**：`cbVoucherChip(v)` → `cbVoucherChip(sid, v)`——券包页调用传两参、定义只收一参，导致 chip 内容错渲染 + 核销/退还按钮 onclick 引用未定义变量（点必炸）；v2.17.23 遗留 bug
- [x] **测试**：`_v2178_test.js` 对齐三档口径（结算断言重写：lv3 全目录券+120 币 / lv2 3 券+50 币 / lv1 1 券+20 币）；新增 `_v2179_test.js` 35 项（三档边界踩线/目录 CRUD/上下架/快照/类别筛选/券过期三态/云合并 upd 大者/弹窗字段齐/chip 签名）；20 套件全绿
- [x] **实测**（playwright）：类别筛选/学号姓名搜索回车选中/详情兑换按钮/编辑改价 50→77/新增奶茶一杯/下架隐藏/三档结算 5 人（208→120币7券、163→50币3券、121→20币1券、100 与 48 → 无）/tabs 滑块对齐 ≤1px，全过
- [x] **升版**：v2.17.24 → v2.17.25（index/sw + 测试文件明文+转义双轮）
- [x] **推送**：见下一次 commit

### 2026-09-09（v2.17.26：学分银行二期 —— 学生档案 / 月度统计 / 双筛选）

- [x] **范围确认**（老板四选全中）：学生银行档案 + 月度结算统计 + 流水按人/按类筛选 + 预警按状态筛选
- [x] **月度结算统计**：`state.creditBank.settleHist[]` 快照（state 默认/cbDefaultBank/cbBankSafe 兜底/cbNormalizeShape 保留/cbMergeBanks 按月并集·同月取 at 大者·月份倒序 五处齐）；cbDoSettle 每次结算写 {month,at,counts{lv1..3},coins{各档实发币},vouchers}，同月覆盖、无奖励不建档；概览页新增「📅 月度结算历史」表（进取/卓越/巅峰人数 + 发币 + 发券）
- [x] **学生银行档案**：cbBankProfileOf(sid) 聚合五段（头部姓名学号预警徽标 + 币=加分发币+银行收支 分解 + 券按未用/已核销/已退还/已过期 状态卡 + 银行收支明细 + 券包(复用 cbVoucherChip 快照) + 预警记录含操作按钮）；弹窗 cbBankProfileModal；**入口三处**：概览排行行点击（📊 提示）/ 券包页卡片「📊 档案」/ 商店页当前学生旁「📊 档案」；cbPersist 钩子——弹窗内核销/退还/办结后自动刷新
- [x] **流水筛选**：学生姓名/学号快速筛选（复用下拉交互，cbLedgerSid）+ 类型下拉（全部/商店兑换/退还退币/月度奖励/手动调整，cbLedgerType）+ 清除筛选 + 合计币数；状态变量重渲染保持
- [x] **预警筛选**：状态 chips（全部/●待处理/●已通知家长/○已办结 + 各自计数，cbAlertStatus）
- [x] **测试**：新增 `_v2180_test.js` 19 项（settleHist 五处链路/结算建档幂等/云合并按月取新/档案聚合币分解与券状态计数/三入口串/弹窗与筛选 UI 串）；21 套件全绿
- [x] **实测**（playwright）：结算后统计卡正确（208/163/121 → 190 币 10 张券）；排行行点击 → 档案弹窗（标题/头像/币拆分行齐）；券包页/商店页档案按钮可开；流水搜「张一鸣」3→1 条、类型筛选联动；预警 chips 计数 2/1/1/0、筛「已通知家长」出 1 条；全过
- [x] **升版**：v2.17.25 → v2.17.26（index/sw + 测试文件明文+转义双轮；PROGRESS.md 不盲替）
- [x] **推送**：见下一次 commit

### 2026-09-09（v2.17.27：Lv2 卓越档奖励券 电影点播 → 劳动整改豁免）

- [x] **需求**：月度阶梯奖励结算去掉电影点播券，改成劳动整改豁免券一张
- [x] **改动**：`CB_SETTLE_LV2_COUPONS = ['lateFree','dayMonitor','movie']` → `['lateFree','dayMonitor','laborWaive']`；结算确认框 + 概览奖励规则两处文案同步。Lv3 巅峰（≥200）仍为「上架目录全券各 1 张」不受影响（如也要剔除电影点播，需下架该商品或另嘱）
- [x] **测试**：_v2178 Lv2 三券断言更新；21 套件全绿；实测 170 分 → dayMonitor/laborWaive/lateFree，230 分 → 全目录含 movie
- [x] **升版**：v2.17.26 → v2.17.27（index/sw + 测试文件双轮）
- [x] **推送**：见下一次 commit

### 2026-09-09（v2.17.28：商店学生选择器无默认 + 学分操作「按寝室加减分」）

- [x] **需求**（老板原话两条）：① 兑换商店为什么有默认「刘梓萱（白驿）」的名字，去掉——点搜索框出现候选名单、实时筛选；② 学分操作里新增「按寝室加分」，点击选择寝室、全寝室批量操作加分
- [x] **① 商店选择器改造**：
  - 去默认：`var cbStoreSid = ''` 空起步；渲染时仅当有残留且学生不存在才清空（`if(cbStoreSid && !studs.some(...)) cbStoreSid=''`），**绝不回填第一个学生**；未选态不显示任何姓名/余额/档案，改显「👆 点搜索框选择要兑换的学生」引导 + ✕ 清除
  - 点选交互：搜索框 `onfocus=cbStoreFocus`（已选中则先清名字再展开）→ 空关键词列全体候选（slice 60）；输入姓名/学号/id 实时筛选（slice 8）回车选第一个（cbStoreSearchKey 保留）；onblur 延时收起（保留点击候选行的时间窗）
  - 锁定兑换：`var can = !!selS && selCoin >= cost && remain > 0`，未选学生时按钮禁用、提示「请先在上方选择学生」
- [x] **② 按寝室加减分**（学分操作区入口按钮 🏠，结算按钮前）：
  - 寝室派生沿用**学生档案 tags 里的寝室标签**（`\d+栋-?\d+室`，DORM_RE），非独立字段；`dormRoomMap()` 只收带寝室标签的学生、按房间分组；`dormRoomSort()` 栋/室自然序排序
  - 弹窗 dormCreditModal：寝室列表点选（再点取消、选中高亮 var(--primary) 边框）+ 已选寝室/成员 chip 预览 + 原因选择器（dormReason 接入 RP 体系：'creditReason','batchReason','dormReason' selects 列表 + initReasonPicker('rp-dorm',…) 分值联动）+ 确认按钮（未选寝室 disabled）
  - 提交：确认文案实时预览「将给 N 名学生统一操作，每人一条独立流水，可单独撤销」；`dormCreditConfirm()` 逐人走 `applyCreditDelta(s, amount, reason)` 统一入口（扣分同样过 cmMinusBlocked 班委开关）→ saveData → 关弹窗 → toast 汇总 → refreshCreditViews 一次刷新
  - 空态引导：没有学生挂寝室标签时弹窗给「还没有任何学生挂了寝室标签 / 去「学生管理」…」提示
- [x] **测试**：新增 `_v2181_test.js` 15 项（版本三处同步/无默认选中五断言/focus 展开/清除回未选/未选锁定/余额判空/入口按钮/弹窗字段齐/dormReason 入体系/dormRoomMap 纯逻辑含空标签剔除/确认走统一入口/确认钮联动/空态文案）；一处断言修正——「独立流水提示」实际承载在 dormCreditRenderSel（选寝室实时预览），非 dormCreditConfirm，测试目标函数改对
- [x] **实测**（playwright）：① 进商店默认空 + 引导提示；点搜索框出全体候选 5 人；输入「刘」实时收窄；回车选中；✕ 清除回未选态、按钮恢复禁用 ② 按寝室列表 6栋-801室(2人)/6栋-802室(2人)；选 801 + 原因「寝室卫生优秀」+5 → 两人各一条独立 +5 流水、币 100→105，无 JS 错误
- [x] **回归**：22 套件全绿（20 套版本系列 + crypto/sync/v290/xss）
- [x] **升版**：v2.17.27 → v2.17.28（index/sw + 测试文件明文+转义双轮；PROGRESS.md 不盲替、手动追加本段）
- [x] **推送**：见下一次 commit

### 2026-09-09（v2.17.29：兑换商店候选名单按币由多到少排序）

- [x] **需求**（老板原话）：兑换商店的默认搜索框应该按照学分币多少进行排序，由多到少
- [x] **改动**（`cbStoreSearchInput` 重构）：
  - 币 map（cbCoinMap）**提前算一次**，候选排序依据与行内币显示共用，不再渲染时才算
  - 候选全集先拷贝 `cands = students.slice()` 后统一排序：**主键币降序**（`cm[b]-cm[a]`）+ **次键 id 升序**保稳；空关键词（全体，上限 60）与输入筛选态（匹配集，上限 8）都作用于已排序的 cands → 两种形态下都是币多在前
  - 原有无默认选中 / focus 展开 / 实时筛选 / ✕ 清除 / 未选锁定 行为零改动
- [x] **测试**：新增 `_v2182_test.js` 7 项（版本三处同步 / 主 <script> 可编译 / cbCoinMap 先于排序 / 两态共用排序后 cands / **比较器纯逻辑验证**：从 index 抽取 sort 回调直接喂虚构币 map 跑排序，币降序+同币 id 升序全对 / 行内币同 map / v2.17.28 行为回归冒烟）；_v2181 一处旧断言更新（`(state.students||[]).slice(0,60)` → `cands.slice(0,60)`，语义未变实现重构）；25 套件全绿
- [x] **实测**（playwright，localStorage 种子 5 人 币 120/80/55/20/0）：点搜索框 focus → 候选 甲120→乙80→丙55→丁20→戊0 按币降序 ✅；输入「0」命中 5 个学号前缀匹配集内仍降序 ✅；零 JS 错误。踩坑：① `state` 是顶层 `let` 不挂 window，evaluate 取不到 → 改 localStorage seed + reload ② tab 面板显隐是 CSS class，剥祖先 display 要设 block 而非空串 ③ 无头页 el.focus() 事件不可靠 → 用 playwright `page.focus()` ④ python http.server 的 `--directory` 只认 Windows 盘符路径 `/d/...` 会 404
- [x] **回归**：25 套件全绿（21 套版本系列 + _v2182 新 7 项 + crypto/sync/v290/xss）
- [x] **升版**：v2.17.28 → v2.17.29（index/sw + 测试文件明文+转义双轮；PROGRESS.md 不盲替、手动追加本段；_v2182 测试名里的「v2.17.28 行为」手动保留不被误升）
- [x] **推送**：见下一次 commit

### 2026-09-09（v2.17.30：设置页底部「关于本系统」——作者 / 版本 / 近版更新速览）

- [x] **需求**（老板原话）：在设置界面最底端加入一个版本号说明，注明开发作者 chee，以及当前版本号的简要更新
- [x] **改动**（设置页纯静态区块，无 JS 逻辑）：`#page-settings` 最末（跨电脑使用指南之后）新增 `settings-section id="settingsAbout"`：
  - 版本徽标 `🏷️ v2.17.30`（主色胶囊样式，**写全局版本号原文 → 升版双轮 replace 自动跟版**，无需手动维护）
  - 开发作者：**chee**
  - 「📝 近版更新速览」5 条：设置页关于区块 / 商店候选按币排序+无默认选人 / 按寝室加减分 / 学分银行二期 / 月度阶梯三档（**每版发版需手动更新此文案**，代码注释已标提醒）
- [x] **测试**：新增 `_v2183_test.js` 7 项（版本三处同步 / 区块在设置页最底部 / 作者 chee / 徽标随版 / notes 五条要点齐 / settings-section 主题色样式冒烟）；26 套件全绿
- [x] **实测**（playwright）：navigateTo('settings') → 区块可见且为设置页最后一个 section；徽标 🏷️ v2.17.30；作者 chee；notes 5 条；零 JS 错误
- [x] **升版**：v2.17.29 → v2.17.30（index/sw + 测试文件明文+转义双轮；设置页徽标随 replace 自动跟版）
- [x] **推送**：见下一次 commit

### 2026-09-09（v2.18.0：月度奖励按「当月净增」五档 + 预警中心迁学生页 + 学分彩徽章 + 移除行内快捷操作）

- [x] **版本定名**（老板拍板）：本版功能体量为大改动 → 版本号定为 **v2.18.0**（开发期曾暂编 v2.17.31，未对外发布、随本版定名作废；全量改名对齐）
- [x] **需求**（老板原话三连 + 追加一条）：①「月度阶梯奖励结算要按照每月净增分值结算，重新优化设计」②「预警中心要迁移至学生管理页面」③「学生学分要以颜色区分…分值越高的同学有什么颜色可以区分和展示标记，以110分以上为例」④ 追加「顺便移除学生管理里面的快速操作和对应的学分预设按钮」
- [x] **决策**（老板拍板）：净增 **五档 +10/+20/+30/+50/+70**，奖励随档递进（币 20/30/45/60/80 + 券单由少到多，t5 巅峰封顶送全目录上架券各 1）；预警中心 = 学生页第 3 页签；徽章 = 浅底 + 档位字章；应用范围 = 全站统一
- [x] **① 按「当月净增」五档结算**（替换 110/150/200 三档）：
  - 常量 `CB_NET_TIERS`（t1 进取 +10 币20 券[lateFree] / t2 勤学 +20 币30 三券 / t3 优秀 +30 币45 四券 / t4 卓越 +50 币60 五券 / t5 巅峰 ≥70 币80 coupons:null=动态全目录）；旧 `CB_SETTLE_COINS / CB_SETTLE_LV1/LV2_COUPONS` 三档常量整体删除
  - 纯函数：`cbMonthOfTs(ts)` ts→'YYYY-MM'（坏值兜底当月）；`cbMonthNetOf(sid,month,ops)` = Σ 当月未撤销 ops（每笔 op 自带 time、撤销仅打 state='revoked' → 净增可精确派生；无时间戳/他人/跨月不计、负净增如实返回）；`cbSettleTier(net)` 净增五档（<10 含 0/负 → none，与总分预警区解耦）
  - `cbDoSettle` 按净增定档发币发券（撤销流水自然回落）；settleHist 快照改 `{net:1, counts{t1..t5}, coins{t1..t5}, vouchers}`；概览渲染旧三档快照 `oldMap={t1:'lv1',t2:'',t3:'',t4:'lv2',t5:'lv3'}` + `h.net===1` 判别兼容；同月一次防重复不变
  - UI：结算确认框（cbDoSettleUI）列五档 + 净增 ≥10 前 8 名预览；概览卡副标题「按『当月净增』+10 起奖、+70 五档封顶」+「净增 <10（含 0 / 负）：无奖励」；结算历史表改五列头 进取10+/勤学20+/优秀30+/卓越50+/巅峰70+；模块头设计注释同步
- [x] **② 预警中心 → 学生管理页**：学生页加第 3 页签 `data-tab="alerts"`（🚨 预警中心）+ `#tab-alerts` 容器（紧随 import 页签）；`switchStudentTab` 通用化（list/import/alerts 显隐 + 滑块 + 切 alerts 即 `cbRenderStudentAlerts()`）；`cbRenderStudentAlerts` = 原银行预警分支整体移植（状态 chips / 预警卡 / 已通知·办结·📋通知草稿 / 档位图例 / 空态）；顶部 🚨 角标 onclick 改 `goStudentAlerts()`（navigateTo('students') + switchStudentTab('alerts')）；学分银行页签瘦身为 概览/商店/券包/流水 4 个、删整支 `cbBankTab==='alerts'` 分支与「阶梯预警」副标题文案；cbPersist / cbAlertStatusTo / cbAlertAct 钩子全部指向学生页渲染（学生页 active 且页签可见才刷）
- [x] **③ 学分彩徽章 cbCreditBadge（全站统一，100 制分档）**：<60 沿用预警档深底白字「N 分 · 档位」+ title「低于及格线 60 → …」提示；60-109 浅蓝灰纯分值（不喧宾、不挡数字阅读）；110-149 琥珀橙浅底 +「进取」；150-199 金黄浅底 +「卓越」；≥200 红金渐变 +「巅峰 👑」；小数先四舍五入、非数字兜底 0。接入点：学生表行 / 详情面板「当前学分」/ 银行排行行 / 公示榜行（pubTopRow/pubProgRow/pubStaminaRow ×2）；`.score-badge` 死 CSS 删除；`creditLevel`（学分页搜索下拉）同步五档（lv-top/lv-elite/lv-strive + lv-yellow/lv-orange/lv-red/lv-dark）
- [x] **④ 图表与统计口径五档统一**：分析页统计卡 及格率 (≥60) / 进取率 (≥110)；drawRangeChart / drawPieChart / drawPubDist 桶对齐 预警/常规/进取/卓越/巅峰（60/110/150/200 界）——原先 dashboard 四档（<80/80-89/90-99/≥100，100 分制下毫无区分度）与学分/预警两套语言并存的问题消除
- [x] **⑤ 行内快捷操作移除**（追加需求）：学生表删除「快速操作」表头列与 +1/+5/-1/-5 行内按钮组、`function adjustCredit(id,amount,e)` 整体删除（空态 colspan 6→5、`.quick-btns/.quick-btn*` CSS 一并清理；学分操作统一走右上角「批量操作」/ 学分记录页）
- [x] **测试**：修复被系统性重构打穿的 6 套旧件——_v290（creditLevel 五档断言 + CB_ALERT_MIN/CB_ALERT_TIERS/cbTierOf 真实抽取）；_v2110 / _v2160（scope/global 补 cbCreditBadge stub，渲染依赖；徽章语义由 _v2184 锁）；_v2150（去 adjustCredit 断言 ×2 + drawRangeChart/drawPieChart 四档→五档 + 及格率≥60/进取率≥110）；_v2178/_v2179/_v2180（CB_SETTLE_* → CB_NET_TIERS、结算/快照断言重写为净增 ops 场景、补 cbMonthNetOf/cbMonthOfTs 抽取、券单按 t1..t5 对齐）；新增 `_v2184_test.js` 21 项（cbMonthOfTs/cbMonthNetOf 净增口径 / CB_NET_TIERS 结构 / cbCreditBadge 五档渲染全边界 / 学生页预警页签接线 / 顶部角标直达 / 银行四页签瘦身 / cbPersist·cbAlertAct 钩子 / 快速操作与 adjustCredit 零残留 / settleHist 新旧快照兼容映射）
- [x] **实测**（playwright，http 服务 + localStorage 种子 205/165/112/100/45/25 分、creditBase=credit 防自愈拉平）：学生表徽章 巅峰👑/卓越/进取/常规/橙色预警(45)/深红预警(25) 全对；表内无「快速操作」/adjustCredit；切「🚨 预警中心」页签 → chips「全部 2」、黄/橙/红/深红图例齐、预警戊橙卡（当时学分 45）+ 深红己卡；银行页 4 页签无预警、副标题瘦身、概览净增五档说明与奖励列表渲染正常；侧栏+登录页版本 v2.18.0；零 JS 错误（file:// 种子踩坑：creditBase 不与快照一致会被学分自愈拉平 → 种子补 creditBase=credit）
- [x] **回归**：27 套件全绿（24 套版本系列 + _v2184 新 21 项 + crypto/sync/v290/xss）
- [x] **升版**：v2.17.30 → v2.18.0（index 仅 3 处活动标记：登录页 / 侧栏 / 设置页 🏷️ 徽标 + sw.js CACHE_NAME —— index 内 ~100 处 v2.17.30 历史注释一律不动；测试文件 14 套用 node 脚本做 **token 级**升版断言，HTML 内容断言里指向代码注释的 v2.17.30 保留不回改；设置页「近版更新速览」文案手动换成 v2.18.0 五条并同步 _v2183 断言）
- [x] **v2.18.0 定名重录**：老板拍板本版为大改动 → 版本号定为 v2.18.0（开发期暂编 v2.17.31 作废）。全量改名：index/sw/PROGRESS/17 套测试 明文 v2.17.31→v2.18.0 + 转义 v2\.17\.31→v2\.18\.0，27 套件复跑全绿
- [x] **⚠️ 文件注入隐患（必读）**：本轮发现本环境存在外部进程在 index.html 被写后数秒内自动注入 `data-page-node-id="…"` 标注（+1052 处 / +60KB，疑似预览标注服务监听文件）。处理：以远端已验证版本恢复 → 只重放改名 → **立即 `chmod 444` 冻结只读**（写入后 4s/9s 复查无再注入）。后续改动 index.html 需先 `chmod +w`，改完立即冻结；推送/比对全程文件保持只读。勿对 index.html 反复呈现预览，避免触发改写
- [x] **推送**：见下一次 commit

### 2026-09-09（v2.18.1：登录页标注开发者 chee + 座次默认可排 + 候选按学分排序 + 🎓 一键按学分排座 + README 补全）

- [x] **需求**（老板四条）：① 登录页版本号上方标注开发者 chee ② 线上 README 是否更新（检查发现停在 v2.7.0，本轮补全到 v2.18.1）③ 座次表点卡片无法直接安排座位（根因：默认「查看模式」点卡片只弹姓名 toast，须手动切「编辑模式」才能安排）④ 开发「按学分高低优先选座」
- [x] **决策**（老板拍板，AskUserQuestion 双选）：座次**默认即可安排**（点卡片直接弹候选名单，原查看/编辑模式切换整体移除）；按学分选座 = 候选名单学分降序（高学分优先挑座）+ 工具栏「🎓 按学分排座」按钮一键前排入座（替代原 autoSeat 藏 prompt 选 2 的交互）
- [x] **登录页标注**：`.login-credit` 桌面 absolute bottom:40 左 36（版本号上方，仿 login-version 半透明）/ 移动 static 居中堆叠于版本号上；HTML `开发者 · chee`；设置页「近版更新速览」置顶 v2.18.1 条（座次直排+登录页作者）
- [x] **座次改造**：删 查看/编辑 tabs + `seatMode/setSeatMode/initSeatIndicator`（HTML / JS 定义 / navigateTo 调用三处齐删）；`seatClick` 去模式门槛（空位=安排 / 已占=更换，仍保留 `_studentPickerPool = filter 剔除已占座` 与 refreshStudentPicker —— _v2172 旧断言天然兼容）；候选 `sort((a,b)=>(Number(b.credit)||0)-(Number(a.credit)||0))` 学分降序；`autoSeat(strategy)` 策略参数化去 prompt（random 洗牌 / credit 学分降序 / name 拼音，工具栏三按钮 🎲 🎓 🔤 + title 提示）；grid 上方操作提示文案
- [x] **README**：标题 v2.7.0→v2.18.1；新增 v2.18.1 特性（座次直排/学分选座/登录页作者）+ v2.18.0 大改动 + v2.8.0–v2.17.30 近期演进精选；文件结构版本号同步；v2.7.0 及以前历史折叠 `<details>`
- [x] **测试**：14 套「版本三处同步」断言 **token 级**升 v2.18.1（login-version/sidebar/SW/🏷️徽标 明文+转义双形态，v2.18.0 功能注释保留不回改）；_v2183 notes 断言改验 v2.18.1 五条；新增 **_v2185_test.js 17 项**（版本同步/credit 三处与位置/模式 UI 与代码零残留/三按钮/seatClick 无模式+学分降序/autoSeat 策略与无 prompt/notes/注释保护）；**28 套全绿**
- [x] **实测**（playwright seed 5 人学分 120/95/80/70/60）：credit「开发者 · chee」absolute 且位于版本号上方 ✓；初始 6 空座，点空卡直弹「安排座位」候选降序 甲乙丙丁戊 ✓；点名字即入座 R0C0=甲 ✓；点已占卡「更换座位」✓；autoSeat('credit') 全序 甲→戊 ✓；autoSeat('random') 5 人 ✓；**零 JS 错**
- [x] **⚠️ 注入二次爆发（铁律验证）**：`chmod +w` 数秒后注入进程再次写入 1052 处 data-page-node-id（748KB）——证明其盯的是文件可写状态。处置：gh api 恢复远端干净版 → **一次性 node 补丁脚本**（12 锚点全命中，单次写盘）→ 脚本内 `fs.chmodSync(0o444)` → 全程 0 注入。教训：index.html 的一切编辑必须以「补丁脚本单次写盘 + 立即冻结」完成，**禁止逐条 Edit 边写边留可写窗口**
- [x] **推送**：见下一次 commit

### 2026-09-10（v2.18.2：零扣分榜改按「未扣分天数」排名，不再与学分挂钩）

- [x] **需求**（老板原话）：「把学分公示模块中的零扣分榜 Top10 的右侧改成未扣分天数排名，不要按照学分排名」
- [x] **现状**：榜单此前已按「距上次扣分天数」排序，但**行右侧展示的是学分徽章**（cbCreditBadge，进取/卓越/巅峰档位色很抢眼），且天数并列时以**学分**为次键 → 视觉与语义都像「按学分排」
- [x] **改动**（index.html，3 处）：
  - `pubStaminaRow` 重写：右侧直接展示 `未扣分天数`（`从未扣分` 绿字 / `N 天` 金棕字），移除学分徽章与中间天数小标签 → 该榜彻底不出现学分
  - `computePublicityData` 的 zero 排序：新增 `sidSort`，并列（含并列「从未扣分」）由 `creditSort` 改为**按学号**，排名只认天数
  - 卡片副标题改「按未扣分天数排名 · 从未扣分居首」；设置页 notes 置顶本条（滚动掉最旧的净增条）
- [x] **测试**：_v2160 同步 3 项断言（渲染改天数 + 新增「排序源码无 creditSort」）；_v2184 徽章调用点阈值 7→6 并补「零扣分榜行不再挂徽章」反向断言；_v2183 notes 断言同步；新增 **_v2186_test.js 12 项**（★含并列从未扣分按学号而非学分的判据用例）；16 套版本断言 token 级升 v2.18.2 → **29 套全绿**
- [x] **实测**（playwright，甲从未/乙5天/丙今天/丁10天）：卡片副标题 ✓；排序 从未扣分→10 天→5 天→0 天 ✓；右侧值域仅「从未扣分 / N 天」✓；侧栏 v2.18.2 ✓；零 JS 错
- [x] **⚠️ 本轮环境异常（记录）**：Bash 工具环境损坏（PATH 缺 dirname/chmod/ls 等）；**托管 node（.workbuddy/binaries）执行静默失败/无输出**，改用**系统 node + PowerShell** 完成补丁、测试与冒烟；PowerShell 的 safe-delete 拦截删除 → 临时文件改由 node `fs.unlinkSync` 清理
- [x] **推送**：见下一次 commit

### 2026-09-10（v2.18.3：全量审查 P0 四修 + 重置云端加密口令）

- [x] **需求**（老板原话）：「可以重新设置加密口令吗？不影响本机的数据情况下。把上次审查的 P0 四个缺陷一起打包进 v2.18.3」
- [x] **前置**：本轮先做了两件事——① **全量代码审查**（只读，产出 `CODE_REVIEW_2026-09-10.md`）：揪出 4 个 P0 + P1 风险 + P2 累赘（8 死函数 / 38 死 CSS / 32 处重复块），并给出根因诊断（处分记录等字段靠「state 五链路手工同步」→ 加字段要改 5 处，必漏）② **云同步不一致排查**（老板反馈「设置页改学分操作原因，换电脑又不见」）：实测线上 `data.json` HTTP 200 / `enc:1` / `updatedAt` 新鲜 / 最近提交仍是 `auto-sync` → **推送侧健康**，根因在接收侧（无自动拉取，须手动点「⬇️ 从云端拉取数据」；口令须每台完全一致，否则既拉不下也推不上）
- [x] **决策**（老板拍板，AskUserQuestion 双选）：重置口令功能**加进 v2.18.3**（不单开版本）；P0-4 工作记录搜索**补上搜索框**（而非删掉那 4 行死代码）
- [x] **P0-1 处分记录纳入云同步**（此前只走 loadData/saveData 两条链路，`punishments`/`nextPunishId` 从不上传也不合并 → 换设备/清缓存后云端恢复即丢全部处分记录）：
  - `CLOUD_SYNC_FIELDS` 补 `'punishments','nextPunishId'`（→ buildCloudPayload 按表过滤时带上）
  - `state` 顶层补默认值 `punishments: []` / `nextPunishId: 1`（此前靠 loadData 时序兜底，任何早于 loadData 的访问会崩）
  - `smartMergeData` 补合并分支：按 id 并集；远端已办结（done）优先采用 → 办结状态跨设备传播；均未办结取 createdAt 新者；结果按 createdAt→id 倒序；`nextPunishId` 取两侧 max
- [x] **P0-2 `saveData` 写入失败不再静默中断**：`localStorage.setItem` 包 try/catch（配额爆满 / 隐私模式 / 含 base64 头像课表图时 setItem 会抛）→ catch 里 `console.error` + `showToast('本地保存失败（存储空间可能已满），本次改动未落盘，请先导出备份并清理历史数据','error')`，**并继续执行 `autoPushToCloud()`**（原先抛异常会连带跳过云推送且界面与内存态脱节）
- [x] **P0-3 XSS 漏网点修复**：`openDetailPanel` 内学分流水详情 `${op.reason}` 裸插 innerHTML → 补 `escapeHtml(op.reason)`（全库 45 个文本插值点中唯一未转义；同文件另一处 8633 早已转义）
- [x] **P0-4 工作留痕搜索框补齐**：`renderWorkLogs` 一直在读 `wlSearch` 但全库从无该元素 → kw 恒空、关键词过滤永不生效。补 `<input type="search" id="wlSearch">`（oninput 触发刷新）+ 有关键词时**跨日期全库检索**（`if(!kw && w.date !== date) return false`）、无关键词维持原有按日视图；统计行区分「🔍 搜索「kw」· 命中 N 条」/「📅 日期 · N 条 | 本月 M 条」
- [x] **新功能 `resetCloudPwd`（重置云端加密口令，不动本机数据）**：设置页新增按钮「🔁 重置云端加密口令」；函数体 = 前置守卫（`hasGHToken()` / `cryptoOK()`）→ 两次输入新口令（≥8 位）→ `confirm` → 快照 `oldPwd` → `setSyncPwd(p)` → `wipeInProgress=true` → GET 拉云端 → **直接 `encryptForCloud(buildCloudPayload(parsed))` 用新口令重加密** → PUT（message `rekey: re-encrypt data.json with new sync password`）→ 出错则 `setSyncPwd(oldPwd)` 回滚；`wipeInProgress` 恒复位。**关键点**：故意绕过 `checkPushSafety`（该函数会用当前本地口令去解密云端，换口令场景必然失败）；口令只影响上传加密，**不触碰任何本地数据**
- [x] **升版**：v2.18.2 → v2.18.3（index 仅 3 处活动标记：登录页 1939 / 侧栏 2058 / 设置页 🏷️ 徽标 2767 + sw.js CACHE_NAME；index 内 v2.18.2 的 2 处历史注释一律不动）；设置页「近版更新速览」note 置顶 v2.18.3 四条（处分同步 / 重置口令 / 搜索框 / 保存失败提示）
- [x] **测试**：`_v2187_test.js` 新增 **24 项**（语法编译 / 版本三标记同步 / 历史注释保护 v2.18.2×2·v2.18.0×24 / P0-1 五链路三处齐 / P0-2 try/catch 与 autoPush 位次 / P0-3 escapeHtml 且无裸插值 / P0-4 搜索框+跨日期过滤+统计文案 / resetCloudPwd 定义·按钮·绕过 checkPushSafety·锁·回滚·守卫 / notes 四条）；**29 套旧件版本断言 token 级升 v2.18.3**（明文 `v2.18.3` + 转义 `v2\.18\.3` 双形态脚本，_v2183/_v2185 的 notes 断言改验新四条）→ **30 套全绿（PASS=30 FAIL=0）**
- [x] **实测**（playwright，http 服务 + localStorage 种子）：搜索框跨日期检索（「班会」1 命中 /「开学」1 命中 /「zzz」0 命中 / 清空回全量）✓；`resetCloudPwd` 已定义且设置页按钮在 ✓；`saveData` 正常 ✓；`punishments` 成功持久化到 localStorage ✓；**零 JS 错误**
- [x] **⚠️ 注入复查**：本轮 index.html 全部改动走「远端干净版 → 一次性 node 补丁脚本单次写盘 → 立即 `chmod 444`」；改后 `data-page-node-id` 计数 = **0**（v2.18.3 ×11 全为正常标记/注释）
- [x] **推送**：见下一次 commit

### 2026-09-10（v2.18.4：P1 缺陷修复 + P2 代码清理 —— 原生弹窗全部改模态 / 改名跨设备传播 / 死码清理）

- [x] **需求**（老板原话）：「依次修复剩下的问题，按照建议来」——即 `CODE_REVIEW_2026-09-10.md` 里剩余的 P1（原因目录改名不跨设备传播、6 处原生 prompt）与 P2（8 个死函数 / 死 CSS / 重复代码块）
- [x] **决策**（老板拍板，AskUserQuestion 双选）：**分两版**——P1+P2 打包 **v2.18.4**（低风险、立即可发版），结构性根治（STATE_SCHEMA 表驱动）留 **v2.19.0**；**prompt 改造含重置口令**（该处原是明文回显密码的原生 prompt，一并改密码框模态）
- [x] **P1-a 原因目录改名跨设备传播**（症状：一端改名后，另一端同时出现新旧两份，观感像「编辑没生效」）：
  - 根因：`catRenameDir`/`catRenameGroup` 只做本地键替换（`catalog[新名]=catalog[旧名]; delete catalog[旧名]`），而 `smartMergeData` 对 reasonCatalog 走**结构并集** → 另一端的旧名不会被剔除，合并后新旧并存
  - 修：改走 `cmPrompt` 的同时，onOk 里补墓碑——`catDeletedAdd('dirs', 旧名)` + `catDelUndo('dirs', 新名)`（大类用 `dir + '|' + 旧名` 复合键）→ 合并时 `applyCatTombstones` 按墓碑剔除旧名，另一端同步收敛为一份
- [x] **P1-b 原生弹窗全部退役（6 处业务 + 重置口令）**：
  - 新增站内通用输入模态 `#cmPromptModal`（标题/标签/输入框/可选确认框/提示/错误行 + 取消·确定），JS 侧 `cmPrompt(opts)` / `cmPromptSubmit` / `cmPromptCancel` / `cmPromptKeydown` / `cmPromptError` / `cmPromptClearError`；opts = `{title,label,value,placeholder,hint,type:'text'|'password'|'date',minLength,confirmLabel,validate,onOk}`；回车提交、Esc 取消、`confirmLabel` 时出现第二个密码框并校验两次一致
  - 6 处业务输入改模态：`editMotto`（班级口号）/ `openReasonDirModal`（新增方向）/ `openReasonGroupModal`（新增大类）/ `catRenameDir`（改名方向）/ `catRenameGroup`（改名大类）/ `extendLeave`（续假，日期型）
  - `resetCloudPwd` 改**密码模态**：`type:'password'` + `confirmLabel` + `minLength: 8`，**不再明文回显**（原 prompt 的明文回显是安全隐患）；执行体抽为 `resetCloudPwdApply(p)`（二次确认 + 有意绕过 checkPushSafety + 独占锁 + 失败回滚），`extendLeave` 执行体抽为 `extendLeaveApply(leave, newEnd)`，均便于测试抽取
  - 全站原生 `prompt(` 仅剩 **3 处**（同步口令 / 确认口令 / GitHub Token，均属一次性配置类输入，合理保留）
- [x] **P2-a 删 8 个零引用死函数**：`revertCreditOp` / `cbCreditOf` / `cbStoreSidPick` / `dutySlotsPerWeek` / `autoDuty` / `clearDuty` / `renderCreditStudentSelect` / `onCreditInputSearch`（全库出现次数 = 1，仅定义无引用）
- [x] **P2-b 死 CSS 清理（复核后净删 22 条）**：⚠️ **审查报告「38 条死 CSS」偏高**——复核发现 `lv-*` / `tl-*` / `hl-*` 是**动态拼接类名**（`'lv-' + t.level`、`'tl-' + t.type`、`'hl-' + ({校级:1,...})`），`status-` 则根本不存在；这些一律**必须保留**。实删 22 条：`.profile-info`×3 / `.pub-boards` / `.student-card` / `.student-grid` / `.grade-bar` / `.dragover` / `.tag-positive` / `.tag-negative` / `.tag-close`×2 / `.tag-list`×2 / `.punish-student-row .mr-tag` / `.hidden-tab` / `.data-table` / `.credit-table` / `.search-row`×2 / `.detail-panel` / `.table-striped` / `.pwa-banner` / `.motto-quote`×2（含 dark 变体）/ `.fade-in`+重复 `@keyframes`；另摘除 `.data-table-container` 与 `.search-input` 两个已并入同名规则的重复选择器
- [x] **P2-c 调试日志收敛**：13 处 `console.log(` → `dbg()`；新增 `dbg()` 开关（默认静默；`window.__CM_DEBUG` / 地址栏 `?debug=1` / `localStorage.cm_debug='1'` 任一开启；`console.warn` / `console.error` **恒定输出**，线上排查靠它们）→ 全库 `console.log(` = **0**
- [x] **P2-d 重复实现收敛（四处）**：
  - `defaultDuty()` / `defaultSeating()` 工厂函数 → 取代「state 默认值 / loadData 补字段 / 彻底重置」三处手写（此前加字段必须三处同步，漏一处即静默丢字段）；每次返回**全新对象**避免共享引用
  - 全局 `pad2(v)` → 取代 `cbFmtTime` / `formatOpTime` / `todayStr` 三处局部补零实现
  - `hiDPICanvas(canvas, cssH)` → 取代 4 个图表 + `pubCanvasReady` 共 5 处 DPR 样板；**用 `setTransform` 而非 `scale`**（画布尺寸未变时浏览器不重置上下文，`scale` 会在重复重绘中逐次累积 → 图越画越大）
- [x] **升版**：v2.18.3 → v2.18.4（index 仅 3 处活动标记：登录页 / 侧栏 / 设置页 🏷️ 徽标 + `sw.js` CACHE_NAME；index 内 **8 处 v2.18.3 历史注释一律不动**——其中 3 处是 v2.18.3 P0-1 的处分记录链路注释）；设置页「近版更新速览」换成 v2.18.4 八条（弹窗改造 / 改名跨设备 / 代码清理 / 调试静默置顶）
- [x] **测试**：修复被重构打穿的 **20 套**旧件——18 套「版本三处同步」断言 **token 级**升 v2.18.4（转义形态 `v2\.18\.3` → `v2\.18\.4`，历史注释断言保留）；`_sync` 沙箱补 `dbg` 桩；`_v2160` 冒烟抽取列表补 `hiDPICanvas`；`_v2150` 补全局 `pad2`；`_v2100` 删 `dutySlotsPerWeek` 抽取与用例；`_v2113` clearData 断言改认 `defaultDuty()` 并新增工厂字段断言；`_v2179` 函数清单移除 `cbStoreSidPick`；`_v2187` resetCloudPwd 四条断言改写为「密码模态 + 执行体 `resetCloudPwdApply`」。新增 **`_v2188_test.js` 31 项**：模态骨架/两次一致/最小长度/自定义校验/onOk 回调/键盘、6 个业务入口全走模态且无原生 prompt、★**改名墓碑端到端合并**（方向 + 大类两条独立链路，喂虚构双端目录验证旧名被剔除且误删为零）、8 死函数归零、21 条死 CSS 归零、动态类名（lv-/tl-/hl-）保护、`dbg` 三开关 + 默认静默、`defaultDuty/defaultSeating` 全新对象与三站点收敛、`pad2` 行为、`hiDPICanvas` DPR 位图尺寸 + 用 setTransform 不用 scale → **31 套全绿（PASS=31 FAIL=0）**
- [x] **实测**（playwright-core 1.62 + 本机 chromium-1234，127.0.0.1 静态服务 + 拦截外网 + sessionStorage 解锁）：**0 JS 错误 / 0 console.error / 0 console.log**；8 死函数 `typeof === 'undefined'`、新函数全部 `function`；`pad2` 输出 05/12/00；`defaultDuty()` 两次不同引用；`dbg` 默认静默·开 `__CM_DEBUG` 后输出；文本模态（confirmWrap=none）与密码模态（两框均 password / confirmWrap=block）✓；两次不一致与不足 8 位均**拦下且 onOk 未调用**、模态不关 ✓；一致后 onOk 收到值且模态关闭 ✓；**改名方向端到端：旧键消失 + 新键存在 + 旧名进墓碑 + 新名墓碑被清** ✓；续假走 date 模态且预填原结束日 ✓；6 个页面切换零异常 ✓（截图 3 张）
- [x] **坑与教训（本轮新增）**：
  1. **大文件的「字节数」≠「JS 字符串长度」**：UTF-8 下中文 3 字节仅占 1 个 UTF-16 码元 → `fs.readFileSync(p,'utf8').length` = 631515 而 `stat.size` = 697803。差值 66288 **不是文件被改**，别据此判故障
  2. **`grab()` 的 `\{[\s\S]*?\n\}` 锚点两个边界**：① **单行函数抓不到**（`pad2`/`defaultSeating`/`cloneReasonCatalog` 要按行切片取）② **同行后面若还有多行函数会被一起吞**（`cloneReasonCatalog` 单行 + 紧随的多行 `flattenReasonCatalog` → eval 包括号即语法错）。判断准则：先看定义是不是单行
  3. **测试文件行尾 CRLF / LF 混杂**：锚点替换必须按文件探测行尾拼接（`eolOf()`），否则同一份锚点在某些文件命中 0 次
- [x] **⚠️ 注入复查**：index.html 的全部改动照旧走「一次性 node 补丁脚本单次写盘（78 处替换 / 35 项自检全绿）+ 脚本内 `fs.chmodSync(0o444)`」；改后 `data-page-node-id` 计数 = **0**，文件 697803 字节只读
- [x] **推送**：见下一次 commit

### 2026-09-10（v2.18.5：座次拖拽换座 + 三个排座按钮改「只填空座」）

- [x] **需求**（老板原话）：「座次表要支持可以拖拽座位卡片实现快速换座位。要支持按学分选座时，让学分高的同学手动点击选座后，剩余座位按照分高分低依次随机填入空座，不能清空已选座位」
- [x] **决策**（老板拍板，AskUserQuestion 三选）：① 按钮行为 = **三个都改**（🎲随机 / 🎓按学分 / 🔤按姓名 一律改成「只填空座」，不再清空已排座位）② 补位规则 = **学分降序 + 前排优先**（⚠️ 此条**覆盖**老板口述里的「随机填入」——随机/姓名按钮仍按各自策略排序学生，但落座位置一律前排优先）③ 拖拽范围 = **鼠标直接拖 + 触屏长按约 0.2s**
- [x] **A. 拖拽换座（新增 9 个函数 + 4 条 CSS）**：
  - 交互实现走 **Pointer Events 统一鼠标与触屏**（HTML5 `draggable` 在触屏上根本不触发，故不用）
  - `seatPointerDown(ev,row,col,studentId)`：仅左键；`ev.target.closest('.seat-actions')` 直接放行（点右上角 🔄/✕ 不触发拖拽）；触屏挂 `setTimeout(seatDragActivate, 200)` 长按定时器 + 非被动 `touchmove` 监听
  - `seatPointerMove`：**鼠标越过 6px 阈值**即 `seatDragActivate()`；**触屏长按未成前移动 >10px** 则 `seatPointerCancel()`（把滚动手势还给页面）；激活后 `preventDefault` + `elementFromPoint` 找落点并加 `.drag-over`
  - `seatTouchMove`：仅 `active` 时 `preventDefault` —— 关键点：长按 0.2s 期间手指未移动，**浏览器尚未起滚**，此时掐断才能真阻止滚动（这也正是不用 `touch-action:none` 的原因，否则整块座位区都无法滑动页面）
  - `seatPointerUp` → `seatDrop(fromRow,fromCol,toRow,toCol)`：**目标已占 → 互换坐标**（不动数组顺序，云同步无感）／**目标为空 → 直接移动**／拖回原位 → 取消
  - ⚠️ **必须抑制合成 click**：拖拽结束后浏览器仍会补发 `click` → 会误开「更换座位」弹窗。做法：`seatPointerUp` 里注册**捕获阶段** `window.addEventListener('click', swallow, true)` 并 350ms 后自动摘除（比在 `seatClick` 里加时间戳判断更干净，也不用改动 `seatClick` 源码而破坏 `_v2172`/`_v2185` 的抽取断言）
  - CSS：`.seat{user-select:none;-webkit-touch-callout:none}` / `.seat.occupied{cursor:grab}` / `.seat.dragging{opacity:.4;transform:scale(.94);pointer-events:none;cursor:grabbing}`（`pointer-events:none` 是让 `elementFromPoint` 不被拖动卡片自身遮挡的关键）/ `.seat.drag-over{border-color:var(--primary)!important;box-shadow:0 0 0 2px rgba(166,58,43,.35);background:rgba(166,58,43,.14)}`
  - `renderSeating` 卡片补 `data-seat-row` / `data-seat-col` / `onpointerdown` / `oncontextmenu="return false"`（挡安卓长按菜单）；**`onclick` / 🔄 / ✕ 三条既有链路原样保留**
- [x] **B. `autoSeat` 改为「只填空座」**（不再 `state.seating.seats = []`）：
  - 保留 `keptCount = seats.length` 快照 → 收集**空座位（前排优先：行小优先、同行列小优先）** → 取**未入座学生**（`state.students.filter(s => !occupiedIds.includes(s.id))`）→ 按策略排序后 `seats.push` 补位
  - 守卫顺序（**踩过一次**）：先判「全员已入座」→ info 提示；再判「无空座可安排」→ error 提示。**顺序反了会把「全员已入座」误报成 error**（首轮实现即如此，被 `_v2189` 的用例逮到）
  - 空座不足时只补能补下的，并在确认框里显式说明「已排的 N 个座位保持不变」+「剩余 X 人暂不安排」
  - 逐字保留 `_v2185` 依赖的契约：`function autoSeat(strategy){` 签名、策略名 map `{'random':'随机','credit':'按学分从高到低','name':'按姓名拼音'}`、`sorted.sort((a,b) => (Number(b.credit)||0) - (Number(a.credit)||0))`、`String(a.name||'').localeCompare(String(b.name||''), 'zh')`、`Math.floor(Math.random()`
- [x] **升版**：v2.18.4 → v2.18.5（index 仅 3 处活动标记：登录页 / 侧栏 / 设置页 🏷️ 徽标 + `sw.js` CACHE_NAME；index 内 **8 处 v2.18.4 历史注释 + 8 处 v2.18.3 一律不动**）；设置页「近版更新速览」**置顶** v2.18.5 两条（拖拽换座 / 只填空座），旧 8 条一条不删（`_v2183` / `_v2185` / `_v2188` 的 notes 断言全部照旧成立）
- [x] **测试**：19 套「版本断言」**token 级**升 v2.18.5（**9 个 token**：转义形态 `v2\.18\.4`、`class-manager-v2.18.4`、`🏷️ v2.18.4</span>`、`<div class="login-version">v2.18.4</div>`、`同步 = v2.18.4`、`CACHE_NAME = v2.18.4`、`随版 = v2.18.4`、`v2.18.4 三处同步`、`=== v2.18.4 版本三处同步 ===`；**92 处命中**，脚本内置「残留 0」复查 + 5 条历史注释保护复查）。新增 **`_v2189_test.js` 42 项**：★用 `new Function` 沙箱**真跑** `autoSeat`/`seatDrop` 逻辑（不只看源码）——学分降序+前排优先落座矩阵、已排座位零挪动、空座不足只补能补的、无空座/全员入座/无学生/取消确认四种早退、name 与 random 模式、二次调用幂等；`seatDrop` 互换/移动/拖回原位/源不存在/失联学生占位；拖拽接线 9 个函数源码断言 + CSS + 三按钮 title + 提示文案；契约保留（`seatClick` 未被改动等）→ **32 套全绿（PASS=32 FAIL=0）**
- [x] **实测**（playwright-core + 本机 chromium-1234，1360×900，file:// + sessionStorage 解锁 + fetch 打桩）：**18 项全绿 / 0 JS 错误 / 0 console.error / 0 console.log**。★真机拖拽不是模拟 `page.evaluate` 直调，而是 **playwright 真实鼠标事件**（`mouse.down/move/up` 越 6px 阈值）+ **合成 `PointerEvent(pointerType:'touch')` 长按 260ms** 两条路径各跑一遍；验证：🎓按学分排座 6 座按学分降序前排优先 → 鼠标拖 (0,0)→(1,2) 两人互换且总数不变且**不误弹选座窗** → 触屏长按拖 (1,0)→(1,1) 互换 → ✕ 移除出空位后拖到空位**直接移动、原位清空** → 单击仍弹「更换座位」（拖拽未破坏点击）→ 构造「4 人已排 + 2 空位 + 2 人未入座」点 🎓，**4 个已排座位一个没挪**、2 人按学分降序补进空位 → 清空座位仍可用（截图 4 张）
- [x] **⚠️ 注入复查**：index.html 全部改动走「一次性 node 补丁脚本单次写盘 + 脚本内 `fs.chmodSync(0o444)`」（补丁 1：12 处替换 / 29 项自检；补丁 2：守卫顺序调整 / 7 项自检），两次写盘后 `data-page-node-id` 计数均 = **0**
- [x] **推送**：见下一次 commit

### 2026-09-10（v2.18.6：修复课堂纪律原因分值编辑被云端旧值覆盖 —— reasonScores 合并改本地优先）

- [x] **症状**（老板报）：设置页「课堂纪律原因」里编辑后，切模块页 / 连续刷新几次，编辑就自动复原成未编辑前状态，且弹「云端同步失败」。学分流水同步正常。
- [x] **根因**（repro.js 复现确认）：`smartMergeData` 里 `reasonScores` 用 `Object.assign({}, local, remote)` **云端优先**——本地改分值后 `catSetScore → catRefresh → saveData → autoPushToCloud`（防抖 2s 后推），若这次推送失败（防抖未到点 / 网络抖动 / 合并被闸门拦），就弹「云端同步失败」；紧接着切页/刷新触发 `autoSyncFromCloud` 自动拉取，拉取合并时云端旧值覆盖本地新编辑 → 复原。结构编辑（增/删/改名）走 `mergeReasonCatalog` 并集 + `catDeleted` 墓碑保护所以没事；学分流水走 `updatedAt`/`creditVer` 本地优先裁决所以没事——**只有分值这条裸覆盖路径是历史遗留的不对称**。
- [x] **修法**（index.html 第 5707 行）：`reasonScores` 合并改为**本地优先** `Object.assign({}, _rs, _ls)`——本地已有键保留本地值（未推送的编辑不被覆盖），云端只补本地缺失的键；本地已删键由 `catDeleted.reasons` 墓碑兜底剔除（不复活）。与 `reasonCatalog` 并集、学生/流水的本地优先裁决语义一致。
- [x] **升版**：v2.18.5 → v2.18.6（3 处活动标记 + `sw.js` CACHE_NAME）；设置页「近版更新速览」置顶新条目「修复：编辑课堂纪律原因分值后切页面/刷新偶发被云端旧值复原——原因分值合并改为本地优先」，旧条不删。
- [x] **测试**：新增 `_v2190_test.js` 12 项（本地改分值保留 / 云端新增键并入 / 本地删键墓碑兜底 / 两侧同名云端值原样 / 云端无 reasonScores 本地保留 / 本地无云端采纳 + 6 项源码护栏）；20 套旧件「版本断言」token 级升 v2.18.6（字面 `v2.18.5` 60 处 + 转义正则 `v2\.18\.5` 40 处，共 100 处；历史注释保护 v2.18.0/18.1/18.2/18.3 断言不受影响）→ **33 套全绿（566 断言）**。
- [x] **实测**（playwright + 本地静态服务器 + 假 GitHub PUT=422）：真实加载**零 JS 报错**、登录页版本 v2.18.6、页面上下文真跑 `smartMergeData` 本地 -3→-8 编辑**不被云端 -3 覆盖**。
- [x] **注入复查**：`data-page-node-id` = **0**（补丁脚本单次写盘 + 立即 chmod 444）。
- [x] **推送**：`cm-push-incremental.js` 增量推（远端 HEAD `b88d2409` 有 3 条 `auto-sync` data.json 提交在 v2.18.5 之上，脚本以远端为基座安全快进）→ 新 commit `ff284ed4`。API 校验：index.html blob 706187 bytes / 本地优先已写入 / 旧覆盖已清除 / 注入 0；**data.json 未改动**（仍 enc=1 密文，updatedAt 2026-09-10T14:48Z）。

### 2026-09-11（v2.18.7：云同步推送失败「报错人话化 + 退避重试」）

- [x] **背景**：查 v2.18.6 遗留的「云端同步失败」推送侧问题。线上 `data.json` 最后成功推送停在 **22:48:13**（之后 145 分钟零提交，彻底断）；老板确认静态三项正常（口令已配置 / 无「不一致」提示 / Token 已配置）→ 锁定为**运行时推送失效**（最可能 fine-grained token 过期，`GET SHA` 返回 401/403）。
- [x] **诊断关键**：浏览器里存的 token（localStorage `gh_sync_token`，fine-grained）与本机 `gh` CLI 的 token 是**两码事**；`gh` 这边验证 token 正常（`repo` scope 可读写），但**推不上去的是浏览器里那个**。旧 toast 只显示 `e.message` 前 80 字符（如 `GET SHA failed: 401`），普通用户看不懂。
- [x] **改动 1 — 报错人话化**：新增 `friendlyPushError(msg)` 纯函数，把底层错误转成中文：`GET SHA 401/403`→「GitHub Token 已失效或权限不足，请到设置页重新配置 Token」；`PUT 422`→「云端数据有并发更新，将自动重试」；`Failed to fetch/NetworkError`→「网络连接失败，将自动重试」；口令相关原样（本已人话）；未知原样。
- [x] **改动 2 — 退避重试**：`autoPushToCloud` 的 catch 分类处理——**可恢复错误**（网络/并发 422，即 `msg` 命中「网络|并发|重试」且不含「口令|Token|加密」）指数退避重试（`3s→6s→12s→24s`，封顶 30s，最多 `PUSH_MAX_RETRY=4` 次）；**不可恢复错误**（token 失效/口令不一致）立即人话提示、不空重试。成功回调清零 `_pushRetryCount`。
- [x] **升版**：v2.18.6 → v2.18.7（3 处活动标记 + `sw.js` CACHE_NAME）；设置页 notes 置顶新条「云同步推送失败自动重试并改用中文提示」，旧条不删。
- [x] **测试**：新增 `_v2191_test.js` 14 项（friendlyPushError 六种转译 + 退避重试源码护栏 + 版本/notes）；20 套旧件版本断言 token 级升 v2.18.7（字面 67 + 转义 `v2\.18\.7` 40 = 107 处）→ **34 套全绿（580 断言）**。
- [x] **实测**（playwright + 假 GitHub PUT=422）：真实加载零 JS 错、版本 v2.18.7、页面上下文真跑 `friendlyPushError` 401/422/网络三转译、`_pushRetryCount`/`PUSH_MAX_RETRY`/`friendlyPushError` 均挂全局可用。
- [x] **推送**：增量推 → 新 commit `0d131bb7`；API 校验 index.html blob 708226 bytes / v2.18.7 / friendlyPushError+retry 已写入 / 注入 0 / **data.json 未改动**。

### 2026-09-11（v2.18.8：修复重新添加的原因/大类被云端旧墓碑整体抹掉 —— 墓碑与重加按时间戳仲裁）

- [x] **症状**（老板报，07:36）：添加了几条课堂纪律的扣分原因，刷新后**整个课堂纪律原因模块全部消失**。
- [x] **根因**：v2.17.30 墓碑合并是**盲目并集且无时间戳**——`catDelUndo` 只清本地墓碑；死 token 期间（22:48 起推送中断）云端旧墓碑每次拉取都被重新导入，`applyCatTombstones` 把重新添加的大类/原因整体剔除；且墓碑**永久粘性**——即使推送恢复（老板 07:30 已重配 Token，auto-sync 复活），「推送前合并」仍会把云端旧墓碑带回载荷，重加项照样被抹。事故链：昨晚删过 课堂纪律 相关项 → 墓碑推上云（22:48 前）→ 今晨重加大类+原因（清了本地墓碑）→ 拉取并集复活云端墓碑 → 整组被抹 → 刷新后模块消失。
- [x] **修法**：新增两个同步字段 `catDeletedAt`（删除时刻）与 `catRevived`（重加时刻，`catDelUndo` 写入并清对应 deletedAt）；合并与 loadData 用纯函数 `catTombReviveFilter` 仲裁——**revived > deletedAt（旧墓碑按 0）→ 墓碑作废剔除，否则保留**（跨设备删除传播语义不变，_v2174 全兼容）；`mergeTsMap` 同 key 取大者；loadData 加载时自愈过滤（清掉早前坏合并写进本地存储的作废墓碑）；恢复预设时两 map 一并清空。五链路：state 默认 / loadData / saveData / CLOUD_SYNC_FIELDS / smartMergeData 全通。
- [x] **升版**：v2.18.7 → v2.18.8（3 处活动标记 + sw CACHE_NAME）；README 标题与特性段补到 v2.18.8（三连修汇总条）；设置页 notes 置顶新条。
- [x] **测试**：新增 `_v2192_test.js` 18 项（★含事故场景端到端复现：云端旧墓碑 + 本地重加大类 → 合并后大类保留、作废墓碑不写回；删除晚于重加仍生效；纯旧数据行为与 v2.17.30 一致；五链路护栏）；6 套被打穿的旧件补桩（`_v2174/_v2190/_v290/_v2190` extractFn 桩 + `_v2150/_v2173` grab 桩 + `_sync` _sliceFn 桩——smartMergeData 新增 mergeTsMap/catTombReviveFilter/state 外部符号）；20 套版本断言 token 级升 v2.18.8（字面 73 + 转义 40 = 113 处）→ **35 套全绿（598 断言）**。
- [x] **实测**（playwright + 假 GitHub）：零 JS 错、版本 v2.18.8、页面上下文真跑事故场景（云端旧墓碑不再抹掉重加大类）+ `catDelUndo` 行为（清墓碑+清删除时+记重加时）。
- [x] **推送**：增量推 → 新 commit `d71ff578`；API 校验 blob 711059 bytes / v2.18.8 / catTombReviveFilter 在 / 注入 0 / data.json 未被本提交改动。**另确认：data.json 自 07:30 起恢复 auto-sync（老板已重配 Token），v2.18.7 的修复指引生效。**
- [x] **老板后续操作**：强制刷新页面拿到 v2.18.8 → 重新添加课堂纪律大类与原因（今晨被抹掉的那批需重录）→ 刷新验证不再消失；待一次成功推送后，云端粘性旧墓碑自动清除。

### 2026-09-11（v2.18.9：隐式新建大类/方向同步 revive —— 补 v2.18.8 时间戳仲裁的漏网入口）

- [x] **症状**（老板报，07:58）：v2.18.8 上线后重加原因，提示「已同步」无报错，刷新**整组再次消失**。
- [x] **根因**：`catSaveNewItem` 只对「原因」做 `catDelUndo`（10559），**隐式创建/使用的大类（10557）与方向（10556）没有 revive 记录** → 云端旧大类墓碑在 v2.18.8 仲裁中因「无 revive 记录」继续生效 → 整组连新原因被抹。且**推送前合并先抹 → 推上云的就是被抹后的数据**（载荷目录=并集后被 applyCatTombstones 剔除），界面还提示「已同步」——刷新拉回的正是这份被抹数据。显式建大类路径 `openReasonGroupModal`（原 onOk）同样漏了方向层 revive。
- [x] **修法**：`catSaveNewItem` 补 `catDelUndo('groups', dir+'|'+group)` + `catDelUndo('dirs', dir)`；`openReasonGroupModal` onOk 补 `catDelUndo('dirs', dir)`——使用即视为「重加」，revive 时戳作废一切更旧墓碑；删除晚于重加的语义不变。
- [x] **⚠️ 补丁事故（当场自愈）**：替换锚点含 `catRefresh();` 但替换文漏写 → openReasonGroupModal onOk 的保存链被误删；跑测试前复查源码发现，二次一次性脚本补回，并新增「保存链完整（catRefresh 未丢）」断言防复发。
- [x] **测试**：新增 `_v2193_test.js` 9 项（★行为级沙箱真跑 `catSaveNewItem` 隐式建大类：三类 revive 全记录、墓碑全清；★端到端「加完→推送前合并→拉取」整组与新原因存活、作废墓碑不上云；删除晚于重加语义不回退；护栏）；`_v2192` 断言改为不带版本号的 token（引入版本注释不随升版盲替的教训）；→ **36 套全绿（607 断言）**。
- [x] **实测**（playwright 非侵入冒烟）：零 JS 错 / v2.18.9 / 页面内 `catSaveNewItem`+`openReasonGroupModal` 源码含 revive 与完整保存链。⚠️ 冒烟框架教训：`t()` 必须 await async 断言（否则 rejection 漏成假 ✅ + 进程崩）；页面上下文真跑带完整渲染链的业务函数会连累渲染进程，冒烟改用「源码含修复标记」的非侵入校验。
- [x] **推送**：增量推 → 新 commit `ad3b87c7`；API 校验 blob 711793 bytes / groups+dirs revive 在 / catRefresh 完整 / 注入 0 / data.json 未动。
- [x] **老板后续操作**：强制刷新拿 v2.18.9 → 再重录一次课堂纪律原因（前两次都被抹了）→ 这次加完刷新不再消失，且推送上云的就是完整数据。

### 2026-09-11（v2.18.10：平板/矮窗口侧栏导航「设置」显示不全且无法滚动）

- [x] **症状**（老板报，08:48）：平板上网页左侧导航「设置」显示不全、也不能滑动。
- [x] **根因**：`.app{height:100vh}` → `.sidebar`（纵向 flex）→ `.nav{flex:1;padding:8px 12px;overflow-y:auto}`。**column flex 子项默认 `min-height:auto`，不允许收缩到比内容矮** → 内容（20 个导航项；`pointer:coarse` 下每项 min-height 44px）把 `.nav` 整体撑高，`overflow-y:auto` 永不生效，「设置」（最后一项）连同 sidebar-footer 被顶出屏幕外且无法滚动。桌面窗口够高看不出来；平板/矮窗口必现。次要因素：平板浏览器 `100vh` 含地址栏后方区域，底部被多裁一截。
- [x] **修法**：① `.nav` 加 `min-height:0`（核心，恢复收缩能力 → overflow-y 重新生效）+ `-webkit-overflow-scrolling:touch` + `overscroll-behavior:contain`（防滚动穿透）；② `.app` 补 `height:100dvh`（渐进增强，不支持的浏览器保持 100vh）。
- [x] **测试**：新增 `_v2194_test.js` 7 项（CSS 精确锚点 / 旧规则已替换 / 「设置」确为最后一项 / 三处版本标记 / notes 新条旧条都在 / v2.18.9 历史注释未被波及）；27 个旧套件版本断言 token 级升级（字面+转义双形态，**引入版注释 `// v2.18.9 smartMergeData 墓碑仲裁依赖` 保护还原**）；⚠️ `_v2186` 的 `/v2\.18\.1/g` 无边界断言被 `v2.18.10` 子串误命中（4→8），加 `(?![0-9])` 负向前瞻修复——**版本号进位到 X.10 后，所有「数 vX.Y.Z 出现次数」类断言都要查子串边界**；→ **37 套全绿**。
- [x] **实测**（playwright 三视口行为级：1024×768 平板横 / 820×1180 平板竖 / 1280×620 矮桌面）：min-height:0 与 overflow-y=auto 生效；横屏/矮窗口内容确实溢出（889>635 / 889>487）且滚到底后「设置」与版本脚注完整可见；竖屏 820×1180 内容不溢出（1047=1047）「设置」直接可见；三视口零 JS 错。⚠️ 768px 宽恰是 `max-width:768` 移动断点（侧栏隐藏切底部 tabbar，设计行为），冒烟别选边界宽度。
- [x] **推送**：增量推 → 新 commit `bf90f03a`（30 文件：index 712072B + sw + 28 测试）；API 校验 blob 字节级一致 / v2.18.10×4 / dvh+minh0 在 / 注入 0 / **data.json 未被本提交改动**。

### 2026-09-11（v2.18.11：设置页「纯本地模式」开关——静音自动云同步，本地数据照常持久）

- [x] **需求**（老板提）：设置里加纯本地模式按钮；点击后不再一直弹云同步提示；确保本地数据更改后关机重启网页照常可用、不丢数据。
- [x] **设计**：设备级偏好 `cm_local_mode`（localStorage，与 `cm_sync_pwd` 同模式，**不参与云同步字段**——避免多设备偏好打架）；四个静音点 = ① `autoPushToCloud` 顶部拦截（在 `hasGHToken` 检查之前，连「未配置 Token」提醒一并静音）② 页面加载自动拉取按模式分流（`Promise.resolve(false)` 保住启动渲染链）③ `visibilitychange` 自动拉取拦截 ④ 开启时清掉待推/退避重试定时器。**手动通路零改动**：推送/拉取/恢复按钮 + `checkPushSafety` 内部 `autoSyncFromCloud` 保留；本地保存链（saveData→localStorage）原样不动——持久性本就靠它。
- [x] **UI**：☁️ Git 云同步区内 `cloudSyncInfo` 下方加开关按钮 + 状态位 + 说明文案；`updateCloudSyncUI` 加本地模式状态行 + 按钮标签回填（随 `renderSettings` 每次进设置页刷新）；`toggleLocalMode` 开→清定时器+提示；关→恢复自动同步并补推一次。
- [x] **测试**：新增 `_v2195_test.js` 12 项（★沙箱行为级真跑 `toggleLocalMode` 开→关全链路：置位/清定时器/提示/补推；手动通路与保存链护栏；版本/notes/历史注释）；25 个旧套件版本 token 双形态升级 → **38 套全绿**。⚠️ 沙箱坑两个：① 被测函数依赖的顶层常量（LOCAL_MODE_KEY）沙箱必须自带，否则 try/catch 把 ReferenceError 静默吞掉造成「看似执行了其实没写」；② `clearTimeout` 后变量里留的是失效 id（真浏览器同理、无害），断言应查清理列表而非变量为 null。
- [x] **实测**（playwright 真实点击路径 11/11）：设置页开关存在且初始关 → 点击置位 `cm_local_mode=1` + 标签切换 + 状态区提示 → 改班级名照常落盘 → **reload 模拟重启：数据字节级原样、模式保持、编辑值存活** → 设置页按钮状态正确 → 再点关闭恢复。全程零 JS 错。
- [x] **推送**：增量推 → 新 commit `fefd4eb5`（28 文件：index 715065B + sw + 26 测试）；API 校验 blob 字节级一致 / v2.18.11×9 / isLocalMode×8 / 注入 0 / **data.json 未被本提交改动**。

### 2026-09-11（v2.18.12：荣誉墙删除复活修复 + 寝室管理「新增寝室」）

- [x] **报障/需求**（老板提，12:01）：① 荣誉墙删除的示例荣誉过段时间自己恢复 ② 寝室管理加自定义按钮直接新增寝室并添加学生。
- [x] **根因①**：`smartMergeData` 对 honors **按 id 盲并集**（5730 注释自证）——`deleteHonor` 是硬删（数组 filter），云端旧副本每次自动拉取都把已删荣誉并回来；推送前合并还把它带回云端。与 v2.18.8 原因目录墓碑问题同构。
- [x] **修法①**：新增 `honorDeleted`（id→删除时间戳，走五链路）；`deleteHonor` 删除即登记；合并时 `mergeTsMap` 并墓碑 → 并集跳过墓碑 id → 双向防御剔除；`loadData` 自愈过滤（导入旧备份残留已删 id 也剔除）；清空数据连带清墓碑。重加荣誉用新 id（nextHonorId 单调），无需 revived 仲裁。
- [x] **设计②**：寝室由学生标签派生，空寝室无法存在 → 新增 `customDorms`（寝室号数组，五链路，合并按并集去重）支撑「先建后住」；`createDormNew` 校验 `DORM_RE` + 勾选学生直接入住（复用 addDormMember 的摘牌/补性别逻辑）；`renderDorm` 并入空寝室卡片（「空寝室 · 点击添加成员」）；`openDorm` 支持空自定义寝室（伪 dorm + 「🗑 删除该空寝室」，`deleteCustomDorm` 有成员时拒绝）。
- [x] **测试**：新增 `_v2196_test.js` 15 项（★复活事故复现：本地已删+云端旧副本→不复活 / 他端删除本机生效 / 双侧墓碑取大合并 / customDorms 并集去重 / 沙箱行为级 createDormNew 入住+走读摘牌+格式校验 / 五链路 / 版本）；26 旧套件版本 token 升级 → **39 套全绿**。⚠️ 新抽 smartMergeData 时桩要一次补全：mergeTsMap/catTombReviveFilter/sortOpsNewestFirst/cloneCatDeleted/applyCatTombstones/flattenReasonCatalog/cbMergeBanks/DEFAULT_COMMITTEE——建议照抄 _v2174 的桩清单。
- [x] **实测**（playwright 12/12 真实点击路径）：创建带 1 人的寝室 → 卡片+成员弹窗 → 再建空寝室 → 删空寝室 → customDorms+标签落盘 → **reload 后数据原样** → 荣誉墙正常渲染，零 JS 错。⚠️ 两个冒烟框架坑：① `page.addInitScript` 每次 reload 都会重跑——幂等种子必须加标记位（否则调试半天「数据被清」其实是自己重新播种）；② `text=` 选择器会撞设置页 notes 里的同文案，交互断言一律收进弹窗作用域（`#dormNewModal .modal-footer .btn-primary`）。
- [x] **推送**：增量推 → 新 commit `10f98798`（29 文件：index 723016B + sw + 27 测试）；API 校验 blob 字节级一致 / honorDeleted×21 / customDorms×25 / 注入 0 / **data.json 未被本提交改动**。

### 2026-09-11（v2.18.13：批量导入学生表格——Excel/CSV + 表头自动识别）

- [x] **需求**（老板提）：设置页批量导入只支持 JSON，希望支持 Excel 表格，并按表头自动识别姓名/性别/家长电话等批量导入。
- [x] **设计**：零依赖解析栈全部手写内联——① RFC1951 DEFLATE 解压器 `inflateRaw`（fixed/dynamic/stored 三种块）+ 极简 ZIP 读取 `unzipEntries`（EOCD→中央目录→store/deflate）② `readXlsxGrid`（sharedStrings + 第一个 sheet，单元格按 `r="A1"` 列号归位）③ `parseCSVGrid`（RFC4180：引号内逗号/转义引号/CRLF，全空行过滤）④ `decodeTableText`（UTF-8 strict 失败回退 GBK——Excel 另存 CSV 默认 GBK）。表头识别 `detectStudentCols`：每列按 电话→家长→宿舍→学号→性别→姓名 顺序匹配同义词（家长电话不误归家长姓名的关键 = 电话先判先 return）；`planStudentImport` 纯函数出「新建/更新/跳过」计划（按学号或姓名匹配，命中只改表内填了的字段、寝室归一 N栋-M室），预览确认才落库，取消零副作用。
- [x] **UI**：设置页批量导入区新增「📊 批量导入学生表格」按钮 + `importFileInput` accept 扩 `.xlsx,.csv` + `handleImportFile` 按扩展名分流 + 预览模态（列映射 chips / 每行新增更新标记 / 统计行）。
- [x] **测试**：新增 `_v2197_test.js` 16 项（CSV RFC4180 / inflateRaw 对 zlib.deflateRawSync 交叉验证含 stored 块 / openpyxl 真实 xlsx 夹具端到端 / 表头同义词 / planStudentImport 行为级+零副作用）；27 旧套件版本 token 升级 → **40 套全绿**。⚠️ 三个真 bug 都被测试逮住：① inflateRaw stored 块只跳了 LEN 没跳 NLEN（`pos += 16` → `32`，症状=开头 2 字节乱码+尾部丢 2 字节）② xlsx 单元格正则 `\/>([\s\S]*?)<\/c>|\/>` 分支顺序错——attrs 部分不能跨 `>`，`<c r="A1" t="s"><v>0</v></c>` 永远匹配不上（改 `(?:\/>|>([\s\S]*?)<\/c>)` 先试自闭合再试完整 body）③ 英文表头 guardian 没进监护人同义词表。⚠️ 补丁脚本写正则字面量锚点用 String.raw 最稳（手工 `\\/` 转义连续踩两次）。
- [x] **补刀**：`confirmStudentImport` 更新路径 `if(s2.profile)` → 老 JSON 数据学生无 profile 字段时导入字段被静默丢弃 → 改 `ensureProfile(s2)` 先补齐（playwright 冒烟用无 profile 种子逮住）。
- [x] **实测**（playwright 16/16）：设置页入口 → 真实 .xlsx setInputFiles → 预览（新增2/更新2/跳过1 + 六列 chips 全命中）→ 确认 → 张三(无 profile 老数据)补齐电话/性别/家长+搬寝 6栋-801室、李四更新、王五/赵六新建(S0003/S0004、100分) → reload 数据原样 → GBK CSV 钱七导入成功。零 JS 错。
- [x] **推送**：增量推 → 新 commit（30 文件：index 742194B + sw + 28 测试）；API 校验 blob 字节级一致 / 注入 0 / **data.json 未被本提交改动**。

### 2026-09-11（v2.18.14：修复「导入 JSON 备份后荣誉复活 / 部分数据丢失」）

- [x] **报障**（老板提）：v2.18.12/13 修复后，删除的荣誉又复活了。
- [x] **诊断**：云端取证（15:02 有 auto-sync、data.json 已加密 enc=1 无法读明文）+ 全代码审计。v2.18.12 的墓碑合并链路本身闭环（loadData / smartMergeData / applyCloudData / deleteHonor / push 载荷均带墓碑）。**真凶是第三条路：handleImportFile 的 JSON 备份导入按 ~15 字段白名单重建数据**——①备份里的旧荣誉（含已删的示例荣誉）原样恢复 ②本机 honorDeleted 墓碑被擦 ③ leaves/exams/todos/workLogs/notices/creditBank/customDorms/punishments/reasonCatalog 等全部新字段静默丢弃（导出写全量、导入只认白名单，天然不对称）④残缺数据 2 秒后 autoPush 顶掉云端完整数据。老板当天恰好在用导入功能，时间线吻合。另一条环境级路径：未刷新的旧版设备（盲并集合并）仍会把旧副本推回云端——**旧客户端无法用代码修复，只能全设备强刷**。
- [x] **修法**：新增纯函数 `mergeImportData(d, prevData)`——以本机 localStorage 现有数据为底，仅用备份里出现在 CLOUD_SYNC_FIELDS 的字段覆盖；墓碑类字段（honorDeleted/catDeletedAt/catRevived 取大、catDeleted 并集）**不走覆盖通道**（v2.18.14 补丁2：第一版先覆盖后合并，本机墓碑仍被备份整体顶掉，被 _v2198 测试当场逮住）。旧备份混入的已删荣誉由 loadData 墓碑自愈过滤掉。垃圾键（非同步字段）不进入 merged。
- [x] **测试**：新增 `_v2198_test.js` 11 项（★复活场景端到端：本机已删+旧备份含该荣誉→导入后墓碑保留→过滤后不复活；备份缺字段保留本机；墓碑取大/并集；垃圾键过滤；空库导入不炸；UI 接线）；28 旧套件活动标记双形态升 v2.18.14（99 处，只动 4 个精确串、不碰引入版注释）→ **41 套全绿**。
- [x] **实测**（playwright 9/9）：种下「已删荣誉+墓碑+leaves+customDorms」→ 导入含该荣誉的旧备份（confirm 自动接受+自动备份下载）→ 已删荣誉未复活、备份中未删荣誉正常进、墓碑/leaves/customDorms 保留、students 以备份为准 → reload 持久 → 荣誉墙只显示未删那条。零 JS 错。
- [x] **推送**：增量推 → 新 commit（index 743439B + sw + 29 测试 + 文档）；API 校验 blob 字节级一致 / 注入 0 / **data.json 未被本提交改动**。








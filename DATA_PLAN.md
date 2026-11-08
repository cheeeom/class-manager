# class-manager 数据托管与「剥离仓库」方案

> 撰写时间：2026-09-17　适用版本：v2.20.6
> 结论均基于**实测**（对本仓 + 线上 Pages 的只读核查），体检脚本见文末，可复跑。

---

## 0. 一句话结论

**当前不是"数据裸奔"，加密这层已经做对了**——公开仓里的 `data.json` 是 AES-GCM 密文，历史也查不到明文。
真正要解决的不是"数据在公开仓"，而是三件事：

| # | 真问题 | 量级 |
|---|---|---|
| R1 | **密文公开可下载 → 可离线爆破**，安全性 100% 押在口令强度上 | 8 位纯数字口令 ≈ 数十小时可破 |
| R2 | **仓库膨胀**：每次写入产生一个新 blob（密文不可压缩，实打实 ~170KB） | 当前节奏 → **每年约 0.79 GB** |
| R3 | **凭证与体验**：PAT 落在每台设备浏览器；拉取走公开 Pages（无鉴权）；老师端要自己配 token | 多设备体验重，且"公开读"无法收口 |

**推荐路径：先做 A（数据搬到私有仓）→ 再做 B（Cloudflare Worker + KV，根治膨胀 + 去掉老师端 token）**；C（腾讯云开发）作为国内网络兜底。

---

## 1. 体检报告（实测数字）

| 项目 | 实测值 |
|---|---|
| 仓库可见性 | `private=False` / `visibility=public` / `has_pages=True` |
| 仓库体积 | **19,298 KB**，工作树 74 个文件 |
| 唯一数据文件 | `data.json` = **170,999 B** |
| 该文件内容 | **密文信封**：`alg = PBKDF2-SHA256(250000)/AES-GCM-256`，`data` 字段 170,816 字符 |
| 提交总数 | 237（2026-08-09 → 2026-09-17） |
| 触及 data.json 的提交 | **52 次**（最快 2026-09-16 一天 30 次提交） |
| 历史明文残留 | **未发现**。抽查 31 个提交流本（最老 25 + 最新 6）**全部为密文信封** |
| 旁路 ref | 分支仅 `main`；tags `v2.5.0` / `v2.6.0` → 其中的 `data.json` 是 **977 B 空模板**（`students: []`，0 个手机号） |

**结论：可见历史干净，无需应急清历史。** 之前的 git 历史重写是有效的。

### 现网真实数据流（读代码得来，不是推测）

```
拉取（无鉴权！）  老师设备 ──GET──▶ https://cheeeom.github.io/class-manager/data.json   （Pages 站点上的文件，全世界可读）
                              ↑ getDataJsonUrl() 返回的就是 './data.json'

推送（带 PAT）    老师设备 ──GET sha─▶ api.github.com/repos/cheeeom/class-manager/contents/data.json
                 ──校验/合并/加密─▶ ──PUT(sha 乐观锁)──▶ 同上
```

关键点：
- **拉取是匿名公开读**（`fetch(getDataJsonUrl())` 不带 Authorization）→ 一旦数据搬进私有仓，**拉取路径必须一起改**，否则同步直接坏掉。
- **每次推送 = 下载 170KB（拿 sha + 做合并）+ 上传约 228KB**（base64 膨胀 33%）→ 单次写约 400KB 流量，移动端校园网下体感明显。
- `configGHToken()` 用「GET data.json 是否 200」来验证 Token，**把 404 当成"无权限"** → 迁移到新仓前若新仓还没有 data.json，老师端会**永远存不下 Token**（详见 §3 陷阱）。

---

## 2. 风险清单（按优先级 + 对策）

### R1 口令强度 —— 高
- **威胁模型**：任何人可下载密文（公开仓 / Pages），在本地离线穷举口令。PBKDF2 的 250,000 轮迭代是**唯一**的阻力。
- **量级**：单张高端显卡约每秒几十次口令尝试；租 8 卡并行可到每秒数百次 → **8 位纯数字 ≈ 数十小时**，6 位小写字母更快。
- **对策**：口令用 **5 个随机词** 或 **≥16 位混合字符**；绝不用"班级名+生日/学号/手机号后 6 位"。
- ⚠️ **换口令必须清云端重推**：否则旧密文仍能用旧口令解开，等于没换。

### R2 仓库膨胀 —— 中高（这是"数据不该住在 Git 里"的硬理由）
- 每次写入 = 一个新 blob；**密文是随机数据，Git 无法增量压缩**，实打实占 ~170KB。
- 推演：每天 5 次 → 每年 **303 MB**；当前实测 13 次/天 → 每年 **788 MB**；多人高频 30 次/天 → 每年 **1.8 GB**。
- GitHub 建议单仓 < 1 GB（超限会告警、克隆变慢）。按现节奏 **约 1.5 年就会撞线**。
- **对策**：A 只是搬家（仍在涨）；**B 是根治**（KV/R2 为覆盖式写入，不产生历史版本）。

### R3 Token 落在每台设备浏览器 —— 中
- PAT 存 `localStorage.gh_sync_token`。泄露者能**删/覆盖**仓库内容（拒绝服务），但**拿不到明文**（没有口令）。
- ⚠️ 另一个隐性点：**拉取完全无鉴权**，所以任何拿到 Pages URL 的人都能反复下载密文 —— 这正是 R1 的攻击面来源。
  ✅ **v2.20.7 起已关闭**：数据搬进私有仓后，**拉取也必须带 Token**（匿名访问返回 404，2026-09-19 实测）。
- **对策**：fine-grained PAT、**只授权单个仓**、只给 `Contents: Read and write`；共享设备不登录；上 B 之后 PAT 不再下发到任何浏览器。
- 🔀 **「一枚共用」还是「一台一枚」？定档：一枚共用（2026-09-19 改，原来是「一台一枚」）**
  技术上 **fine-grained PAT 不绑设备**，一枚填进所有设备完全可行，这点没有争议。取舍只在**吊销粒度**：

  | | **一枚共用** | 一台一枚 |
  |---|---|---|
  | 建 Token 的功夫 | **1 次**（sudo 只过一次） | N 次（每枚都要重过 sudo） |
  | 到期 / 轮换 | **改 1 处** | 改 N 处 |
  | 丢一台设备 | 撤销后**所有设备一起断**，得逐台重填 | 只撤销那一枚 |
  | 泄露后的影响面 | 与「一台一枚」**完全一样**（权限范围相同） | 同左 |

  - **本场景选「一枚共用」**：设备都是老板自己的、就 2~3 台；且 token 在 `localStorage` 里是**明文**存的 ⇒
    「设备丢失」无论哪种方案都只能**撤销后重配**，差别仅是「要重走几台」。2~3 台的重配成本 < 每建一枚多过一次 sudo 的成本。
  - ⚠️ **必须回退的条件**：一旦某台设备**不再由老板独占**（借人、可能被学生碰到、老师离职带走）⇒ **立刻改回「一台一枚」**，
    否则那一台出事，等于**全班设备的凭据同时作废**。
  - 💡 提示：GitHub 允许**给 token 改名**（不改密钥值）。共用时把名字改成中性的（如 `cm-sync`），免得日后自己误以为它只属于某一台。
- ⏭️ **有效期定档：选「No expiration」（2026-09-19 改）**。原先写的是「设 90 天过期」，那是**用可用性换安全**，在本场景不划算：
  ① v2.18.6 那轮「云端同步失败 145 分钟」的根因就是 token 到期；
  ② 到期日**所有设备同时失效**（同一批发同一时刻建的），没有缓冲；
  ③ 本场景真正起作用的控制是「一台设备一枚 + 只授权一个私有仓 + 只给 Contents RW」——泄露者**删不掉仓库、碰不到代码、拿不到明文**，吊销粒度已经足够细，再叠一层到期只是给自己埋雷。
  若你更在意时效，就选 **1 年**，并把「每年暑假批量重配」写进待办。

### R4 设备丢失 —— 中
- `localStorage` 里有**明文同步口令**（`cm_sync_pwd`）+ 明文班级数据。
- 现实风险其实**高于**云端：手机/平板丢失或被学生借用。
- **对策**：设备锁屏；丢失后**立即改口令 + 清云端重推 + revoke token**（三步做完旧设备即失效）。

### R5 合规 —— 中
- 学生为未成年人，其个人信息属**敏感个人信息**（《个人信息保护法》第 28 条），处理需单独同意并遵循最小必要。
- 工程建议：**不存身份证号**（用学号或只存后 4 位）、家长手机号脱敏、导出公示图前确认展示范围、控制在岗教师可见。
- （以上为工程建议，不构成法律意见。）

---

## 3. 方案 A：数据搬出代码仓（**先做，几乎零成本**）

**思路**：代码仓保持 `public`（GitHub Free 的 Pages **只能**从 public 仓发布，这点已核实），数据搬到**同账号新建的 private 仓**。

**为什么有效**：密文不再公开可下载 → 直接消除 R1 的离线爆破面；代码与数据解耦（以后代码仓可随意重建/重写历史而不碰数据）；膨胀转移到私有仓（不拖累站点仓）。

### 改动清单（比想象的多一点，因为拉取路径也要改）
| # | 位置 | 改动 |
|---|---|---|
| 1 | 常量 | 新增 `GH_DATA_REPO = 'class-manager-data'`，推送 URL 用它 |
| 2 | **拉取** | `autoSyncFromCloud()` 现在读 `./data.json`（Pages 公开文件）→ 改为**带 PAT 的 Contents API** GET + base64 解码；404 视为"云端暂无数据" |
| 3 | **Token 校验** | `configGHToken()` 把 **404 从"无权限"改为"通过"**（新仓可能还没有 data.json）；或改用 `GET /repos/:o/:r` 探测权限 |
| 4 | 老师端 | 每台设备重新配置 PAT（改成只授权新私有仓） |
| 5 | 收口 | 公开仓删除 `data.json` + 加 `.gitignore`；确认 Pages 站点 `https://cheeeom.github.io/class-manager/data.json` 返回 **404** |

> 预计 30~60 行改动，全部集中在同步层两个函数里。

### 迁移顺序（**顺序错了会分叉**）
1. 新建私有仓 `class-manager-data`（勾 README）
2. 把现有密文**原样复制**过去（salt 在信封里自带，**口令不变、无需重新加密**）
3. 在**一台**设备上升级代码 + 重配 PAT → 验证「能拉、能推、另一台能拉到」
4. 全部设备升级完成后，才从公开仓删除 `data.json`
5. 验收：公开站上该文件 404；两台设备互推互拉数据一致

---

## 4. 方案 B：Cloudflare Worker + KV（**第二阶段，根治**）

```
老师设备（手机/平板/电脑）
   │  HTTPS + 一个「口令」（= 加密口令，同时作访问口令）
   ▼
Cloudflare Worker  ← PAT 存在 Worker 的 Secret 里，永不下发到浏览器
   │  覆盖式写入（无历史版本 → 不再膨胀）
   ▼
KV（1 个 key）/ R2（或 D1）
```

**免费额度（已查证官方定价页）**
- Workers Free：**10 万请求/天**
- KV Free：**10 万读/天、1,000 写/天、1 GB 存储** ← 该场景每天约 13 次写，余量 70 倍
- D1 Free：5 GB 存储、10 万行写/天（若想要 SQL 结构）

**收益**
1. **膨胀归零**（覆盖式写入，不再每次生成 170KB 的新版本）
2. **PAT 不再进浏览器**，前端只带一个口令（口令泄露也只能读写这一条数据，不能碰代码仓）
3. **老师端零配置**：不用再研究 fine-grained token 怎么开权限，输一次口令即可 —— 多设备体验质变
4. 可绑自有域名，**摆脱对 `api.github.com` 的国内网络依赖**
5. 加密层**保留**：仍在客户端加密后才上传，Worker 永远拿不到明文（纵深防御）

**代价与注意**
- 要部署一个 Worker（约 40 行 JS）+ 记着额度
- `*.workers.dev` 默认域名在**国内不稳**，建议绑自有域名
- 需自己实现乐观锁（用版本号 / `If-Match`），现有的 sha 合并逻辑可平移到版本号上

---

## 5. 方案 C：腾讯云开发 CloudBase（国内兜底）

- **免费版（已查证）**：每月 3,000 资源点、1 个免费环境、云数据库/存储 **10GB + CDN 10GB**、约 20 万次调用/月，6 个月续期一次。
- **优点**：国内速度最好；有官方浏览器 SDK（跨域已解决）；有真鉴权，不必自己造口令体系。
- **代价**：要**重写同步层**（几十~上百行），是三个方案里改造最大的；账号需实名；额度用"资源点"计费不够直观。
- **适用**：A/B 在国内网络下体验仍不佳时再上。

---

## 6. 方案对比

| 维度 | A 私有数据仓 | B Worker + KV | C CloudBase |
|---|---|---|---|
| 成本 | ¥0 | ¥0（额度内） | ¥0（额度内） |
| 改造量 | 小（30~60 行） | 中（1 个 Worker + 同步端点替换） | 大（重写同步层） |
| 国内可用性 | `api.github.com` 实测通（`git push` 不通不影响） | 中等，建议自有域名 | **最好** |
| 密文暴露面 | 不再公开 ✅ | 不再公开 ✅ | 不进 Git ✅ |
| 仓库膨胀 | 仅搬家（仍在涨） | **根治** ✅ | 与 Git 无关 ✅ |
| 老师端配置 | 仍要配 PAT | **只输口令** ✅ | 无需 |
| PAT 位置 | 各设备浏览器 | **Worker 服务端** ✅ | 服务端 |
| 多设备并发 | sha 乐观锁 + 推送前合并（**已实现**） | 需新写版本号锁 | 数据库事务 |
| 推荐度 | ★★★★★ 第一步 | ★★★★★ 第二步 | ★★★ 兜底 |

---

## 7. 「多设备随时读写」的补齐（与选哪个后端无关的三件事）

**① 离线写入队列（最实际的短板）**
现在无网时自动推送会失败并弹提示，但没有队列 —— 老师在教室弱网/地下车库改的分可能白改。
做法：把 POJO 变更入队（localStorage 持久化），`online` 事件或下次启动时按序补推，推成功再出队。

**② 减少单次往返**
- 现在：拉取走 Pages（有机会被 CDN 缓存，虽已加 `?t=` 破缓存）；推送 = 下载 170KB 拿 sha + 上传 228KB。
- 优化：① 只取 sha 不必下全文（Git Data API：refs → commit → tree → blob sha，3 次小请求）；② PUT 用 `application/vnd.github.raw` 媒体类型**免 base64，省 33%**。

**③ 分片存储（收益最大的一条，A/B 都适用）**
把一个大 payload 按模块拆成多个 key（`students` / `operations` / `creditBank` / `notices` / 大字段…），**写哪片推哪片**。
- 单次体积可能从 170KB 降到 20~40KB
- 冲突面同样大幅下降（两人同时改不同模块不再互相覆盖）
- 与现有 **`STATE_SCHEMA` 表驱动架构天然契合**：它本来就是"唯一事实源"，加个 `shard` 字段就能自动派生分片清单
- 大字段（`scheduleImage` 课程表图片 / `classAvatar` / 通知历史图片）单独一个 key，避免每次改分都重传图片

---

## 8. 落地清单

**今天（零成本、收益最大）**
- [ ] 口令强度自检：若 <16 位、或纯数字/纯字母/含班级名+生日 → **立即更换**（换后清云端重推，让旧密文失效）
- [ ] PAT 换成 fine-grained token，只授权数据仓，只给 `Contents: Read and write`，**一台设备一枚**（有效期见 §R3 的定档：选 No expiration）
- [ ] 确认每台设备都开了锁屏密码

**本周（方案 A）**
- [ ] 新建私有仓 → 复制密文 → 改代码（4 处）→ 单机验证 → 全设备升级 → 删除公开仓 data.json
- [ ] 验收：公开站 `data.json` 返回 404；两台设备互推互拉一致

**之后（方案 B）**
- [ ] 部署 Worker + KV，老师端改成"只输一个口令"
- [ ] 视情况绑自有域名

**可选增强**
- [ ] 离线写入队列
- [ ] 分片存储（配合 `STATE_SCHEMA`）
- [ ] 免 base64 的 raw 上传

---

## 9. 附：本次体检脚本（可复跑）

| 脚本 | 作用 |
|---|---|
| `_audit_classmanager.py` | 仓库可见性/体积、data.json 内容类型、**历史提交明文抽检**（走 data.json 的提交，分类 密文/明文） |
| `_audit_cm2.py` | 分支/标签（旁路 ref）、提交总量与每日节奏、各时期工作树文件清单、膨胀推演 |
| `_audit_cm3.py` / `_audit_cm4.py` | 逐 tag 下钻，确认 977 B 的 data.json 是空模板而非真实数据 |

> 所有脚本**只读**，不修改远端任何内容；输出仅做类型判定，**不打印学生姓名或手机号**。

---

# 补记（2026-09-17 晚）：三个追问

## 10. 私有仓会不会也膨胀？——**会**，但这不是"私有"的锅

- **膨胀与仓库可见性无关**。Git 存的是「每次提交时那个文件的版本」，public / private 一视同仁：写 N 次就有 N 个版本。
- 私有仓唯一的区别是**谁能看到**；体积规则完全一样（官方文档已核实）：
  - 建议单仓 **< 1 GB**，强烈建议 **< 5 GB**（软上限，超了会收到 GitHub 支持邮件要求整改）
  - 单文件 > 50 MiB 警告，> 100 MiB **阻断**；单次 push 硬上限约 2 GB
  - 私有仓**不额外计费**（GitHub Free 私有仓不限数量；存储计费只针对 Git LFS / Packages / Actions 产物）
- 所以：**方案 A 解决的是"密文公开可下载"（安全性），不解决膨胀**。膨胀要按 §11 的四条办法治。

## 11. 每次推送是不是全量？——**是，而且是「全量 × 两层 base64」**

代码路径（`index.html`）：`doPushToCloud()` → `buildCloudPayload()` 取**全部 `CLOUD_SYNC_FIELDS`** → `encryptForCloud()` **整体加密** → `JSON.stringify` 整个信封 → `content: btoa(binary)` → **PUT 覆盖整个文件**。

**没有任何增量/差异**：不比对字段、不拆分片、只传变化部分。实证：本次审计抽到的 **52 个历史版本，每一个都是完整的 161~172 KB 信封**（若是增量，历史版本会是小文件）。

一次推送的体积旅程（实测）：

| 阶段 | 体积 | 说明 |
|---|---|---|
| 明文 JSON（全部同步字段） | ≈ 128 KB | AES-GCM 密文长度 = 明文长度 |
| 云端信封文件 `{enc,alg,salt,iv,data}` | **171 KB** | 内层 base64：密文 → **+33%** |
| HTTP 上行 body `content: btoa(信封)` | **≈ 228 KB** | 外层 base64：整个信封**再来一遍 +33%** |
| Git 新增的 blob | **171 KB** | 就是那个信封；密文是随机数据，**不可压缩、不参与 delta** |

**结论：不是"成倍膨胀"，而是线性叠加** —— 写 N 次 ≈ N × 171 KB。当前约 13 次/天 → **≈ 2.2 MB/天 → ≈ 0.79 GB/年**。
（实测对照：09-13 → 09-17 的 4 天里 52 个版本 ≈ 8.9 MB，与推演吻合。）

> 白捡的优化：**外层 base64 纯属浪费**（每次 57 KB）。改用 raw 媒体类型 PUT（`Content-Type: application/json`，body 直接是信封 JSON）即可省掉，上行 228 KB → 171 KB。

### 四条对付膨胀的路（代价从低到高）

| 办法 | 效果 | 代价 |
|---|---|---|
| **① 滚仓**（同名删仓重建，只留最新密文） | 体积**瞬间归零**，年增长清零 | **零代码改动**；需一个有删仓权限的维护用 PAT（只在电脑上跑，不进浏览器）；滚仓那几秒要保证其它设备不在写 |
| ② 免外层 base64（raw PUT） | 单次上行 **−33%** | 改 1 处 fetch |
| ③ **分片**（按模块拆 key、各片独立加密推送） | 单次 171 KB → **20~40 KB**；**这是把"全量"变成"增量"的唯一办法** | 同步层改造（与 `STATE_SCHEMA` 天然契合） |
| ④ 换覆盖式存储（Worker + KV / R2） | **膨胀彻底归零** | 要部署一个 Worker |

> **推荐组合**：先用 ① 零成本止血（`cm-make-data-repo.py roll --yes`），中期 ③，最终 ④。

## 12. 怎么建私有仓（顺带把现有密文迁过去）

**A. 网页（最不容易出错）**
1. github.com → 右上 `+` → **New repository**
2. 名称填 `class-manager-data`
3. **Visibility 选 Private**（关键）
4. 勾 **Add a README file**（让 `main` 分支一开始就存在，避开空仓的边界问题）
5. Create repository

**B. 命令行（本机已有 gh CLI）**
```bash
gh repo create class-manager-data --private --add-readme
```

**C. 一条脚本完成「建仓 + 迁移密文 + 校验」**（本机已有 token，见 `D:\a\chee777\scripts\cm-make-data-repo.py`）
```bash
python D:/a/chee777/scripts/cm-make-data-repo.py status cheeeom/class-manager-data   # 看膨胀/速率/何时撞线
python D:/a/chee777/scripts/cm-make-data-repo.py create class-manager-data
python D:/a/chee777/scripts/cm-make-data-repo.py copy   cheeeom/class-manager data.json class-manager-data
python D:/a/chee777/scripts/cm-make-data-repo.py verify cheeeom/class-manager-data
python D:/a/chee777/scripts/cm-make-data-repo.py roll   cheeeom/class-manager-data --yes                  # 滚仓
python D:/a/chee777/scripts/cm-make-data-repo.py roll   cheeeom/class-manager-data --yes --if-over=200     # 到量才滚（可挂定时任务）
```
脚本自带护栏：**不是密文信封一律拒收**（绝不让明文离开本机）、不打印 token、失败非零退出、滚仓前先备份到 `_data_backup\`。

**建完之后还差三件事，否则同步会坏**
1. **改前端常量**：`GH_REPO` 指向数据仓
2. **改拉取路径**：现在拉取读的是 Pages 上的 `./data.json`，私有仓后必然 404 → 改成带 PAT 的 Contents API + base64 解码
3. **改 `configGHToken()` 的 404 判定**：新仓没有 data.json 时 GET 返回 404，而它把 404 当"无权限" → 会**永远存不下 Token**
4. 每台设备重配 PAT（授权新私有仓、`Contents: R/W`、一台一枚、No expiration）；**全部设备都能正常同步后**，才从公开仓删掉 `data.json`（顺序反了会两端分叉）

## 13. 追问四：私有仓能不能做「覆盖式存储」？

**空间上不能，但语义上早就是了 —— 这两件事必须分开看。**

| 层面 | 私有仓现状 | 说明 |
|---|---|---|
| **语义上的覆盖**：读到的永远是「最新那一份」 | ✅ **已经是** | `GET contents/data.json` 只返回当前分支那一份；旧版本对业务完全不可见，不会读到旧数据 |
| **空间上的覆盖**：不产生新版本、占用不增长 | ❌ **做不到** | 这是 Git 的设计前提 |

**原因**：Git 对象是**不可变 + 内容寻址**的。往同一路径写新内容 = 造一个新 blob，旧 blob 被旧 commit 引用着，**永远可达**（`git gc` 只回收不可达对象）。
推论：
- `force push` / 重写历史 只是把旧对象变成 **unreachable**，而 **GC 时机 GitHub 不承诺、不可控** → 不能当"覆盖"用。
- **Gist 也一样**（`PATCH` 会留下 revision 历史），而且 secret gist 拿到 URL 就能读，保密性更差。
- 想让"改 = 原地覆盖"，存储层就**不能是 Git**，必须是 KV / 对象存储那种「最后写入者胜」的模型。

> **GitHub 生态里唯一的真覆盖槽位：Releases 资源** —— 删掉旧 asset、上传同名的新的；且 Releases **不计入仓库体积**，官方声明不限总量与带宽。
> ⚠️ 但私有仓的 asset 下载要走 API 并跟随重定向，**浏览器端跨域能否通过未经验证** → 只列为"可探索"，暂不作首选。

### 那留在私有仓，怎么把膨胀压到可忽略？（三招组合拳）

| 招 | 效果 | 代价 |
|---|---|---|
| **① 压缩后再加密**（`CompressionStream('gzip')` → 再 AES-GCM；信封加 `zip:1` 标记，不支持则回退不压） | JSON 文本部分可压到 **1/6 ~ 1/8** | 改加解密各一处。⚠️ 注意 `scheduleImage` / `classAvatar` 是 **base64 图片、已经压过、压不动** → 必须配合 ② 才见效 |
| **② 分片**（大字段单独一个 key，常规写只推文本片） | 单次 171 KB → **20~40 KB**；配合 ① 可到 **10~20 KB** | 同步层改造（`STATE_SCHEMA` 加 `shard` 字段即可自动派生） |
| **③ 滚仓**（同名删仓重建只留最新密文） | 历史体积**周期清零**（伪覆盖） | 已脚本化：`roll --yes --if-over=200` 可挂定时任务 |

> ①+② 落地后，单次推送从 171 KB 降到约 **10~30 KB（−80% 以上）**，膨胀基本不再是个问题；③ 作为兜底。
> 若要把"覆盖"做成真的 —— 那就换 **Cloudflare KV / R2**（方案 B）：写入天然覆盖、体积恒定。

### 实测膨胀基线（`cm-make-data-repo.py status cheeeom/class-manager`，2026-09-17 22:40）

```
仓库体积 19,561 KB；data.json 171,803 B（密文信封）
触及该文件的提交数 = 56
跨度 5 天 → 实测 11.2 次/天
数据部分日均 1.84 MB → 约 670 MB/年
按此速率撞 1024 MB 预算还需约 18 个月
```
→ **18 个月**是当前"自动驾驶撞线时间"。不管它也行，但要知道这个数；要管，就用 ①②③。

---

# 14. 定案：采用 Cloudflare Worker + KV（免费 · 真覆盖 · 改造量最小）

## 逐条对着需求

| 你的要求 | 本方案 |
|---|---|
| **免费** | Workers 10 万请求/天 + KV 10 万读/天、**1000 写/天**、1GB。实测约 11 次写/天 → **余量 90 倍**。免费开通，**不需要信用卡** |
| **随时读写** | 一个 GET + 一个 PUT，与现在的同步流程同构（已有 debounce、并发重试、推送前合并） |
| **覆盖** | ✅ KV 是 key-value **覆盖写**，体积恒定 —— 这是它相对 Git 的决定性优势（Git 永远做不到） |
| **适配本项目** | 前端只改同步层 2 个函数；**客户端加密原样保留**（Worker 全程只见密文）；**设置页一个新按钮都不用加** —— 已有「🔒 配置同步口令」入口 |
| **操作难度低** | 部署 = **网页粘贴代码**（零安装、零命令行）；首次配对**自动完成**（TOFU），不用算任何 hash；老师端依旧"输一次口令" |

## 代码与验收

- Worker 源码：`D:\a\chee777\scripts\cm-sync-worker.js`（单文件、零依赖、可直接粘贴）
- 本地验收：`D:\a\chee777\scripts\_test_worker.mjs` 用内存 KV 桩跑 **28 项全绿** ——
  TOFU 鉴权 / 错误 token 403 / **明文体 400 拒收** / 推送拉取一致 / ETag 与 If-Match 412 / CORS 预检且不向陌生站点回显 / 1MB 上限 413 / 路由与方法校验 / KV 未绑定兜底

**安全模型（两层互不依赖）**
1. 数据仍是**客户端加密**后才上传（`enc:1` 信封）→ Worker 和 Cloudflare 永远拿不到明文；
2. 访问 token = `sha256(同步口令 + '|cm-access')`，Worker 只存这个 hash ⇒ **解不开数据、也反推不出口令**，口令不进任何服务端；
3. 明文体一律拒收（前端哪天配错也传不上来）。

## 部署（网页版，零安装，约 5 分钟）

1. `dash.cloudflare.com` 注册/登录（免费，不需信用卡）
2. 左侧 **Workers & Pages** → **Create** → **Start with Hello World** → **Deploy**
3. 进入该 Worker → **Edit code** → 全选删除 → **粘贴 `cm-sync-worker.js` 全文** → **Deploy**
4. 左侧 **Storage & Databases → KV** → **Create namespace**，命名 `cm-data`
5. 回 Worker → **Settings → Bindings → Add → KV namespace**：变量名必须填 **`DATA`**，选 `cm-data` → Save
6. 同页 **Variables and Secrets** → 新增普通变量 `ALLOW_ORIGINS` = `https://cheeeom.github.io`
7. 访问 `https://<worker名>.<账号>.workers.dev/health`，应返回：
   ```json
   {"ok":true,"kvBound":true,"initialized":false,"ver":null,"bytes":0}
   ```
   `initialized:false` = 尚未配对（正常）
8. 前端改好后，在任意设备输入同步口令并推送一次 → Worker 自动锁定该口令（`initialized` 转 `true`）。
   **换口令**：先在 Dashboard 删掉 KV 里的 `_auth` 键，再用新口令推一次。

## 国内可用性实测（部署后 2 分钟，必做）

> ⚠️ **2026-09-18 已预先实测（家宽）**：`dash.cloudflare.com` / `api.cloudflare.com` 可达，
> 但**默认的 `*.workers.dev` 子域名在国内不可用**（DNS 投毒 + CF 边缘按 SNI 直接 RST）。
> ⇒ **步骤 7 那个 workers.dev 地址在国内必然打不开**，请先看 **§15**，改走 Pages（`*.pages.dev`）或绑自有域名。
> 本节的复测方法依然适用，只需把地址换成你最终用的那个。

手机 4G/5G、家里宽带、学校网络，各打开一次 `.../health`：
- 三处都出 JSON → 直接用
- 只有部分能通 → 绑自有域名（Cloudflare 免费套餐支持；域名约 ¥30~70/年，不是 0 成本但很便宜）
- 全不通 → 转 §5 方案 C（腾讯云开发 CloudBase，国内最稳，代价是改造更多 + 需实名）

## 前端接入清单（4 处，全在同步层）

| # | 位置 | 改法 |
|---|---|---|
| 1 | 常量 | 新增 `const SYNC_API = 'https://<worker名>.<账号>.workers.dev'` |
| 2 | 新增 `syncAccessToken()` | WebCrypto 派生 `sha256(口令 + '\|cm-access')`（零依赖）；**口令本身不外传** |
| 3 | `autoSyncFromCloud()` | `fetch('./data.json')` → `fetch(SYNC_API + '/data', { headers: { Authorization: 'Bearer ' + tok } })`，并记下响应的 `ETag` |
| 4 | `doPushToCloud()` | URL 换成 Worker；PUT 带上 `If-Match: <ETag>`；解除对 `getGHToken()` 的依赖（旧 GitHub 通道可留作回退开关） |

> `encryptForCloud()` / `decryptFromCloud()` **一行都不用改** —— 加密层原样保留。

## 三个必须知道的诚实说明

1. **KV 是最终一致**：官方口径跨设备可见延迟最长约 60 秒（同机房通常立即生效）。你的场景（老师改完、另一台设备过会儿拉）无感；要强一致 → 换 **D1**（免费 5GB / 10 万行写/天）。
2. **KV 没有原子 CAS**：两台设备几乎同时写时，双方的 `If-Match` 都可能通过 → 后写者胜。缓解：现有"推送前先 GET 云端并合并"的流程 + 412 重试（本来就有）。要严格 → D1 事务。
3. **免费额度边界**：1000 写/天 对 11 次/天 绰绰有余，但若哪天改成"每改一个学生推一次"就会撞线 —— 保持现在的 debounce 即可。

## 为什么不选另外两条（一句话）

- **私有仓**：免费、零部署，但**做不到真覆盖**（只能滚仓做周期性清零）—— 你的需求里"覆盖"是硬门槛。
- **CloudBase**：国内最稳，但要装 SDK、重写同步层、需实名，**操作难度明显更高** —— 作为国内网络不通时的兜底。

---

# 15. 国内可达性实测（2026-09-18，四川广元家宽）—— **结论：默认域名不能用，方案要改一处**

> 探测脚本：`python reach_probe.py --resolve … --sni … --latency …`（已固化为技能 `cn-reachability-probe`，可复跑）
> 原始日志：`D:\a\chee777\scripts\_cf_probe4.log`

## 实测结果

| 目标 | 明文解析 | DoH 解析 | 真 IP + SNI 握手 | 判定 |
|---|---|---|---|---|
| `workers.dev`（apex） | 104.244.46.5 | 45.114.11.238 | — | ⚠️ 两边不一致 → **被投毒** |
| `*.workers.dev`（随机子域） | 202.160.128.203 | 31.13.94.23 | ❌ `ConnectionResetError(10054)` | ⛔ **真封**（解析投毒 + 网络层 RST） |
| `pages.dev`（apex） | 104.18.20.135 / 104.18.21.135 | 一致 | ✅ TLS 通 301，证书 SAN=`pages.dev,*.pages.dev` | ✅ **可用** |
| `*.pages.dev`（随机子域，未部署） | 无记录 | 无记录 | ✅ 104.18.20.135 上握手通（HTTP 530） | ✅ **zone 正常服务 `*.pages.dev`** |
| `dash.cloudflare.com` / `api.cloudflare.com` | — | — | ✅ 可达 | ✅ 可用 |
| `api.github.com`（现用通道） | — | — | ✅ 486ms | ✅ 可用 |

**延迟**：Cloudflare 边缘（pages.dev 真 IP）最好 1047ms / 平均 1061ms；GitHub API 最好 486ms / 平均 506ms
⇒**换到 Cloudflare 后每次同步的往返延迟约翻倍**（这是必须接受的代价，不是故障）。

## 三条关键推论

1. **`*.workers.dev` 在国内不可用**，而且是**双重封锁**：明文解析被投毒成 Facebook 段假 IP（`31.13.x` / `202.160.x`），
   就算绕过 DNS 直连真 CF IP 并带上 `workers.dev` 的 SNI，**CF 边缘也会直接 RST**。
   ⇒ 按 §14 步骤 7 访问 `https://<worker名>.<账号>.workers.dev/health` **在国内必然失败**。
2. **同一个 Cloudflare，不同 zone 待遇不同**：`pages.dev` 解析干净、TLS 正常，`workers.dev` 被封。
   ⇒ 不能笼统说"Cloudflare 在国内能不能用"，必须落到**具体域名**。
3. **`pages.dev` 的随机子域名本来就无 DNS 记录是正常的**（未部署的项目不存在），
   不代表被墙 —— 但**同一个真 CF IP 上带 `*.pages.dev` 的 SNI 能完整握手、证书 SAN 覆盖 `*.pages.dev`**，
   说明 Pages 这个 zone 是通的。

> ⚠️ 该结果只代表**本条网络（家宽）**。4G/5G、校园网要在部署后按 §14 的"国内可用性实测"再各跑一次。

## 修正后的两条路（都不放弃"免费 + 覆盖"）

### 路 A（推荐，**仍然完全免费**）：改用 Cloudflare **Pages** + Pages Function（高级模式）+ KV

- 免费额度与 Workers 同源（Pages 项目本身免费、构建/访问不限量，KV 额度同 §14）。
- URL 变成 `https://<项目名>.pages.dev` —— **实测该 zone 国内可达**。
- **代码几乎不用重写**：Pages 的**高级模式**要求输出目录下放一个 `_worker.js`，用的就是 **Module Worker 语法**
  （官方原文："must be written using the Module Worker syntax"）⇒ 把 `cm-sync-worker.js` 粘进 `_worker.js` 即可。
- **唯一必须加的**：高级模式下你的函数接管全部请求，必须给非 API 路径兜底静态资源，否则报错：
  ```js
  // 放在路由判断的末尾
  return env.ASSETS.fetch(request);
  ```
- KV 绑定配置方式不变（**Dashboard → 项目 → Settings → Bindings → Add → KV namespace**，变量名仍填 `DATA`），
  改完绑定**必须重新部署（Redeploy）**才生效。
- ✅ **部署方式已核实：零安装、零命令行、零 Git 仓库 —— 浏览器拖拽就行。**
  Direct Upload 官方文档原文："**a `_worker.js` file is supported by both Wrangler and drag and drop deployments** made from the dashboard"；
  反之「Drag and drop deployments … **do not currently support** compiling a `functions` folder」——
  **只有 `functions/` 目录才必须用 Wrangler，我们选的正是高级模式，所以拖拽可用。**
  ⚠️ 同页提示：**Direct Upload 项目以后不能切换成 Git 集成**（要自动部署得新建项目）—— 本场景不需要 CI，无影响。
- ⚠️ 残留风险：`*.pages.dev` 也会被按需封（很多钓鱼站用它），不如自有域名稳。

**✅ 已备好、可直接拖进浏览器部署的包：`D:\a\chee777\scripts\cm-pages-sync.zip`（4.7 KB）**
（源目录 `D:\a\chee777\scripts\cm-pages-sync\`；zip 内两个文件都在**根**，无多余目录前缀 —— 拖拽上传取的是 zip 根）

- `_worker.js` —— Pages 高级模式版后端（功能与 `cm-sync-worker.js` 完全一致，只多了一处静态资源回落）
- `index.html` —— 占位静态页（高级模式下非接口路径落到它上面；不含任何数据）
- 本地验收：`node _test_pages_worker.mjs` → **29 项全绿**（额外钉住高级模式特有的路由风险：
  `/health` 与 `/data` 不能被静态资源吞掉、未知路径必须回落 `ASSETS`、没绑 `ASSETS` 也不能 500）

**路 A 部署步骤（浏览器，约 3 分钟，全程零安装）**
1. `dash.cloudflare.com` → **Storage & Databases → KV** → Create namespace，命名 `cm-data`
2. **Workers & Pages → Create → Pages → Drag and drop your files** → 填项目名（如 `cm-sync`）→
   把 `cm-pages-sync.zip` 拖进去 → **Deploy** → 得到 `https://<项目名>.pages.dev`
3. 项目 → **Settings → Bindings → Add → KV namespace**：变量名必须填 **`DATA`**，选 `cm-data`
4. 同页 **Variables and Secrets** → 新增普通变量 `ALLOW_ORIGINS` = `https://cheeeom.github.io`
5. **改完绑定必须再部署一次**（该项目 → Create a new deployment → 重新拖 zip），否则绑定不生效
6. 访问 `https://<项目名>.pages.dev/health` → 应返回
   ```json
   {"ok":true,"kvBound":true,"initialized":false,"ver":null,"bytes":0}
   ```

> §14 里那套「建 Worker → 粘贴代码 → 绑 KV」的八步**只适用于路 B**；走路 A 时按上面 6 步来。

### 路 B（URL 最干净、长期最稳）：Worker + **自有域名**

- 买一个便宜域名（`.top`/`.xyz` 类约 ¥30~70/年），DNS 托管到 Cloudflare，把域名绑到 Worker 的 **Custom Domain**。
- 此时访问走**你自己的域名**（解析到你 Cloudflare 账号里的真 CF IP），**不经过 `workers.dev`**，
  所以 §15 那个封锁完全不适用；代码、绑定、部署步骤全部沿用 §14。
- 代价：不再是 0 成本（但很便宜），且要多做一步域名解析。

### 路 C（兜底）：腾讯云开发 CloudBase

只在 A/B 都跑不通（例如校园网对 CF 全段都不友好）时启用，见 §5。代价：装 SDK + 重写同步层 + 需实名。

## 因此 §14 的部署清单要改两处

| 原步骤 | 改法 |
|---|---|
| 步骤 7 访问 `.../<账号>.workers.dev/health` | 改访问 `https://<项目名>.pages.dev/health`（路 A）或 `https://<你的域名>/health`（路 B） |
| 前端接入 ① `SYNC_API` 常量 | 值相应改为 `https://<项目名>.pages.dev` 或 `https://<你的域名>` |

其余（客户端加密、TOFU 配对、`PUT /data` 覆盖写、`If-Match`、CORS 白名单、换个口令=删 `_auth`）**全部不变**。

## 待办

- [ ] 老板拍板走路 A 还是路 B（要不要买域名）
- [ ] 决定后：部署 → 用 `reach_probe.py --latency` 复测 → 再动 `index.html`（发版级，37 文件/183 处版本锁）
- [ ] 手机 4G/5G + 校园网各实测一次 `/health`

---

# 16. 追问五：私有仓 + 定期滚仓（老板提的方案）—— 可行，改动小，但有两个前置条件

> 起因：老板不接受 Cloudflare 那条路「同步慢约一倍」，主动提出改用私有仓 + 定期滚仓把体积清零。
> 本节结论均基于**读源码 + 实探 token 权限 + 实探 CORS**，不是估算。

## 16.1 好消息：推送路径一行都不用改

推送本来就是打 `api.github.com/repos/<o>/<r>/contents/data.json`（带 sha 乐观锁），
`GH_OWNER/GH_REPO/GH_DATA_PATH` 四个常量**只被同步层引用**（L3832 推送 / L6503 验 Token / L12147 清空强推 / L12201 换口令重推），
没有任何 UI、文档链接、Pages 地址用到它们 ⇒ **把常量指到私有数据仓，四个写入路径自动全部跟过去，零额外改动**。

真正的改动只在**拉取**：现在是匿名读 Pages 上的静态 `./data.json`，私有仓没有 Pages（Free 计划不支持私有仓 Pages），必须改走带 Token 的 Contents API。

而且**解码逻辑已经有了** —— `fetchCloudMeta()`（L3799，v2.20.0 为修 >1MB 加的）本就负责「带 Token GET + base64 解码 + content 为空时追加 raw 媒体类型兜底」，返回 `{sha, remote}`。
它现在只被推送用，**拉取直接复用它即可**，不用新写解码。

## 16.2 改动清单（≈28 行，6 处，全在同步层）

| # | 位置 | 现状 | 改法 | 行数 |
|---|---|---|---|---|
| 1 | L3561-3564 常量 | `GH_OWNER/GH_REPO` 指向**站仓** | 改名并指向**数据仓**（如 `GH_DATA_OWNER/GH_DATA_REPO`），4 处引用一次到位 | ~6 |
| 2 | 新增 `fetchCloudEnvelope()` | 无 | 复用 `fetchCloudMeta()`，返回 `meta.remote`；404 时给人话提示 | +8 |
| 3 | `autoSyncFromCloud()` L6389 | `fetch('./data.json?t=…')` 匿名 | 换成 `fetchCloudEnvelope()`（去掉 `.then(r=>r.json())`） | ~3 |
| 4 | `pullFromCloud()` L6553 | 同上 | 同上 | ~3 |
| 5 | `restoreFromCloud()` L6582 | 同上 | 同上 | ~3 |
| 6 | `configGHToken()` L6503/L6512 | 用「GET data.json == 200」验 Token，**404 判成无权限** | 改为「GET `/repos/{o}/{r}`」验仓库可达（新仓还没 data.json 时也能存下 Token） | ~5 |

**完全不动的**：`doPushToCloud` / `checkPushSafety` / `fetchCloudMeta` / `smartMergeData` / `applyCloudData` / `buildCloudPayload` / `encryptForCloud` / `decryptFromCloud`。

**测试影响**：`_sync_test.js` 与 `_v2191fix_test.js` 各自 `global.GH_OWNER=…` 注入常量，**不受常量值变化影响**；
其余 50 套无一处断言 `./data.json` 或 `getDataJsonUrl` ⇒ **语义上零破坏**。
真正的成本不是这 28 行，而是**任何 `index.html` 改动都要跟版**（37 个测试文件 / 183 处版本锁）。

**顺带的一处文案要向老板确认**：L2755 与 L3637 写明「本仓库是公开的，未加密时 data.json 任何人可下载」——
搬到私有仓后这句话不再成立，需同步改（~2 行）；`configGHToken()` 弹窗里的「仅授权本仓库 cheeeom/class-manager」也要改成数据仓名。

## 16.3 滚仓好不好操作：一条命令，脚本已自带防呆

`python cm-make-data-repo.py roll cheeeom/class-manager-data --yes --if-over=200`

现有脚本的执行序（已读源码确认，**不会丢数据**）：
1. 读仓库现状与体积 → 未达 `--if-over` 阈值则**直接跳过**（所以可以放心挂定时任务）
2. 读云端最新 `data.json`，**校验必须是密文信封**（明文一律中止）
3. **先备份到本机** `_data_backup\<repo>.<时间戳>.data.json`（滚仓失败时用它救回）
4. 删仓 → 重建同名仓（保持原可见性）→ 写回**同一份密文**

⇒ 日常使用**零操作**；唯一周期动作是「想起来跑一条命令」。按 200MB 阈值、当前 670MB/年的速率，约**每 3~4 个月一次**。

## 16.4 ⚠️ 两个前置条件（必须老板处理）

### 前置①：现在的 Token **没有删仓权限** —— 实测确认

```
X-OAuth-Scopes: gist, repo, workflow
```
这是 classic token（`gho_` 前缀，40 位）。`repo` 能建仓、能读写内容、能管 Pages，**但不含 `delete_repo`**
⇒ 现在直接跑 `roll` 会在 DELETE 那一步 **403 中止**（脚本会报错，不会删一半留一半）。

- 补法：`gh auth refresh -s delete_repo`（会走一次设备码授权）
- 🔒 **这个"管理员 token"只放老板自己的电脑**，**绝不放进任何老师设备**：
  老师设备上用 fine-grained PAT，只授权**数据仓**、只给 **Contents: Read and write** —— 删不掉仓库，也碰不到站仓。

### 前置②：私有仓 = **拉取也需要 Token**（现在是匿名可拉）

- 现在：新设备即使没配 Token，也能从 Pages 拉到云端数据（只是推不上去）。
- 改后：没 Token ⇒ 连读都读不到（HTTP 404/403）。**Token 失效 = 读写全断**，不再是「只断写」。
- 换设备/加设备时必须先配好 Token 才能看到数据。这是私有化的必然代价。

### 附带注意：滚仓瞬间有 3~10 秒窗口

删仓→重建之间，其他设备若刚好在拉/推会失败一次。推送侧是「先 GET 拿 sha，GET 失败即中止」⇒ **不会写坏数据**，
`autoPushToCloud` 的退避重试会兜住；拉取侧只是这次没数据。**挑没人在用的时候跑**即可。

## 16.5 顺带否掉两条路（都有实测证据）

### ❌ GitHub Releases 资源（理论上唯一的「真覆盖」槽位）—— 浏览器用不了

Releases 资源删旧传新、且**不计入仓库体积**，本来是「真覆盖 + GitHub 速度」的唯一希望。实测：

| 环节 | 结果 |
|---|---|
| 读：`GET /repos/{o}/{r}/releases`、`/releases/assets/{id}` | ✅ **`Access-Control-Allow-Origin: *`**（跨域读没问题） |
| 写：`OPTIONS https://uploads.github.com/…/releases/1/assets` | ❌ **HTTP 400 且无任何 ACAO 头** ⇒ 浏览器预检不过，**根本传不上去** |

⇒ **浏览器应用无法上传 release 资源**（除非再架一个代理，那就又要回到 Cloudflare 的坑）。
**结论：GitHub 上没有「既保持现有速度、又能真覆盖」的路。** 只能在「快 + 伪覆盖（定期滚仓）」与「慢 + 真覆盖（KV）」之间二选一 —— 老板选对了方向。

### △ 压缩后再加密（gzip → AES-GCM）：能帮，但**不要当成主要手段**

文本 JSON 一般能压 5~7 倍，但负载里可能含 `scheduleImage` / `classAvatar` 的 **base64 图片（压不动）**，
所以整体收益取决于图片占比 —— 若图片占 1/3，108KB 文本 → ~16KB + 图片 40KB，整体只省 **约 2 倍**。
好处是**与后端无关**（哪条路都能用），还能顺带让上传快一点；坏处是改 `encryptForCloud`/`decryptFromCloud`（信封加 `zip:1`，向后兼容 ~25 行）。
⇒ 定位为**可选加分项**，不是主力；主力仍是滚仓。

## 16.6 结论与建议顺序

**答案：这条路「好操作、改动小」—— 操作比 Cloudflare 那条更省心（一次建设 + 偶尔一条命令），代码只动 ~28 行；
真正的成本是「任何 index.html 改动都要跟版」（37 文件 / 183 处），那是这个项目的固定税，跟选哪条路无关。**

推荐执行顺序（**顺序错了会分叉**）：

1. 老板补 `delete_repo` 权限（`gh auth refresh -s delete_repo`）
2. 建私有数据仓 `cheeeom/class-manager-data`（`cm-make-data-repo.py create`）
3. 补齐 roll 脚本的前置检查（缺 `delete_repo` 时给人话提示，而不是跑一半 403）
4. 写 `index.html` 补丁（§16.2 的 6 处）+ 新增版本无关断言的测试 → 走发版流程
5. **发版**
6. 紧接着 `copy` 迁移密文到私有仓（脚本实时读当期密文，所以要在切换那一刻跑）
7. 各设备配好**新 Token**（fine-grained，仅数据仓 Contents RW），确认拉得到数据
8. 观察一天，再把站仓里的 `data.json` 删掉（防止没更新到的旧客户端偷偷往旧位置写，造成两处数据分叉）

> ⚠️ 第 8 步的道理：Service Worker 缓存名随版本号变化 ⇒ 设备下次打开会拿到新版前端；
> 但只要有设备还没更新，它就会继续往**站仓**推 —— 删掉旧的 `data.json` 能让这类旧客户端**响亮的失败**而不是静默分叉。

---

# 17. 操作手册（照着点就行）

> 只要看到 `D:\a\chee777\scripts\...` 就是**你这台电脑**上的文件。
> 已经替你做完的：私有数据仓 `cheeeom/class-manager-data` 已建好（private · 0 KB）、滚仓脚本已加体检与防呆、两个双击即用的 .bat 已就位。

## 总览：一共三段，一共约 15 分钟的手工操作

| 阶段 | 谁做 | 耗时 | 内容 |
|---|---|---|---|
| **第 0 步** | 你 | ~5 分钟 | 生成两枚 Token（一次性） |
| **第 1 步** | 我 | — | 改 `index.html`（28 行）+ 发版 |
| **第 2 步** | 你 | ~10 分钟 | 迁移密文 + 各设备配 Token + 验证 |
| **第 3 步** | 你 | 每 3~4 个月 1 分钟 | 双击一下滚仓 |

---

## 第 0 步 · 现在就能做（一次性）

### 0.1 生成「管理员 Token」—— 滚仓用，**只放你这台电脑**

**第 1 步：打开经典 token 的创建页**

浏览器直接开这个地址（就是 classic 的创建表单）：

```
https://github.com/settings/tokens/new
```

如果打不开或跳到了别处，用鼠标点这条路（一定不会错）：
头像（右上角）→ **Settings** → 左侧栏拉到最底 **Developer settings** →
**Personal access tokens** → **Tokens (classic)** → **Generate new token** → **Generate new token (classic)**

> ⚠️ 页面上会同时存在 Fine-grained 和 classic 两套入口。**认准 `(classic)` 这几个字**，
> 因为 `delete_repo` 这个权限**只存在于 classic**。

**第 2 步：填表（只有 3 处要动）**

| 表单项 | 填什么 |
|---|---|
| **Note** | `cm-roll-admin` |
| **Expiration** | 选 **No expiration**（否则到期那天滚仓会突然失效，你会以为是脚本坏了） |
| **Select scopes** | 勾**两个**方框 ↓ |

要勾的两个方框：

- ☑ **`repo`** —— 在列表**最上面**，勾它那**整块**（勾了大框，下面子项会自动全勾，不用管）
- ☑ **`delete_repo`** —— 拖到**最下面**，在 **Admin** 区域里（就这一个）

**第 3 步：生成并复制**

1. 滚到页面最底部 → 点绿色的 **Generate token**
2. 页面顶部会出现一串**绿底、`ghp_` 开头**的字符串
3. 点它**右边那个复制图标**（两个方块叠在一起的样子）
   ⚠️ **这串只显示这一次**，一刷新就永远看不到了

**第 4 步：存进文件（文件已经替你建好了，只需替换内容）**

1. 打开这个文件（双击即可，会用记事本打开）：
   ```
   D:\a\chee777\scripts\_gh_token_admin.txt
   ```
   里面现在只有一行字：`PASTE_YOUR_ghp_TOKEN_HERE`
2. **Ctrl+A 全选 → Delete 删掉那一行 → Ctrl+V 粘贴刚才复制的 token**
3. **Ctrl+S 保存** → 关掉记事本
   ⚠️ 别用「另存为」、别改文件名、别加引号、别敲多余的空行

**第 5 步：验收**

双击 👉 `D:\a\chee777\scripts\cm-doctor.bat`

看到这两行就成功了：

```
  管理员 token（…xxxx）：已配置
      滚仓（删仓重建）：✅ 可以
```

若还是提示「文件已就绪，但里面还是占位符」→ 说明第 4 步没保存成功（回记事本 Ctrl+S 一次再关）。
若提示 `❌ 缺 delete_repo` → 第 2 步漏勾了 `delete_repo`，回第 2 步重新生成一枚。

> 🔒 这枚 token 权限很大（能删你名下任何仓库）——**只放你这台电脑，永远不要放进老师设备、不要发微信、不要写进代码**。

### 0.2 生成「设备 Token」—— 每台要同步的设备一枚

> 建议**一台设备一枚**（名字带上设备名），这样哪台丢了就吊销哪台，不用惊动其他设备。

1. 浏览器打开 👉 https://github.com/settings/personal-access-tokens/new
   （这就是 Fine-grained token 的生成页）
2. **Token name** 填设备名，例如 `cm-sync-iPad`
3. **Expiration** 选 **No expiration**（定档理由见 §R3；**不建议 90 天**——到期日全部设备同时失效）
4. **Repository access** 选 **Only select repositories** →
   下拉里**只勾** `cheeeom/class-manager-data`
   ⚠️ **不要勾** `class-manager`（站仓）—— 让设备碰不到代码，只能碰数据
5. **Permissions** → 展开 **Repository permissions** → 找到 **Contents** → 改成 **Read and write**
   （其余所有项**保持 No access**，一个字都不用改）
   ℹ️ 生成后的确认页会写 **「2 permissions for 1 repository」**：`Contents` + **`Metadata: Read-only`**。
   **Metadata 是 GitHub 强制自带、取消不掉的**，不是你多勾了 —— 别回头去改它。它也正是前端保存 Token 时
   那次校验（`GET /repos/{owner}/{repo}`）所依赖的权限，所以有它反而是好事。
   ⚠️ 真正要核的是那 **「1 repository」是不是 `cheeeom/class-manager-data`**（不能是 `class-manager` 站仓）。
6. 点 **Generate token** → 复制那串 **`github_pat_`** 开头的值

> ✅ **v2.20.7 已于 2026-09-19 上线，这个「先别填」的限制解除了** —— 生成一枚就能直接填一枚，不用再等。
> （历史原因：旧前端的 Token 校验读的是站仓 `data.json`，拿只授权数据仓的 token 会被误判成「无权限」。
> 新前端的校验已改成「仓库本身可不可达」，所以数据仓专用 token 能正常通过。）

---

## 第 1 步 · 我这边做（你只需等我）

改动就是 §16.2 那张表的 **6 处 / 约 28 行**，外加一个新测试文件。
发版后你在工作台**设置页**能看到版本号变成新版，就说明设备已经更新到新版前端了。

---

## 第 2 步 · 切换当天（约 10 分钟）

### 2.1 把密文迁到私有仓

双击 `D:\a\chee777\scripts\cm-doctor.bat`（确认没异常），然后命令行跑：

```
cd /d D:\a\chee777\scripts
"C:\Users\84669\.workbuddy\binaries\python\versions\3.13.12\python.exe" cm-make-data-repo.py copy cheeeom/class-manager data.json cheeeom/class-manager-data
```

它会：读站仓最新密文 → **校验必须是密文**（是明文就中止）→ 写到私有仓 → 自动复核一遍。
成功会打印 `已写入 cheeeom/class-manager-data/data.json` 和 `内容 密文信封`。
（密文自带 salt，**口令不用改、不用重新加密**）

### 2.2 每台设备配上新 Token

在**每台**要同步的设备上：

1. 打开工作台 → **设置页** → 找到 **「配置 GitHub Token」**
2. 粘贴 0.2 生成的那串 `github_pat_...`
3. 应弹出 **「Token 验证通过」**（若报无权限，见文末常见问题）
4. 再点 **「从云端拉取」** → 提示合并成功 / 云端 N 人，就说明**读也通了**

> ⚠️ 一个顺序要点：**先把所有设备都换好 token 并验证过，再往下走**。
> 只换一半的话，没换的设备会继续往站仓推，就分叉了。

### 2.3 观察一天，然后清掉旧位置

等一天（确保所有设备都打开过一次、都拿到了新版前端），再删站仓里的 `data.json`。
把这句话给我，我来执行：

> 「删掉站仓的 data.json」

删掉的意义：万一还有设备没更新，它会继续往站仓推 —— 删掉能让它**响亮报错**，
而不是悄悄在旧位置攒出一份分叉数据。

---

## 第 3 步 · 日常维护：双击一下

**每 3~4 个月**（脚本会自己判断够不够量，不够就跳过，跑一下没成本）：

双击 👉 `D:\a\chee777\scripts\cm-roll.bat`
→ 看到提示后输入 `Y` 回车 → 它自己完成删仓重建。

想随时看状态（不删任何东西）：双击 👉 `cm-doctor.bat`。

命令行等价写法（一样的）：

```
python cm-make-data-repo.py roll cheeeom/class-manager-data --yes --if-over=200
```

**滚仓前只需确认一件事**：此刻没有别的设备在同步（把其他设备上的工作台页面关掉）。
删仓→重建之间有几秒窗口，那期间别的设备拉取会失败一次（会自动重试，**不会写坏数据**）。
脚本在删之前会**先备份一份到 `D:\a\chee777\scripts\_data_backup\`**，出事能救。

---

## 常见问题

| 现象 | 原因 / 做法 |
|---|---|
| 设备提示「Token 已失效或权限不足」 | 该设备那枚 token 被吊销或到期了 → 重做 0.2，在该设备设置页换成新的 |
| 滚仓报 `403` 或提示缺 `delete_repo` | 0.1 没做或漏勾 `delete_repo`；重做 0.1 覆盖 `_gh_token_admin.txt` |
| 双击 .bat 窗口一闪就没了 | 右键 .bat → 编辑，检查 python 路径是否存在（换机器才需要改） |
| 设备拉不到数据（提示 404） | ① 那台设备 token 没配 / 配错仓 ② 云端确实还没数据（先在某台设备上**推送**一次） |
| 怕两处数据分叉 | 别跳过 2.2 的「所有设备先换完」；真分叉了以内容多的那份为准，重新 `copy` 过去即可 |
| 想彻底重置云端（忘了口令等） | 见 §14「换口令」：删 KV/仓库里的数据后重推。**这条与私有仓无关，别乱删仓库** |

---

# 18. 追问六：能不能**现在就直接**迁移？要注意什么？

## 18.1 能。一条命令，不停机、不影响现网

```
cd /d D:\a\chee777\scripts
"C:\Users\84669\.workbuddy\binaries\python\versions\3.13.12\python.exe" cm-make-data-repo.py copy cheeeom/class-manager data.json cheeeom/class-manager-data
```

它只**读**站仓、只**写**私有仓 ⇒ 站仓一个字都不改，白天上课时跑也没事。

## 18.2 但有一条硬规矩：**迁移是快照，不是同步**

> 🚫 **迁完之后不能就那么放着 —— 迁移必须和「代码发版」配对，发版那一刻要再迁一次。**

原因：迁完之后**站仓那边还在继续长**（前端还指着它）。
若 9/20 迁了、9/25 才发版，发版后前端读到的就是 **9/20 的旧快照**。
而合并逻辑 `smartMergeData` 是**按 id 并集** ⇒ 旧快照里「已经被删掉/清空」的数据会被当成内容**并回**本机与云端
（这正是 v2.11.3 花大力气堵的「旧数据复活」）。
**空云端是安全的**（404 就当本地继续用），**陈旧快照才是雷**。

两种排期任选：

| 排期 | 做法 |
|---|---|
| **推荐** | 发版**当刻**再迁：发版 → 立刻 `copy`（脚本实时读当期密文）→ 各设备换 Token → 观察一天 → 删站仓 `data.json` |
| 想现在就迁 | 现在先迁一份（**零风险，因为没人读它**）→ **发版那天必须再迁一次（覆盖）** → 之后同上 |

**迁完绝不能马上删站仓的 `data.json`** —— 前端还指着它，删了现网立刻读不到数据。

## 18.3 迁移前后要注意的 7 件事

1. **只迁密文**：脚本强制校验，不是 `enc:1` 密文信封**直接中止**，绝不让明文离开本机。
2. **口令不用改**：密文自带 salt，多设备一致；迁移**不需要重新加密**，老师端什么都不用做。
3. **迁移不停机**，但**滚仓（roll）要挑没人在用的时段**。
4. **两种 Token 别混用**：管理员 Token（能删仓）只放你电脑；每台设备用各自的 fine-grained Token，只授权数据仓 Contents 读写。
5. **别把新 Token 提前填进设备**：旧版前端的校验方式读的是站仓，会误报「无权限」。等发版后再填。
6. **所有设备都换完 Token 再删旧位置**：漏一台它就会继续往站仓写 → 两处数据分叉。
7. **动手前先留本地快照**（已替你存了第一份，随时可再跑）：
   ```
   python cm-make-data-repo.py backup cheeeom/class-manager
   ```
   已存：`_data_backup\cheeeom_class-manager.20260918-230030.data.json`（168 KB，blob `0904b67a5e`）

## 18.4 滚仓改成「全手动」+ 只读提醒（按老板要求）

- **不做任何自动滚仓**。滚仓时机完全由老板自己决定，脚本只在他双击 `cm-roll.bat` 时才动。
- 已挂一个**只读**的月度提醒（自动化任务「class-manager 数据仓体积提醒（只读）」）：
  每月 1 号上午 9 点跑一次体检 + 体积检查，
  - 数据仓 **≥ 130 MB** → 提醒「该滚仓了」，附当前体积、距 200 MB 滚仓线还有多久、以及双击 `cm-roll.bat` 的操作方式；
  - **< 130 MB** → 只回一行「健康，暂不需要滚仓」；
  - 若发现站仓 `data.json` 还在长 → 说明剥离迁移尚未完成，提醒还差这一步。
- 该任务**只读**，不会执行 roll / 删仓 / copy 等任何写操作。

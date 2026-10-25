# 新皮肤设计稿 v3.8.x（三选N，待老板拍板——未动代码）

> 设计基线：现有皮肤系统（朱砂·纸墨默认 / 青花·月白 / 竹青·苔痕）。
> 三套候选补齐传统色余下的三个大族：**黄（藤黄）/ 紫（紫檀）/ 墨（松烟）**——与已有红/蓝/绿零色相重叠。
> 全部令牌已过 _v3400 同款 WCAG 对比度闸（33 项全达标，数值见文末与 _SKIN_VERIFY_v380.js）。
> 落地 = 按 AGENTS.md 操作单：浅/暗两 CSS 块 + CM_SKINS/CM_SKIN_META/CM_GRP_COLORS 登记 + 外观卡 chip + 守卫矩阵扩表。

---

## 候选一：藤黄·杏坛（key: tenghuang）—— 暖金 · 杏坛育人

寓意：杏坛为孔子讲学之地，「藤黄」为传统国画颜料——最贴合班主任职业的一套。

| 令牌 | 浅色 | 暗色 |
|---|---|---|
| --primary | #8A6210 | #B08A2E |
| --primary-light / lighter | #A67E1F / #E3D3A6 | #C9A23E / #4A3A10 |
| --primary-dark / deeper | #6B4A0C / #523807 | #7A5A10 / #5C4408 |
| --primary-bright | #9C7412 | #B08A2E |
| --bg / secondary / card / row | #F7F3E7 / #EFE9D5 / #FFFDF4 / #FAF6E9 | #1A170F / #262216 / #211D12 / #262216 |
| --text / secondary / muted | #33301F / #5E5945 / #8B8468 | #EDE7D2 / #B0A88C / #7E7860 |
| --border | #E2DCC4 | #3A3420 |
| --grp-cul/maj/art/gen | #8A6210 / #2F7D5B / #6B5B95 / #2F5D6E | 深端(暗色用浅彩)：#D9BC6E / #A8C89A / #C3B2E0 / #92C4B4 |

签名细节：「金榜题线」——卡片顶部 2px 金色渐隐线（呼应金榜题名，与青花 1px 釉口线区分）。

## 候选二：紫檀·暮山（key: zitan）—— 深紫 · 高级沉静

寓意：紫檀木之深沉 + 王勃「烟光凝而暮山紫」。

| 令牌 | 浅色 | 暗色 |
|---|---|---|
| --primary | #5A4470 | #9B7FC0 |
| --primary-light / lighter | #73618A / #D4CBDE | #B29CD1 / #3E3050 |
| --primary-dark / deeper | #463557 / #342743 | #3E3050 / #2C2138 |
| --primary-bright | #675084 | #9B7FC0 |
| --bg / secondary / card / row | #F3F1F5 / #EAE7EE / #FDFCFF / #F7F5FA | #17141B / #221E2A / #1E1A24 / #221E2A |
| --text / secondary / muted | #2E2A38 / #5B5566 / #87819A | #E8E4EE / #ADA5BC / #7C748E |
| --border | #DCD8E4 | #373044 |
| --grp-cul/maj/art/gen | #5A4470 / #8C6239 / #2F5D6E / #2F7D5B | 深端：#C4B3DC / #D2B08C / #9FC3D1 / #8FCBAE |

签名细节：「暮霭」——卡片右上角一层极淡的紫色霭光（radial 渐隐，零布局占位）。

## 候选三：松烟·墨池（key: songyan）—— 墨色 · 极简水墨

寓意：松烟墨（古法制墨）+ 墨池（王羲之洗笔成墨池）。近单色水墨，最低调高级的一套。

| 令牌 | 浅色 | 暗色 |
|---|---|---|
| --primary | #3D4450 | #76839A |
| --primary-light / lighter | #59626F / #C8CDD4 | #93A0B3 / #2E343C |
| --primary-dark / deeper | #2C313A / #1F232A | #2A2F38 / #1C2027 |
| --primary-bright | #4A525E | #76839A |
| --bg / secondary / card / row | #F1F2F1 / #E8EAE8 / #FDFEFD / #F6F7F6 | #131518 / #1D2025 / #191C20 / #1D2025 |
| --text / secondary / muted | #2B2E33 / #565B63 / #82888F | #E5E9EC / #A6AEB8 / #737B85 |
| --border | #D9DCDF | #2E343C |
| --grp-cul/maj/art/gen | #3D4450 / #8C6239 / #6B5B95 / #2F7D5B | 深端：#B9C2CF / #D2B08C / #C3B2E0 / #8FCBAE |

签名细节：「墨脊」——卡片左侧 2px 内阴影墨脊（书脊装帧感，内阴影零布局占位）。

---

## 对比度实测（全部达标，验证器：_SKIN_VERIFY_v380.js）

| 套 | text/card 浅 | muted/card 浅 | 白字/主色 浅 | text/card 暗(≥7) | 白字/主色 暗(≥3) |
|---|---|---|---|---|---|
| 藤黄·杏坛 | 13.02 | 3.68 | 5.48 | 13.58 | 3.22 |
| 紫檀·暮山 | 13.66 | 3.64 | 8.41 | 13.65 | 3.39 |
| 松烟·墨池 | 13.48 | 3.54 | 9.81 | 14.00 | 3.83 |

## 实施清单（拍板后按 AGENTS.md 操作单执行，估 1 个工作节/三套全做）

1. index.html：每套加 `html[data-skin=key]`（浅，置于 html.dark 前）+ `html.dark[data-skin=key]`（暗，置于后）+ 签名细节 CSS；
2. JS 三处登记：CM_SKINS / CM_SKIN_META（含 chip 圆点色）/ CM_GRP_COLORS；
3. 设置页外观卡加 chip（自动渲染，仅需 META 登记）；meta theme-color 随肤已机制化；
4. _v3400 对比度矩阵扩表（3 套→6 套 × 明暗）+ 令牌契约表扩表；
5. _v3300 肤免检查 + 明暗双模式零像素比对（_verify_v330）；
6. 全量回归 + 本地预览截图交老板。

## 老板拍板点

- □ 三套全做 / 只做其中几套（说编号：1 藤黄 2 紫檀 3 松烟）？
- □ 命名是否满意（chip 上显示的名字）？
- □ 签名细节风格是否要调（现在是「金榜题线 / 暮霭 / 墨脊」三种不同手法）？

# -*- coding: utf-8 -*-
"""v3.5.0 学期结算重置：学期卡 + 结算弹窗 + 存档管理 + 划界流水 + 币/重算/公示/撤销全链豁免 + 跟版。"""
import io, sys

P_HTML, P_SW = 'index.html', 'sw.js'

def rd(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()

def wr(p, s):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)

def rep1(s, old, new, tag):
    n = s.count(old)
    assert n == 1, '%s: 锚点命中 %d 次（应为 1）' % (tag, n)
    return s.replace(old, new)

html = rd(P_HTML)
assert '\r\n' not in html, 'index.html 出现 CRLF，先归一'

# ── 1) STATE_SCHEMA：semester / semesterHistory（进云同步白名单） ──
html = rep1(html,
  "  { key:'creditBank', def:function(){ return cbDefaultBank(); }, cfs:1, ms:'creditBank' },   // v2.17.30 学分银行（双轨账本）",
  "  { key:'creditBank', def:function(){ return cbDefaultBank(); }, cfs:1, ms:'creditBank' },   // v2.17.30 学分银行（双轨账本）\n"
  "  { key:'semester', def:function(){ return { name:'', startAt:0 }; }, cfs:1, ms:'semester', sv:function(v){ return (v && typeof v === 'object') ? v : { name:'', startAt:0 }; } },   // v3.5.0 当前学期（学期结算重置）\n"
  "  { key:'semesterHistory', def:function(){ return []; }, cfs:1, ms:'semesterHist', sv:function(v){ return v || []; } },   // v3.5.0 往期学期存档（每人学分/币快照，可导出）",
  'schema-semester')

# ── 2) MERGE_ST 注册 ──
html = rep1(html,
  "  scalarFill:msScalarFill, tsmap:msTsMap, max1:msMax1, max0:msMax0, tsNewer:msTsNewer\n};",
  "  scalarFill:msScalarFill, tsmap:msTsMap, max1:msMax1, max0:msMax0, tsNewer:msTsNewer,\n"
  "  semester:msSemester, semesterHist:msSemesterHist\n};",
  'merge-map')

# ── 3) 合并策略实现（挂在 msTsNewer 之后） ──
html = rep1(html,
  "function msTsNewer(merged,localData,remoteData,key){ if(remoteData[key]&&(!localData[key]||remoteData[key]>localData[key]))merged[key]=remoteData[key]; }   // timestamps: 较新者胜",
  "function msTsNewer(merged,localData,remoteData,key){ if(remoteData[key]&&(!localData[key]||remoteData[key]>localData[key]))merged[key]=remoteData[key]; }   // timestamps: 较新者胜\n"
  "// v3.5.0 学期结算：当前学期按 startAt 新者胜（重置只在单设备发生，合并取较新学期）\n"
  "function msSemester(merged,localData,remoteData,key){\n"
  "  var l=localData[key]||null,r=remoteData[key]||null;\n"
  "  if(!r||!r.startAt) return;\n"
  "  if(!l||!l.startAt||(r.startAt>l.startAt)) merged[key]=r;\n"
  "}\n"
  "// v3.5.0 学期存档：按 id 并集（存档只增；单机删除不传播，避免多设备合并互相复活）\n"
  "function msSemesterHist(merged,localData,remoteData,key){\n"
  "  var ids={}; (merged[key]||[]).forEach(function(h){ ids[h.id]=true; });\n"
  "  merged[key]=merged[key]||[];\n"
  "  (remoteData[key]||[]).forEach(function(h){ if(h&&h.id!=null&&!ids[h.id]) merged[key].push(h); });\n"
  "}",
  'merge-fn')

# ── 4) 公示周期统计豁免 settle（防污染进步榜/净变动/零扣分榜） ──
html = rep1(html,
  "  var ops = (operations || []).filter(function(o){ return o && !(o.state === 'revoked') && typeof o.time === 'number' && o.time >= t0; });   // v2.17.9 已撤销不进公示",
  "  var ops = (operations || []).filter(function(o){ return o && !o.settle && !(o.state === 'revoked') && typeof o.time === 'number' && o.time >= t0; });   // v2.17.9 已撤销不进公示；v3.5.0 学期结算划界流水不进周期统计（防污染进步榜/净变动）",
  'pub-filter')

# ── 5) 命门：币重算迁移豁免 settle（否则 coin=0 被重算 = 全班凭空生币） ──
html = rep1(html,
  "    if((Number(o.amount) || 0) <= 0) continue;     // 扣分不发币：不写 coin，也不计入回迁笔数",
  "    if(o.settle) continue;                         // v3.5.0 学期结算划界流水：不发币、不参与重算（coin 恒 0，防凭空生币）\n"
  "    if((Number(o.amount) || 0) <= 0) continue;     // 扣分不发币：不写 coin，也不计入回迁笔数",
  'recoin-skip')

# ── 6) 撤销守卫：划界流水不可撤销 ──
html = rep1(html,
  "  if(window.__cmRole === 'committee' && !cmOwnSessionOp(op)){\n    showToast('班委模式只能撤销本次自己的操作记录', 'warning');\n    return;\n  }\n  op.state = 'revoked';",
  "  if(window.__cmRole === 'committee' && !cmOwnSessionOp(op)){\n    showToast('班委模式只能撤销本次自己的操作记录', 'warning');\n    return;\n  }\n"
  "  if(op.settle){\n    showToast('学期结算划界流水不可撤销（往期数据见设置 → 学期存档）', 'warning');\n    return;\n  }\n"
  "  op.state = 'revoked';",
  'revoke-guard')

# ── 7) 学分页学期状态条挂载点 ──
html = rep1(html,
  '      <div class="page" id="page-credits">\n        <div class="card" style="margin-bottom:16px">\n          <div class="section-title"><span class="dot"></span>学分操作</div>',
  '      <div class="page" id="page-credits">\n        <div id="semesterStripHost"></div>\n        <div class="card" style="margin-bottom:16px">\n          <div class="section-title"><span class="dot"></span>学分操作</div>',
  'strip-host')

# ── 8) 结算弹窗 HTML（插在学生选择弹窗注释前） ──
MODAL_HTML = '''<!-- Modal: 学期结算重置（v3.5.0，班主任专属） -->
<div class="modal-overlay" id="semesterResetModal">
  <div class="modal" style="max-width:560px;width:94vw">
    <h3>学期结算 · 重置学分</h3>
    <div class="modal-body">
      <div id="semesterResetSummary" style="font-size:14px;line-height:1.9"></div>
      <div class="form-group" style="margin-top:12px">
        <label>新学期名称</label>
        <input type="text" id="semesterNewName" placeholder="如：2027 春季学期" maxlength="30" autocomplete="off" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit">
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13.5px;cursor:pointer">
        <input type="checkbox" id="semesterClearCoins"> 同时清空学分币（未兑换余额归零，银行账本留痕）
      </label>
      <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">
        结算动作：当前学分自动存档为往期学期（设置 → 📚 学期存档，可导出 JSON）→ 每人写一条「学期结算」划界流水并重置为 100 分。划界流水不可撤销、不出现在时间线统计口径之外；不进公示统计（进步榜/净变动不受污染）。
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('semesterResetModal')">取消</button>
      <button class="btn btn-primary" id="semesterResetConfirmBtn" onclick="confirmSemesterReset()">确认结算并重置</button>
    </div>
  </div>
</div>

'''
html = rep1(html, '<!-- Modal: Student Select (for committee, seating, duty) -->', MODAL_HTML + '<!-- Modal: Student Select (for committee, seating, duty) -->', 'modal-html')

# ── 9) 设置页学期存档卡（行级插入到 settingsAbout 之前） ──
lines = html.split('\n')
idx = [i for i, ln in enumerate(lines) if 'id="settingsAbout"' in ln]
assert len(idx) == 1, 'settingsAbout 命中 %d 处' % len(idx)
ARCHIVE_CARD = (
  '<div class="settings-section" id="settingsSemester">\n'
  '          <h3>📚 学期存档</h3>\n'
  '          <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">「学期结算」时自动生成的往期快照（每人学分 / 币余额）。可导出 JSON 留底；删除仅移除本条存档，不影响学生当前数据。</div>\n'
  '          <div id="semesterArchiveList" style="font-size:13px;line-height:1.9"></div>\n'
  '</div>'
)
lines.insert(idx[0], ARCHIVE_CARD)
html = '\n'.join(lines)

# ── 10) renderCreditsPage 挂学期状态条 ──
html = rep1(html,
  "function renderCreditsPage(){\n  renderReasonSelects();",
  "function renderCreditsPage(){\n  updateSemesterStrip();   // v3.5.0 学期状态条\n  renderReasonSelects();",
  'credits-hook')

# ── 11) renderSettings 挂存档卡渲染 ──
html = rep1(html,
  "function renderSettings(){\n  document.getElementById('classNameInput').value = state.className;",
  "function renderSettings(){\n  renderSemesterArchive();   // v3.5.0 学期存档卡\n  document.getElementById('classNameInput').value = state.className;",
  'settings-hook')

# ── 12) 核心函数块（插在 undoLastOp 之前） ──
CORE_JS = '''/* ==================== 学期结算重置（v3.5.0） ====================
   学期初把全班学分重置为 100 分：
   ① 当前数据自动存档 semesterHistory（每人学分/币余额快照，可导出 JSON）；
   ② 每人写一条「学期结算」划界流水（settle=true、coin=0、不可撤销）并重置为 100 分
      —— credit = creditBase + Σ流水 不变式保持；撤销与币重算迁移均已豁免 settle；
   ③ 币是派生值（Σ有效加分 op.coin + 银行流水），清币走银行账本负向 adjust 流水（下限 0 兜底）；
   ④ 划界流水不进公示周期统计（computePublicityData 过滤），进步榜/净变动不被污染。 */
function semDate(t){
  var d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function updateSemesterStrip(){
  var host = document.getElementById('semesterStripHost');
  if(!host) return;
  var sem = state.semester || { name: '', startAt: 0 };
  var days = sem.startAt ? Math.max(1, Math.ceil((Date.now() - sem.startAt) / 86400000)) : 0;
  var label = sem.name
    ? '<b>' + escapeHtml(sem.name) + '</b> · 自 ' + semDate(sem.startAt) + '（第 ' + days + ' 天）'
    : '尚未设置 —— 点击右侧「学期结算」开始第一个学期';
  host.innerHTML = '<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">'
    + '<div style="font-size:13.5px;min-width:0">📚 当前学期　<span style="color:var(--text-secondary)">' + label + '</span></div>'
    + '<button class="btn btn-outline btn-sm teacher-only" onclick="openSemesterReset()">学期结算 · 重置学分</button>'
    + '</div>';
}
/* 依据当前学期名推测下一学期名：春→秋同年、秋→春次年；不匹配则留空手填 */
function suggestNextSemester(name){
  var m = /(\\d{4})\\s*(春|秋)/.exec(name || '');
  if(!m) return '';
  return (m[2] === '春') ? (m[1] + ' 秋季学期') : ((Number(m[1]) + 1) + ' 春季学期');
}
var _semesterResetPre = null;
function openSemesterReset(){
  if(window.__cmRole === 'committee'){ showToast('学期结算仅班主任可用', 'warning'); return; }   // 按钮已裁剪，此处防绕过
  var list = (state.students || []).map(function(s){
    return { s: s, credit: Number(s.credit) || 0, coin: cbCoinsOf(s.id, state.operations, cbBankSafe().ledger) };
  });
  if(list.length === 0){ showToast('暂无学生，无需结算', 'info'); return; }
  var sum = list.reduce(function(a, x){ return a + x.credit; }, 0);
  var coinSum = list.reduce(function(a, x){ return a + x.coin; }, 0);
  _semesterResetPre = { list: list, count: list.length, coinsTotal: coinSum };
  var sem = state.semester || { name: '', startAt: 0 };
  document.getElementById('semesterResetSummary').innerHTML =
    '<div>当前学期：<b>' + (sem.name ? escapeHtml(sem.name) : '未设置') + '</b>' + (sem.startAt ? '（自 ' + semDate(sem.startAt) + '）' : '') + '</div>'
    + '<div>将存档并重置：<b>' + list.length + '</b> 名学生 → 每人 <b>100</b> 分（当前平均 ' + (Math.round(sum / list.length * 10) / 10) + ' 分）</div>'
    + '<div>学分币合计 <b>' + coinSum + '</b> 币' + (coinSum > 0 ? '，如需清零请勾选下方选项' : '') + '</div>';
  document.getElementById('semesterNewName').value = sem.name ? suggestNextSemester(sem.name) : '';
  document.getElementById('semesterClearCoins').checked = false;
  openModal('semesterResetModal');
}
function confirmSemesterReset(){
  if(window.__cmRole === 'committee'){ showToast('学期结算仅班主任可用', 'warning'); return; }
  if(!_semesterResetPre){ closeModal('semesterResetModal'); return; }
  var newName = (document.getElementById('semesterNewName').value || '').trim();
  if(!newName){ showToast('请填写新学期名称', 'warning'); return; }
  var clearCoins = document.getElementById('semesterClearCoins').checked;
  var pre = _semesterResetPre;
  var ts = Date.now();
  var oldSem = state.semester || { name: '', startAt: 0 };
  // ① 存档快照（币为清零前余额）
  state.semesterHistory = state.semesterHistory || [];
  state.semesterHistory.push({
    id: ts,
    name: oldSem.name || '首次结算前',
    startAt: oldSem.startAt || 0,
    endAt: ts,
    coinsCleared: !!clearCoins,
    opCount: (state.operations || []).length,
    students: pre.list.map(function(x){ return { id: x.s.id, sid: x.s.sid, name: x.s.name, credit: x.credit, coin: x.coin }; })
  });
  // ② 划界流水（settle / coin=0）+ 重置 100 + 可选清币（银行账本负向流水）
  var cleared = 0;
  pre.list.forEach(function(x){
    var op = applyCreditDelta(x.s, 100 - x.credit, '学期结算「' + newName + '」', { time: ts });
    if(op){ op.settle = true; op.coin = 0; }
    if(clearCoins && x.coin > 0){ cbPushLedger('adjust', x.s.id, -x.coin, '', '学期结算「' + newName + '」清零', ts); cleared++; }
  });
  // ③ 开新学期
  state.semester = { name: newName, startAt: ts };
  saveData();
  closeModal('semesterResetModal');
  refreshCreditViews();
  renderCreditsPage();
  renderSemesterArchive();
  showToast('学期「' + newName + '」已开始：' + pre.count + ' 人重置为 100 分' + (cleared ? '，' + cleared + ' 人币已清零' : '') + '，往期数据已存档', 'success');
}
function renderSemesterArchive(){
  var host = document.getElementById('semesterArchiveList');
  if(!host) return;
  var list = state.semesterHistory || [];
  if(list.length === 0){ host.innerHTML = '<span style="color:var(--text-muted)">暂无往期学期。首次「学期结算」后自动生成存档。</span>'; return; }
  host.innerHTML = list.slice().sort(function(a, b){ return b.id - a.id; }).map(function(h){
    var n = (h.students || []).length;
    var sum = (h.students || []).reduce(function(a, x){ return a + (Number(x.credit) || 0); }, 0);
    return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px dashed var(--border)">'
      + '<span style="min-width:0"><b>' + escapeHtml(h.name || '未命名学期') + '</b>'
      + '<span style="color:var(--text-muted)">' + (h.startAt ? semDate(h.startAt) + ' ~ ' : '') + semDate(h.endAt) + '</span>'
      + ' · ' + n + ' 人 · 平均 ' + (n ? Math.round(sum / n * 10) / 10 : 0) + ' 分'
      + (h.coinsCleared ? ' · 币已清零' : '') + '</span>'
      + '<span style="flex:1"></span>'
      + '<button class="btn btn-outline btn-sm" onclick="exportSemesterArchive(' + h.id + ')">导出 JSON</button>'
      + '<button class="btn btn-outline btn-sm" style="color:#c53030;border-color:rgba(197,48,48,.4)" onclick="deleteSemesterArchive(' + h.id + ')">删除</button>'
      + '</div>';
  }).join('');
}
function exportSemesterArchive(id){
  if(window.__cmRole === 'committee'){ showToast('仅班主任可导出学期存档', 'warning'); return; }
  var h = (state.semesterHistory || []).find(function(x){ return x.id === id; });
  if(!h){ showToast('存档不存在', 'error'); return; }
  var blob = new Blob([JSON.stringify(h, null, 2)], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '学期存档_' + (h.name || '未命名') + '_' + semDate(h.endAt) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  showToast('已导出「' + (h.name || '未命名学期') + '」存档', 'success');
}
function deleteSemesterArchive(id){
  if(window.__cmRole === 'committee'){ showToast('仅班主任可删除学期存档', 'warning'); return; }
  var h = (state.semesterHistory || []).find(function(x){ return x.id === id; });
  if(!h) return;
  if(!confirm('确定删除往期存档「' + (h.name || '未命名学期') + '」？此操作不影响学生当前数据，但删掉的快照不可恢复。')) return;
  state.semesterHistory = (state.semesterHistory || []).filter(function(x){ return x.id !== id; });
  saveData();
  renderSemesterArchive();
  showToast('存档已删除', 'info');
}
function undoLastOp(){'''
html = rep1(html, 'function undoLastOp(){', CORE_JS, 'core-js')

# ── 13) 跟版 v3.4.1 → v3.5.0（五处 + 速览整体替换） ──
html = rep1(html, '<div class="login-version">v3.4.1</div>', '<div class="login-version">v3.5.0</div>', 'login-ver')
html = rep1(html, '<div class="sidebar-footer">v3.4.1 · 班主任工作台</div>', '<div class="sidebar-footer">v3.5.0 · 班主任工作台</div>', 'side-ver')
html = rep1(html, '\U0001F3F7\uFE0F v3.4.1</span>', '\U0001F3F7\uFE0F v3.5.0</span>', 'badge')
html = rep1(html, '近版更新速览（v3.4.1）', '近版更新速览（v3.5.0）', 'note-title')
NEW_NOTE = '          · \U0001F4DA <b>学期结算 · 重置学分（v3.5.0）</b>：学分页新增学期状态条，学期初一键把全班重置为 100 分——当前数据自动存档（设置 → <b>📚 学期存档</b>，可导出 JSON）；划界流水<b>不可撤销</b>、不进公示统计；可选同时清空学分币；班委不可见<br>'
lines = html.split('\n')
hit = [i for i, ln in enumerate(lines) if '网页版停更·转桌面版（v3.4.1）' in ln]
assert len(hit) == 1, '速览内容行命中 %d 处' % len(hit)
lines[hit[0]] = NEW_NOTE
html = '\n'.join(lines)

wr(P_HTML, html)

# ── 14) sw.js CACHE_NAME ──
sw = rd(P_SW)
sw = rep1(sw, "const CACHE_NAME = 'class-manager-v3.4.1';", "const CACHE_NAME = 'class-manager-v3.5.0';", 'cache-name')
wr(P_SW, sw)

# ── 自检 ──
html2, sw2 = rd(P_HTML), rd(P_SW)
checks = [
    ('schema semester', html2.count("key:'semester'") == 1),
    ('schema semesterHistory', html2.count("key:'semesterHistory'") == 1),
    ('merge map', html2.count('semester:msSemester, semesterHist:msSemesterHist') == 1),
    ('msSemester fn', html2.count('function msSemester(') == 1),
    ('msSemesterHist fn', html2.count('function msSemesterHist(') == 1),
    ('pub filter', html2.count('!o.settle') == 1),
    ('recoin skip', html2.count('if(o.settle) continue;') == 1),
    ('revoke guard', html2.count('学期结算划界流水不可撤销') == 1),
    ('strip host', html2.count('id="semesterStripHost"') == 1),
    ('modal html', html2.count('id="semesterResetModal"') == 1),
    ('archive card', html2.count('id="settingsSemester"') == 1),
    ('core fns', html2.count('function confirmSemesterReset(') == 1),
    ('open fn', html2.count('function openSemesterReset(') == 1),
    ('export fn', html2.count('function exportSemesterArchive(') == 1),
    ('delete fn', html2.count('function deleteSemesterArchive(') == 1),
    ('render archive fn', html2.count('function renderSemesterArchive(') == 1),
    ('credits hook', html2.count('updateSemesterStrip();   // v3.5.0 学期状态条') == 1),
    ('settings hook', html2.count('renderSemesterArchive();   // v3.5.0 学期存档卡') == 1),
    ('v3.5.0 count', html2.count('v3.5.0') == 17),
    ('v3.4.1 residue', html2.count('v3.4.1') == 1),
    ('cache name', 'class-manager-v3.5.0' in sw2),
]
bad = [k for k, ok in checks if not ok]
for k, ok in checks:
    print(('OK ' if ok else 'FAIL ') + k)
if bad:
    sys.exit('自检失败: ' + ', '.join(bad))
print('v3.5.0 补丁完成，自检全过')

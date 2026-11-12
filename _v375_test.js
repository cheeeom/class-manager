/* v3.7.5 回归测试：学号续号 + 批量配学号
   ① genSid 数字续号：班内已有纯数字学号 → 按最大号+1（保持位数）；全新班级回退 S 格式（兼容旧数据/测试夹具）；
      批量导入新建学生同口径；
   ② 批量配学号工具：粘贴「姓名 学号」→ 按姓名精确匹配；无匹配/重名/学号冲突/名单内重号/格式异常分桶；
      apply 前零副作用（plan 阶段只读）；portalCodes 键随学号迁移（码值不变）；nextSid 同步到数字续号。
   运行：node _v375_test.js */
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(__dirname + '/sw.js', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0, failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅', name); }
  catch (e) { fail++; failures.push(name + ' — ' + e.message); console.log('  ❌', name, '—', e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function has(s, k, msg) { if (s.indexOf(k) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(k)); }

// 与实现同构的纯逻辑（用于行为仿真）
function sidTemplateOf(list) {
  var groups = {}, order = [];
  (list || []).forEach(function (s) {
    var v = String((s && s.sid) == null ? '' : s.sid).trim();
    var m = v.match(/^(.*?)(\d+)$/);
    if (!m) return;
    var head = m[1], num = m[2];
    var g = groups[head];
    if (!g) { g = groups[head] = { head: head, n: 0, max: -1, lens: {}, sample: '' }; order.push(head); }
    g.n++;
    if (!g.sample) g.sample = v;
    var nv = parseInt(num, 10);
    if (nv > g.max) g.max = nv;
    g.lens[num.length] = (g.lens[num.length] || 0) + 1;
  });
  var best = null;
  order.forEach(function (h) {
    var g = groups[h];
    if (!best) { best = g; return; }
    if (g.n > best.n) { best = g; return; }
    if (g.n === best.n && best.head !== '' && g.head === '') { best = g; }
  });
  if (!best) return null;
  var width = 0, wn = 0;
  Object.keys(best.lens).forEach(function (w) {
    var k = parseInt(w, 10), c = best.lens[w];
    if (c > wn || (c === wn && k > width)) { width = k; wn = c; }
  });
  if (width < 1) width = 1;
  return { head: best.head, width: width, len: best.head.length + width, sample: best.sample,
           next: best.head + String(best.max + 1).padStart(width, '0') };
}
function nextSidFromList(list) {
  var t = sidTemplateOf(list);
  return t ? t.next : null;
}
function parseBulkSidLines(text) {
  var rows = [], errs = [];
  String(text || '').split(/\r?\n/).forEach(function (line, idx) {
    var t = line.trim();
    if (!t) return;
    var parts = t.split(/[\t,，、;；]+|\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length < 2) { errs.push('L' + (idx + 1)); return; }
    var a = parts[0], b = parts[1];
    var swap = /^\d+$/.test(a) && !/^\d+$/.test(b);
    rows.push({ name: swap ? b : a, sid: swap ? a : b });
  });
  return { rows: rows, errs: errs };
}

t('① genSid 数字续号 + 导入同口径', () => {
  has(html, 'function nextSidFromList(list)', '续号纯函数');
  has(html, "return 'S' + String(state.nextSid++).padStart(4,'0');", '全新班级回退 S 格式');
  const i = html.indexOf('function genSid()');
  const fn = html.slice(i, html.indexOf('\n}', i) + 2);
  has(fn, 'nextSidFromList(state.students)', 'genSid 走续号');
  // 导入新建
  has(html, "sid || nextSidFromList(existing.concat(plan.creates)) || ('S' + String(plan.nextSid++).padStart(4, '0'))", '导入新建同口径');
  // 行为仿真
  ok(nextSidFromList([{ sid: '2602001' }, { sid: '2602060' }]) === '2602061', '数字续号 2602061');
  ok(nextSidFromList([{ sid: '2602001' }, { sid: 'S0003' }]) === '2602002', '混排时按数字最大续');
  // v3.9.22：带字母头的班不再回退 S0001，而是接着本班格式续号（别的老师用 A001 也自洽）
  ok(nextSidFromList([{ sid: 'S0001' }]) === 'S0002', 'S 班续号 S0002（不再回退）');
  ok(nextSidFromList([{ sid: 'A001' }, { sid: 'A060' }]) === 'A061', 'A 班续号 A061');
  ok(nextSidFromList([{ sid: '2026-001' }, { sid: '2026-060' }]) === '2026-061', '带连字符续号 2026-061');
  ok(nextSidFromList([]) === null, '空班级模板为 null');
});

t('② 批量配学号：解析/计划/应用/迁移', () => {
  has(html, 'function openBulkSidModal()', '入口');
  has(html, 'function parseBulkSidLines(text)', '解析');
  has(html, 'function planBulkSids(rows)', '计划');
  has(html, 'function renderBulkSidPreview()', '预览');
  has(html, 'function applyBulkSids()', '应用');
  has(html, 'id="bulkSidModal"', '弹窗');
  has(html, 'id="bulkSidInput"', '输入区');
  has(html, 'id="bulkSidApply"', '应用按钮（默认禁用）');
  has(html, "if(btn) btn.disabled = true;", '初始禁用');
  has(html, 'btn.disabled = !(p.ok.length)', '无可更新时禁用');
  has(html, 'oninput="renderBulkSidPreview()"', '实时预览');
  has(html, '# 批量配学号', '工具条按钮');
  has(html, 'openBulkSidModal()', '按钮接线');
  // 应用阶段
  const a = html.indexOf('function applyBulkSids()');
  const afn = html.slice(a, html.indexOf('\n}', a) + 2);
  has(afn, 'codes[x.sid] = codes[oldSid];', 'portalCodes 键迁移');
  has(afn, 'delete codes[oldSid];', '旧键删除');
  has(afn, 'if(isFinite(nextNum)) state.nextSid = nextNum;', 'nextSid 同步（v3.9.22 带字母头学号 parseInt 会 NaN，必须守住）');
  has(afn, 'saveData();', '落账');
  has(afn, 'renderStudents();', '重渲染');
  has(afn, '请重新发布学生查询端', '提醒重新发布');
  has(afn, "if(!confirm(", 'confirm 确认');
});

t('③ 解析行为仿真（分隔符/换序/异常行）', () => {
  const r = parseBulkSidLines('陈静雯 2602001\n2602002,李美林\n只有名字\n');
  ok(r.rows.length === 2, '两行有效');
  ok(r.rows[0].name === '陈静雯' && r.rows[0].sid === '2602001', '姓名在前');
  ok(r.rows[1].name === '李美林' && r.rows[1].sid === '2602002', '学号在前自动换序');
  ok(r.errs.length === 1, '缺学号行报异常');
});

t('②b loadData 本地加载补齐六字段（portalCodes/portalPublish + 审计补 leaveDeleted/pwdDeviceLock/semester/semesterHistory）', () => {
  const i = html.indexOf('function loadData()');
  const body = html.slice(i, html.indexOf('function saveData()', i));
  ['portalCodes', 'portalPublish', 'leaveDeleted', 'pwdDeviceLock', 'semester', 'semesterHistory'].forEach(f => {
    ok(new RegExp('d\\.' + f + '\\b').test(body), 'loadData 应读 d.' + f);
  });
});

t('④ 版本一致性（动态跟版）+ 速览条目', () => {
  const m = sw.match(/CACHE_NAME = 'class-manager-(v[0-9.]+)'/);
  const v = html.match(/<div class="login-version">(v[0-9.]+)<\/div>/);
  ok(m && v && m[1] === v[1], 'CACHE ' + (m && m[1]) + ' / 登录页 ' + (v && v[1]) + ' 应同版（从 CACHE 反推，无需随版改）');
  has(html, '学号续号与批量配学号（v3.7.5）', '速览历史条目（v3.7.5）仍在');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log(`结果：${pass} 通过，${fail} 失败`);
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);

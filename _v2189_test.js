/* v2.18.10 回归测试：座次表拖拽换座 + 三个排座按钮改「只填空座」
   覆盖：
     1) autoSeat 只填空座：已排座位一律保留、未入座学生按策略（学分降序/姓名/随机）
        从前往后（前排优先）依次补位；空座不足只补能补的；无空座 / 全员入座时不写盘
     2) seatDrop 落点语义：已占座位=两人互换、空位=直接移动、拖回原位=取消、源不存在=不动
     3) 拖拽接线：renderSeating 卡片 data-seat-row/col + onpointerdown；
        seatPointerDown 触屏长按 200ms、鼠标 6px 阈值、操作按钮排除、非被动 touchmove 掐滚动、
        拖拽后抑制合成 click；CSS .seat.dragging / .seat.drag-over
     4) 契约保留：autoSeat(strategy) 签名 + 三策略 map + 学分降序/拼音/洗牌实现；_v2185 依赖不破
     5) 版本 v2.18.10 三处同步 + 设置页 notes 新增两条（旧条不删）
   运行：node _v2189_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '—', e.message); } }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + ' 缺少 ' + JSON.stringify(b)); }
function notHas(a, b, msg) { if (String(a).indexOf(b) >= 0) throw new Error((msg || '') + ' 不应包含 ' + JSON.stringify(b)); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg ? msg + '：' : '') + '期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }
function count(needle) { return html.split(needle).length - 1; }

/* 按花括号配平取完整函数源码（可处理多行 / 内嵌对象字面量） */
function fnSrc(name) {
  const lines = html.split('\n');
  const start = lines.findIndex(l => l.indexOf('function ' + name + '(') >= 0);
  if (start < 0) throw new Error('未找到函数 ' + name);
  let depth = 0, buf = [], began = false;
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) { if (ch === '{') { depth++; began = true; } else if (ch === '}') depth--; }
    buf.push(ln);
    if (began && depth === 0) break;
  }
  return buf.join('\n');
}

/* 沙箱：把 autoSeat / seatDrop 装进受控环境跑真实逻辑 */
function sandbox(opts) {
  const calls = { saves: 0, renders: 0, toasts: [], confirms: [] };
  const st = {
    students: opts.students,
    seating: { cols: opts.cols, rows: opts.rows, seats: opts.seats.map(s => Object.assign({}, s)) }
  };
  const factory = new Function(
    'state', 'saveData', 'showToast', 'renderSeating', 'confirm', 'escapeHtml',
    fnSrc('autoSeat') + '\n' + fnSrc('seatDrop') + '\nreturn { autoSeat: autoSeat, seatDrop: seatDrop };'
  );
  const api = factory(
    st,
    () => { calls.saves++; },
    (m, k) => { calls.toasts.push({ m: m, k: k }); },
    () => { calls.renders++; },
    (m) => { calls.confirms.push(String(m)); return opts.confirm !== false; },
    (s) => String(s == null ? '' : s)
  );
  const at = (r, c) => st.seating.seats.find(s => s.row === r && s.col === c) || null;
  const sidAt = (r, c) => { const s = at(r, c); return s ? s.studentId : null; };
  return { st: st, calls: calls, api: api, at: at, sidAt: sidAt };
}
/* 造学生：id 用 1..n，学分 = 10*id，姓名可控 */
function mkStudents(n, names) {
  const arr = [];
  for (let i = 1; i <= n; i++) arr.push({ id: i, name: names ? names[i - 1] : ('学生' + i), credit: i * 10 });
  return arr;
}

/* ==================== 语法与版本 ==================== */
console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译（改动后无语法错）', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.10（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.18\.10</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.10 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.18.10')) throw new Error('SW CACHE_NAME 未更新');
  if (sw.includes('class-manager-v2.18.4')) throw new Error('SW 旧 CACHE_NAME 残留');
});
t('设置页版本徽标随版 = v2.18.10', () => {
  has(html, '🏷️ v2.18.10</span>', '设置页版本徽标未跟版');
});
t('历史注释保护：v2.18.3 仍 8 处 / v2.18.0 仍 24 处（不随升版盲替）', () => {
  eq(count('v2.18.3'), 8, 'v2.18.3 注释数变了');
  eq((html.match(/v2\.18\.0/g) || []).length, 24, 'v2.18.0 注释数变了');
});
t('设置页 notes 新增本版两条，且旧条全部保留', () => {
  has(html, '座次表支持拖拽换座', '缺拖拽换座说明');
  has(html, '三个排座按钮改为「只填空座」', '缺只填空座说明');
  ['处分记录此前不参与云同步', '重置云端加密口令', '工作记录补上关键词搜索框',
   '本地存储写满时不再静默失败', '零扣分榜改为按「未扣分天数」排名',
   '原生弹窗全部换成站内模态', '修复原因目录改名不跨设备传播',
   '删除 8 个零引用函数与 22 条无引用 CSS 规则', '调试日志默认静默（地址栏加 ?debug=1 打开）'
  ].forEach(s => has(html, s, '旧 note 丢失'));
});

/* ==================== autoSeat：只填空座 ==================== */
console.log('\n=== autoSeat 只填空座（保留已排座位） ===');
t('源码不再清空 seats，改为 push 补位；保留 keptCount 快照', () => {
  const src = fnSrc('autoSeat');
  notHas(src, 'state.seating.seats = []', '仍会清空已排座位');
  has(src, 'const keptCount = seats.length;', '缺保留计数快照');
  has(src, 'seats.push({ row: emptySeats[i].row, col: emptySeats[i].col, studentId: sorted[i].id });', '未按空位补位');
});
t('credit 模式：已排座位原封不动，未入座者按学分降序 + 前排优先补位', () => {
  // 2行3列=6座；预排 id6 在第2行第2列（中间行，验证不被挪动）
  const sb = sandbox({ students: mkStudents(6), cols: 3, rows: 2, seats: [{ row: 1, col: 1, studentId: 6 }] });
  sb.api.autoSeat('credit');
  eq(sb.st.seating.seats.length, 6, '座位总数');
  eq(sb.sidAt(1, 1), 6, '已排座位被改动');
  // 空位顺序（前排优先）：(0,0)(0,1)(0,2)(1,0)(1,2)；未入座学分降序：5,4,3,2,1
  eq(sb.sidAt(0, 0), 5); eq(sb.sidAt(0, 1), 4); eq(sb.sidAt(0, 2), 3);
  eq(sb.sidAt(1, 0), 2); eq(sb.sidAt(1, 2), 1);
  eq(sb.calls.saves, 1, '应保存一次');
  ok(/已按「按学分从高到低」补入 5 名学生（保留原有 1 个座位）/.test(sb.calls.toasts[0].m), '成功提示不对：' + (sb.calls.toasts[0] || {}).m);
  eq(sb.calls.toasts[0].k, 'success');
});
t('前排优先：未入座者优先落在第一排（含已占位列被跳过）', () => {
  const sb = sandbox({ students: mkStudents(9), cols: 2, rows: 3, seats: [{ row: 2, col: 1, studentId: 9 }] });
  sb.api.autoSeat('credit');
  // 空位：(0,0)(0,1)(1,0)(1,1)(2,0)；未入座学分降序 8,7,6,5,4,3,2,1 → 取前 5
  eq(sb.sidAt(0, 0), 8); eq(sb.sidAt(0, 1), 7);
  eq(sb.sidAt(1, 0), 6); eq(sb.sidAt(1, 1), 5);
  eq(sb.sidAt(2, 0), 4);
  eq(sb.sidAt(2, 1), 9, '已排座位被改动');
  eq(sb.st.seating.seats.length, 6, '座位总数');
});
t('空座不足：只补能补下的，多余者不安排并在确认框说明', () => {
  const sb = sandbox({ students: mkStudents(3), cols: 2, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }] });
  sb.api.autoSeat('credit');
  eq(sb.st.seating.seats.length, 2);
  eq(sb.sidAt(0, 0), 1, '已排座位被改动');
  eq(sb.sidAt(0, 1), 3, '应按学分降序（3 高于 2）补入');
  ok(sb.calls.confirms[0].indexOf('空座位不足') >= 0, '确认框未提示空座不足：' + sb.calls.confirms[0]);
  ok(sb.calls.confirms[0].indexOf('已排的 1 个座位保持不变') >= 0, '确认框未说明保留');
});
t('没有空座位 → 提示错误且不写盘、不改数据', () => {
  const sb = sandbox({ students: mkStudents(2), cols: 1, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }] });
  sb.api.autoSeat('credit');
  eq(sb.calls.saves, 0, '不应保存');
  eq(sb.calls.confirms.length, 0, '不应弹确认');
  eq(sb.calls.toasts[0].k, 'error');
  has(sb.calls.toasts[0].m, '没有空座位');
  eq(sb.st.seating.seats.length, 1);
});
t('全员已入座 → 提示 info 且不写盘', () => {
  const sb = sandbox({ students: mkStudents(2), cols: 2, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }, { row: 0, col: 1, studentId: 2 }] });
  sb.api.autoSeat('credit');
  eq(sb.calls.saves, 0, '不应保存');
  eq(sb.calls.toasts[0].k, 'info');
  has(sb.calls.toasts[0].m, '所有学生都已入座');
});
t('无学生 → 提示错误且不写盘', () => {
  const sb = sandbox({ students: [], cols: 3, rows: 2, seats: [] });
  sb.api.autoSeat('credit');
  eq(sb.calls.saves, 0);
  eq(sb.calls.toasts[0].k, 'error');
  has(sb.calls.toasts[0].m, '请先添加学生');
});
t('取消确认 → 完全不动数据', () => {
  const sb = sandbox({ students: mkStudents(3), cols: 3, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }], confirm: false });
  sb.api.autoSeat('credit');
  eq(sb.calls.saves, 0);
  eq(sb.st.seating.seats.length, 1);
  eq(sb.st.seating.seats[0].studentId, 1);
});
t('name 模式：未入座者按拼音/字母序补位（不看学分）', () => {
  const sb = sandbox({ students: mkStudents(3, ['Cindy', 'Amy', 'Bob']), cols: 3, rows: 1, seats: [] });
  sb.api.autoSeat('name');
  eq(sb.st.seating.seats.length, 3);
  const order = ['0,0', '0,1', '0,2'].map(k => { const [r, c] = k.split(',').map(Number); return sb.sidAt(r, c); });
  eq(order.join(','), '2,3,1', '拼音序应为 Amy(2) → Bob(3) → Cindy(1)');
  has(sb.calls.toasts[0].m, '按姓名拼音');
});
t('random 模式：填满全部空位且无重复、不丢已排座位', () => {
  const sb = sandbox({ students: mkStudents(4), cols: 2, rows: 2, seats: [{ row: 1, col: 1, studentId: 1 }] });
  sb.api.autoSeat('random');
  eq(sb.st.seating.seats.length, 4, '座位总数');
  eq(sb.sidAt(1, 1), 1, '已排座位被改动');
  const ids = sb.st.seating.seats.map(s => s.studentId).sort((a, b) => a - b);
  eq(ids.join(','), '1,2,3,4', '应恰好安排 4 人且不重复');
  has(sb.calls.toasts[0].m, '随机');
});
t('未知策略名回落 random（与 v2.18.1 行为一致）', () => {
  const sb = sandbox({ students: mkStudents(2), cols: 2, rows: 1, seats: [] });
  sb.api.autoSeat('whatever');
  eq(sb.st.seating.seats.length, 2);
  has(sb.calls.toasts[0].m, '随机');
});
t('重复调用幂等：第二次无可补位 → 不写盘', () => {
  const sb = sandbox({ students: mkStudents(4), cols: 2, rows: 2, seats: [] });
  sb.api.autoSeat('credit');
  eq(sb.calls.saves, 1);
  const snapshot = JSON.stringify(sb.st.seating.seats);
  sb.api.autoSeat('credit');
  eq(sb.calls.saves, 1, '第二次不应写盘');
  eq(JSON.stringify(sb.st.seating.seats), snapshot, '第二次不应改动数据');
});

/* ==================== seatDrop 落点语义 ==================== */
console.log('\n=== seatDrop 拖拽落点语义 ===');
t('拖到已占座位 → 两人互换（坐标对调，数组顺序不变）', () => {
  const sb = sandbox({ students: mkStudents(2), cols: 2, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }, { row: 0, col: 1, studentId: 2 }] });
  sb.api.seatDrop(0, 0, 0, 1);
  eq(sb.sidAt(0, 0), 2, 'A 位应换成后者');
  eq(sb.sidAt(0, 1), 1);
  eq(sb.calls.saves, 1);
  eq(sb.calls.toasts[0].k, 'success');
  has(sb.calls.toasts[0].m, '已互换座位');
  has(sb.calls.toasts[0].m, '⇄');
});
t('拖到空位 → 直接移动（原坐标清空）', () => {
  const sb = sandbox({ students: mkStudents(1), cols: 2, rows: 2, seats: [{ row: 0, col: 0, studentId: 1 }] });
  sb.api.seatDrop(0, 0, 1, 1);
  eq(sb.sidAt(0, 0), null, '原位未清空');
  eq(sb.sidAt(1, 1), 1);
  eq(sb.calls.saves, 1);
  has(sb.calls.toasts[0].m, '已移动');
  has(sb.calls.toasts[0].m, 'R2C2');
});
t('拖回原位 → 取消，不写盘不提示', () => {
  const sb = sandbox({ students: mkStudents(1), cols: 2, rows: 2, seats: [{ row: 0, col: 0, studentId: 1 }] });
  sb.api.seatDrop(0, 0, 0, 0);
  eq(sb.calls.saves, 0);
  eq(sb.calls.toasts.length, 0);
  eq(sb.calls.renders, 1, '应重绘一次以清掉拖拽态');
});
t('起点无座位（脏数据）→ 不写盘，安全重绘', () => {
  const sb = sandbox({ students: mkStudents(1), cols: 2, rows: 2, seats: [] });
  sb.api.seatDrop(0, 0, 1, 1);
  eq(sb.calls.saves, 0);
  eq(sb.calls.toasts.length, 0);
  eq(sb.calls.renders, 1);
});
t('互换后座位对象总数不变（无增无减）', () => {
  const sb = sandbox({ students: mkStudents(3), cols: 3, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }, { row: 0, col: 2, studentId: 2 }] });
  sb.api.seatDrop(0, 0, 0, 2);
  eq(sb.st.seating.seats.length, 2);
  eq(sb.sidAt(0, 0), 2); eq(sb.sidAt(0, 2), 1); eq(sb.sidAt(0, 1), null);
});

/* ==================== 拖拽接线（源码断言） ==================== */
console.log('\n=== 拖拽接线 ===');
t('renderSeating 卡片挂 data-seat-row/col + onpointerdown（占位与空位各一处）', () => {
  const src = fnSrc('renderSeating');
  eq(count('data-seat-row="'), 2, 'data-seat-row 应恰好 2 处');
  eq(count('data-seat-col="'), 2, 'data-seat-col 应恰好 2 处');
  eq(count('onpointerdown="seatPointerDown(event,'), 2, 'onpointerdown 应恰好 2 处');
  has(src, 'onpointerdown="seatPointerDown(event,${r},${c},${seat.studentId})"', '占位未挂拖拽');
  has(src, 'onpointerdown="seatPointerDown(event,${r},${c},null)"', '空位未挂拖拽');
  has(src, 'oncontextmenu="return false"', '未屏蔽长按上下文菜单');
});
t('拖拽不破坏既有点击链路（onclick/seatClick/removeSeat 仍在）', () => {
  const src = fnSrc('renderSeating');
  has(src, 'onclick="seatClick(${r},${c},${seat.studentId})"', '占位点击丢失');
  has(src, 'onclick="seatClick(${r},${c},null)"', '空位点击丢失');
  has(src, 'removeSeat(${r},${c})', '移除按钮丢失');
  has(src, 'event.stopPropagation()', '操作按钮未阻止冒泡');
});
t('seatPointerDown：仅左键 / 排除操作按钮 / 触屏长按 200ms / 非被动 touchmove', () => {
  const src = fnSrc('seatPointerDown');
  has(src, "ev.pointerType === 'mouse' && ev.button !== 0", '未限制左键');
  has(src, "ev.target.closest('.seat-actions')", '未排除右上角操作按钮');
  has(src, 'setTimeout(seatDragActivate, 200)', '触屏长按阈值非 200ms');
  has(src, "{ passive:false }", 'touchmove 非被动监听，无法掐断滚动');
  has(src, 'if(_seatDrag) return;', '未做重入保护');
});
t('seatDragActivate：加 dragging 类 + 清长按定时器 + 触感反馈', () => {
  const src = fnSrc('seatDragActivate');
  has(src, "classList.add('dragging')", '未加拖拽样式类');
  has(src, 'clearTimeout(d.timer)', '未清长按定时器');
  has(src, 'navigator.vibrate', '缺触感反馈（可选能力）');
});
t('seatTouchMove：仅在拖拽激活时 preventDefault（未激活则放行滚动）', () => {
  const src = fnSrc('seatTouchMove');
  has(src, '_seatDrag.active', '未判断激活态');
  has(src, 'ev.cancelable', '未判断可取消');
  has(src, 'preventDefault()', '未阻断滚动');
});
t('seatPointerMove：鼠标 6px 阈值入拖 / 触屏 10px 内移动则放弃长按 / 高亮落点', () => {
  const src = fnSrc('seatPointerMove');
  has(src, 'dx > 6 || dy > 6', '鼠标入拖阈值缺失');
  has(src, 'dx > 10 || dy > 10', '触屏放弃长按阈值缺失');
  has(src, 'seatPointerCancel(); return;', '未在滚动前放弃拖拽');
  has(src, "classList.add('drag-over')", '未高亮落点');
  has(src, "classList.remove('drag-over')", '未清除旧落点高亮');
});
t('seatDropTargetAt：elementFromPoint + closest(.seat) + data-seat-row 校验', () => {
  const src = fnSrc('seatDropTargetAt');
  has(src, 'document.elementFromPoint(x, y)', '未用命中测试');
  has(src, "el.closest('.seat')", '未收敛到座位卡片');
  has(src, 'seat.dataset.seatRow', '未校验座位坐标');
});
t('seatPointerUp：清理 → 抑制合成 click → 执行 seatDrop', () => {
  const src = fnSrc('seatPointerUp');
  has(src, 'seatPointerCleanup();', '未先清理');
  has(src, "window.addEventListener('click', swallow, true)", '未在捕获阶段吞掉合成 click');
  has(src, "window.removeEventListener('click', swallow, true), 350", '吞 click 监听未自动摘除');
  has(src, 'seatDrop(fromRow, fromCol, parseInt(targetEl.dataset.seatRow, 10), parseInt(targetEl.dataset.seatCol, 10));', '未派发落点');
  has(src, 'if(!active || !targetEl) return;', '未拦截「纯点击」与「无落点」');
});
t('seatPointerCleanup：摘净 4 类监听 + 清 2 类样式 + 复位状态', () => {
  const src = fnSrc('seatPointerCleanup');
  ["'touchmove'", "'pointermove'", "'pointerup'", "'pointercancel'"].forEach(k => has(src, 'removeEventListener(' + k, k + ' 未摘除'));
  has(src, "classList.remove('dragging')", 'dragging 未清');
  has(src, "classList.remove('drag-over')", 'drag-over 未清');
  has(src, 'clearTimeout(d.timer)', '定时器未清');
  has(src, '_seatDrag = null;', '状态未复位');
});
t('seatDrop 容错：目标座位上的学生已从名单删除时不崩，提示占位', () => {
  const sb = sandbox({ students: mkStudents(1), cols: 2, rows: 1, seats: [{ row: 0, col: 0, studentId: 1 }, { row: 0, col: 1, studentId: 99 }] });
  sb.api.seatDrop(0, 0, 0, 1);
  eq(sb.sidAt(0, 0), 99);
  eq(sb.sidAt(0, 1), 1);
  has(sb.calls.toasts[0].m, '(已删除)', '未对失联学生做占位提示');
  eq(sb.calls.saves, 1);
});
t('CSS：.seat 禁选中 + dragging 置灰 + drag-over 高亮', () => {
  has(html, '.seat{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}', '缺禁选中样式');
  has(html, '.seat.dragging{opacity:.4;transform:scale(.94);pointer-events:none;cursor:grabbing}', '缺 dragging 样式');
  has(html, '.seat.drag-over{border-color:var(--primary)!important', '缺 drag-over 样式');
  has(html, '.seat.occupied{cursor:grab}', '缺抓手光标');
});
t('工具栏提示含拖拽说明，且保留 v2.18.1 原句（旧断言不破）', () => {
  has(html, '点座位卡片即可安排 / 更换学生', '旧提示句丢失');
  has(html, '按住卡片拖到别的座位即可换座', '缺拖拽说明');
  has(html, '触屏请长按约 0.2 秒后拖动', '缺触屏长按说明');
});
t('三个按钮 title 均说明「不动已排座位」', () => {
  eq(count('不动已排座位）"'), 3, '三个按钮 title 未同步');
  has(html, "onclick=\"autoSeat('random')\"", '缺随机按钮');
  has(html, "onclick=\"autoSeat('credit')\"", '缺学分按钮');
  has(html, "onclick=\"autoSeat('name')\"", '缺姓名按钮');
  has(html, '🎓 按学分排座', '缺按钮文案');
});

/* ==================== 契约保留（_v2185 / _v2172 依赖） ==================== */
console.log('\n=== 契约保留 ===');
t('autoSeat(strategy) 签名 + 三策略 map 保留', () => {
  const src = fnSrc('autoSeat');
  has(src, 'function autoSeat(strategy){', '签名被改');
  has(src, "{'random':'随机','credit':'按学分从高到低','name':'按姓名拼音'}", '策略名 map 丢失');
  has(src, "mode === 'credit'", 'credit 分支丢失');
  has(src, "mode === 'name'", 'name 分支丢失');
});
t('排序实现逐字保留（学分降序 / 拼音 / 洗牌）', () => {
  const src = fnSrc('autoSeat');
  has(src, 'sorted.sort((a,b) => (Number(b.credit)||0) - (Number(a.credit)||0))', '学分排序实现缺失');
  has(src, "String(a.name||'').localeCompare(String(b.name||''), 'zh')", '拼音排序实现缺失');
  has(src, 'Math.floor(Math.random()', '随机洗牌实现缺失');
});
t('autoSeat 不使用原生 prompt / alert', () => {
  const src = fnSrc('autoSeat').replace(/\s+/g, ' ');
  notHas(src, 'prompt(', '仍用 prompt');
  notHas(src, 'alert(', '仍用 alert');
});
t('seatClick 未被改动（_v2172 / _v2185 断言锚点仍在）', () => {
  const src = fnSrc('seatClick');
  has(src, '_studentPickerPool = state.students.filter', '候选注入丢失');
  has(src, '_studentPickerPool.sort((a,b)=>(Number(b.credit)||0)-(Number(a.credit)||0))', '候选学分降序丢失');
  has(src, "modal.dataset.context = 'seating'", '座位上下文丢失');
  notHas(src, 'seatMode', 'seatMode 复活');
});
t('removeSeat / clearSeating / saveSeatLayoutInline 三件套仍在', () => {
  has(html, 'function removeSeat(row, col){');
  has(html, 'function clearSeating(){');
  has(html, 'function saveSeatLayoutInline(){');
  has(html, "state.seating.seats = [];\n  saveData();\n  renderSeating();\n  showToast('已清空座位','info');", '清空座位逻辑改变');
});
t('拖拽相关函数全部为函数声明（可被内联 onpointerdown 调用）', () => {
  ['seatPointerDown', 'seatDragActivate', 'seatTouchMove', 'seatDropTargetAt', 'seatPointerMove',
   'seatPointerUp', 'seatPointerCancel', 'seatPointerCleanup', 'seatDrop'
  ].forEach(n => has(html, 'function ' + n + '(', n + ' 未定义'));
});
t('无死代码残留：未引入未使用的拖拽辅助函数', () => {
  ['seatDragStart', 'seatDragEnd', 'seatDropHandler', 'initSeatDrag'].forEach(n => notHas(html, 'function ' + n + '(', n + ' 疑似死代码'));
});

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);

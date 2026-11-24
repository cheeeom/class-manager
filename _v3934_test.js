/* v3.9.34 回归：学分流水时间线默认 50 条折叠、点开看最近 100 条
 *
 * 版本无关断言：版本号从 sw.js 的 CACHE_NAME 反推，本文件不写死版号。
 * 钉四类契约：
 *   ① 主应用 renderCreditsTimeline 已原生实现折叠/展开（不再是固定 LIMIT=50 无按钮）
 *   ② 默认 50、展开 100、超过 50 才出按钮、文案与收起态正确
 *   ③ 作废流水由 liveOps 过滤、班委只看本次会话操作（与主应用同源，不另写一套）
 *   ④ 真跑折叠/展开/切换：DOM 计数与 tip 文案随状态正确变化
 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync('sw.js', 'utf8').replace(/\r\n/g, '\n');

const VER = (function () {
  const m = /CACHE_NAME\s*=\s*'class-manager-(v[\d.]+)'/.exec(sw);
  return m ? m[1] : '';
})();
if (!VER) throw new Error('[版本无关化] 未能从 sw.js 反推版本号');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + e.message); }
}
function ok(c, m) { if (!c) throw new Error(m || '断言失败'); }
function has(s, sub, m) { if (String(s).indexOf(sub) < 0) throw new Error(m || ('缺少 ' + sub)); }

/* 抽时间线段：从注释锚点到 Batch Credit 段 */
const A = html.indexOf('let _cmTlExpand = false;');
const B = html.indexOf('/* ==================== Batch Credit ==================== */');
ok(A > 0 && B > A, '时间线段定位失败');
const SEG = html.slice(A, B);

/* ① 结构 */
t('① 主应用原生实现：有 toggle 函数与展开态变量', () => {
  has(SEG, 'function cmCreditTlToggle()');
  has(SEG, 'let _cmTlExpand = false;');
  has(SEG, '_cmTlExpand = !_cmTlExpand;');
  has(SEG, 'function renderCreditsTimeline()');
  has(SEG, 'function cmCreditTlToggle(){\n  _cmTlExpand = !_cmTlExpand;\n  renderCreditsTimeline();', 'toggle 必须翻转展开态并重绘时间线');
});

t('② 折叠 50 / 展开 100、超过 50 才出按钮、收起态文案', () => {
  has(SEG, 'const LIMIT = _cmTlExpand ? 100 : 50;', '折叠/展开上限不对');
  has(SEG, 'if(ops.length > 50){', '按钮不该在 50 条及以下出现');
  has(SEG, "'收起（只看 50 条）'");
  has(SEG, "'展开看最近 100 条'");
  has(SEG, "ops.length > 50");
});

t('③ 作废过滤 / 班委过滤 / 条目模板与抽屉同源', () => {
  has(SEG, 'let ops = liveOps(state.operations)', '作废流水必须由 liveOps 过滤');
  has(SEG, "window.__cmRole === 'committee'");
  has(SEG, 'ops = ops.filter(cmOwnSessionOp)', '班委必须只看本次会话操作');
  has(SEG, 'shown.map(renderOpItem)', '条目模板必须走主应用 renderOpItem');
  has(SEG, 'renderRevokedDrawer();', '已撤销抽屉必须走主应用 renderRevokedDrawer');
});

/* ④ 真跑：把时间线段塞进 mock 宿主，验证四场景 DOM 计数 */
function makeSandbox(opts) {
  const o = opts || {};
  const rendered = [];
  const tl = { innerHTML: '' };
  const sb = {
    state: { operations: o.ops || [] },
    document: { getElementById: id => (id === 'creditsTimeline' ? tl : null) },
    window: { __cmRole: o.role || 'teacher' },
    liveOps: list => list.filter(x => !x.revoked),
    cmOwnSessionOp: x => x.own === true,
    renderOpItem: x => '<ROW:' + x.id + '>',
    renderRevokedDrawer: () => { rendered.push('drawer'); }
  };
  const src = SEG.replace(/\/\*[\s\S]*?\*\//g, '')
    + '\n;return {toggle: cmCreditTlToggle, render: renderCreditsTimeline, isExpand: function(){return _cmTlExpand;}};';
  const api = new Function(
    'state', 'document', 'window',
    'liveOps', 'cmOwnSessionOp', 'renderOpItem', 'renderRevokedDrawer',
    src
  )(sb.state, sb.document, sb.window, sb.liveOps, sb.cmOwnSessionOp,
    sb.renderOpItem, sb.renderRevokedDrawer);
  return { api, tl, sb };
}
function mkOps(n, extra) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(Object.assign({ id: i, own: true }, extra || {}));
  return out;
}
function countRows(html) { return (html.match(/<ROW:/g) || []).length; }

t('④ 真跑 60 条：默认 50 行 + 展开按钮，展开后 60 行 + 收起按钮', () => {
  const s = makeSandbox({ ops: mkOps(60) });
  s.api.render();
  ok(countRows(s.tl.innerHTML) === 50, '默认行数应为 50，实际 ' + countRows(s.tl.innerHTML));
  ok(s.tl.innerHTML.indexOf('展开看最近 100 条') >= 0, '默认态缺展开按钮');
  ok(s.tl.innerHTML.indexOf('共 60 条') >= 0, '默认态共 N 条提示缺失');
  s.api.toggle(); s.api.render();
  ok(s.api.isExpand() === true, 'toggle 未翻展开态');
  ok(countRows(s.tl.innerHTML) === 60, '展开后行数应为 60');
  ok(s.tl.innerHTML.indexOf('收起（只看 50 条）') >= 0, '展开态缺收起按钮');
});

t('⑤ 真跑 120 条：展开后封顶 100 行', () => {
  const s = makeSandbox({ ops: mkOps(120) });
  s.api.render(); s.api.toggle(); s.api.render();
  ok(countRows(s.tl.innerHTML) === 100, '展开上限应为 100，实际 ' + countRows(s.tl.innerHTML));
  ok(s.tl.innerHTML.indexOf('共 120 条') >= 0, '展开态共 N 条提示缺失');
  s.api.toggle(); s.api.render();
  ok(countRows(s.tl.innerHTML) === 50, '再收起应回 50');
});

t('⑥ 真跑 30 条：不出现展开按钮', () => {
  const s = makeSandbox({ ops: mkOps(30) });
  s.api.render();
  ok(countRows(s.tl.innerHTML) === 30, '不足 50 条应全显示');
  ok(s.tl.innerHTML.indexOf('cmCreditTlToggle') < 0, '不足 50 条不该有切换按钮');
});

t('⑦ 真跑作废过滤 + 班委过滤', () => {
  const ops = mkOps(60).map((x, i) => i % 2 ? Object.assign({}, x, { revoked: true }) : x);
  const s = makeSandbox({ ops });
  s.api.render();
  ok(countRows(s.tl.innerHTML) === 30, '作废流水必须被 liveOps 过滤，实际 ' + countRows(s.tl.innerHTML));
  ok(s.tl.innerHTML.indexOf('展开看最近 100 条') < 0, '过滤后不足 50 条不该有按钮');

  const cm = makeSandbox({ ops: mkOps(60, { own: false }).concat([{ id: 999, own: true }]), role: 'committee' });
  cm.api.render();
  ok(countRows(cm.tl.innerHTML) === 1, '班委只看本次会话操作，实际 ' + countRows(cm.tl.innerHTML));
});

t('⑧ 版本落点：活动标记已升到当版，历史注释保留', () => {
  const v = VER.replace('v', '');
  ok(sw.indexOf("class-manager-" + VER) >= 0, 'sw.js CACHE_NAME 不是当版');
  ok(html.indexOf('cmgx.js?v=' + v) >= 0, 'index.html cmgx 参数不是当版');
  ok(sw.indexOf('cmgx.js?v=' + v) >= 0, 'sw.js cmgx 预缓存参数不是当版');
  ok(html.indexOf('<div class="login-version">' + VER + '</div>') >= 0, '登录页版本标记不是当版');
  ok(html.indexOf('<div class="sidebar-footer">' + VER + ' · 班主任工作台</div>') >= 0, '侧边栏版本标记不是当版');
  ok(html.indexOf('🏷️ ' + VER + '</span>') >= 0, '设置页徽标不是当版');
  ok(html.indexOf('近版更新速览（' + VER + '）') >= 0, '速览标题不是当版');
  // v3.9.35 起改成「速览块内必须有当版标记」：原断言写死了 v3.9.34 的条目文案（🧾 学分流水…），
  // 每版都得跟着改，等于把历史内容钉成契约。改成只认当版号，强度更高且与文案无关（速览按规矩只留当版）。
  const rnStart = html.indexOf('id="settingsReleaseNotes"');
  ok(rnStart >= 0, '找不到速览容器');
  const rnBlock = html.slice(rnStart, html.indexOf('</div>', rnStart));
  ok(rnBlock.indexOf('（' + VER + '）') >= 0, '速览缺本版说明');
  // 历史注释不许回改：v3.9.33 的启动画面注释仍在
  ok(html.indexOf('启动画面（v3.9.33）') >= 0, '历史注释被误改');
});

console.log('\n' + (fail === 0 ? '全部通过' : '有失败') + '：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);

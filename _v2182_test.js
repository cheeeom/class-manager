/* v2.17.30 回归测试：兑换商店候选名单默认按币由多到少排序（空态全体 + 输入筛选一致）
   运行：node _v2182_test.js */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '—', e.message); } }
function has(a, b, msg) { if (String(a).indexOf(b) < 0) throw new Error((msg || '') + '缺少 ' + JSON.stringify(b)); }
function ok(c, msg) { if (!c) throw new Error(msg || '断言失败'); }

console.log('=== 语法与版本 ===');
t('index.html 主 <script> 块可被完整编译', () => {
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new Function(m[1]));
});
t('版本三处同步 = v2.18.2（登录页/侧栏/SW CACHE_NAME）', () => {
  if (!/login-version">v2\.18\.2</.test(html)) throw new Error('登录页版本号未更新');
  if (!/sidebar-footer">v2\.18\.2 ·/.test(html)) throw new Error('侧栏版本号未更新');
  if (!sw.includes('class-manager-v2.18.2')) throw new Error('SW CACHE_NAME 未更新');
});

console.log('\n=== 候选名单按币降序 ===');
t('币 map 提前计算：cbCoinMap 调用先于排序（排序依据 + 行内显示共用）', () => {
  const iCoin = html.indexOf('var cm = cbCoinMap(state.operations');
  const iSort = html.indexOf('cands.sort(function(a, b)');
  ok(iCoin >= 0 && iSort >= 0 && iCoin < iSort, 'cbCoinMap 应出现在 cands.sort 之前（indexOf: coin=' + iCoin + ' sort=' + iSort + '）');
});
t('排序作用在候选全集：filter（输入态）与 slice 60（空态）都取自已排序的 cands', () => {
  has(html, "var cands = (state.students || []).slice();", '缺 cands 拷贝');
  has(html, '? cands.filter(function(s){', '输入态应 filter 排序后 cands');
  has(html, ': cands.slice(0, 60);', '空态应 slice 排序后 cands');
  has(html, '}).slice(0, 8)', '筛选上限 8 保留');
});
t('排序比较器按币降序 + 同币学号升序（字符串 + 纯逻辑双验证）', () => {
  const m = html.match(/cands\.sort\(function\(a, b\)\{[\s\S]*?\n  \}\);/);
  ok(m, '未找到 cands.sort 比较器');
  has(m[0], '(cm[String(b.id)] || 0) - (cm[String(a.id)] || 0)', '主键应为币降序 b-a');
  has(m[0], 'Number(a.id) - Number(b.id)', '缺同币次级键（id 升序保稳）');
  // 纯逻辑：抽出比较器直接跑
  const cmp = eval('(' + m[0].replace('cands.sort(', '').replace('\n  });', '\n}') + ')');
  const st = [{ id: 3 }, { id: 1 }, { id: 9 }, { id: 5 }, { id: 2 }];
  const cm = { '3': 20, '1': 5, '9': 0, '5': 5, '2': 20 };
  st.sort(cmp);
  const got = st.map(x => x.id).join(',');
  ok(got === '2,3,1,5,9', '币降序+同币id升序错误：' + got + '（期望 2,3,1,5,9 = 币20组内id升序、币5组、币0组）');
});
t('行内币显示仍用同一 cm map（不重复计算）', () => {
  has(html, "(cm[String(s.id)] || 0) + ' 币</span>", '候选行缺币显示');
});
t('无默认选中/清除/未选锁定 等 v2.17.28 行为不受排序影响（回归冒烟）', () => {
  has(html, "if(cbStoreSid && !studs.some(function(x){ return String(x.id) === cbStoreSid; })) cbStoreSid = '';", '无默认回填被破坏');
  has(html, 'onfocus="cbStoreFocus(this)"', 'focus 展开被破坏');
  has(html, 'cbStoreClearSid()', '清除被破坏');
  has(html, 'var can = !!selS && selCoin >= cost && remain > 0;', '未选锁定被破坏');
});

console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);

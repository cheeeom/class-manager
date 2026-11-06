/* v3.9.9 回归：课堂点名的「今天请假」必须与请假页同口径
   ------------------------------------------------------------------
   真实故障（老板反馈）：请假页已把某条记录标成「已销假」并折叠归档，
   课堂点名却仍把这个人的名字挂在「今天请假」里——卡片变灰、抽不到、
   统计还多数一个，两个页面数据对不上。

   根因不是「改版写崩了」，而是两本账两套日历：
     · 点名模块（v2.21.0）的 rcOnLeave 只掐日期区间
       startDate <= date <= min(endDate, returnDate)，**从不看 l.status**；
       销假当天 returnDate 正好是今天，`<=` 把当天仍判成在假。
     · 请假页改版（v3.9.7）的 lvStateOf / lvMatchFilter、
       以及首页 studentsOnLeaveToday，都以 status==='returned' 判定归档。
   三处里唯独点名漏了这一句，改版后对比一强就露馅。

   修法：rcOnLeave 内部对 status==='returned' 短路，与请假页共用同一口径；
   不带 status 的历史残缺数据仍走 rcLeaveEnd 的日期兜底，不误伤。
   本套测试 = 静态契约守卫 + 抽函数真跑 + 变异证伪（把修复删掉必须咬人）。
   版本号一律从 sw.js 的 CACHE_NAME 反推，跟版不用改本文件。
*/
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function has(s, needle, msg) { ok(s.indexOf(needle) >= 0, msg); }
function notHas(s, needle, msg) { ok(s.indexOf(needle) < 0, msg); }

/* 按大括号配对抽完整函数（三个函数体内都没有不成对的花括号） */
function extractFn(name) {
  const sig = 'function ' + name + '(';
  const i = html.indexOf(sig);
  if (i < 0) return '';
  let depth = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}') { depth--; if (depth === 0) return html.slice(i, k + 1); }
  }
  return '';
}

console.log('\n=== ① 静态契约：口径唯一源 + 跟版同步（版本无关） ===');
{
  const vm = sw.match(/const CACHE_NAME = 'class-manager-(v\d+\.\d+\.\d+)';/);
  ok(!!vm, 'sw.js 能反推出版本号');
  const VER = vm ? vm[1] : 'v0.0.0';
  const NUM = VER.slice(1);
  has(html, '<script src="./cmgx.js?v=' + NUM + '"></script>', '页面脚本引用与 CACHE_NAME 同版（' + VER + '）');
  has(sw, "'./cmgx.js?v=" + NUM + "'", 'CORE_ASSETS 与页面请求一字不差（' + VER + '）');
  has(html, '<div class="login-version">' + VER + '</div>', '登录页版本位同版');
  has(html, '近版更新速览（' + VER + '）', '速览标题同版');
  // 🔴 速览正文是「历史条目」：v3.9.9 那条修复说明里的版本号不随跟版改写
  //    （全局替换版本号会把历史注释说成谎话）。只钉「说明还在」，不钉版本号，
  //    否则每次跟版这条都会假红 —— 是测试债，不是产品 bug。
  has(html, '点名与请假口径对齐（', '速览正文保留口径对齐修复说明（历史条目不随跟版改写）');

  /* 老测试按这个字面量钉函数，签名不能动 */
  has(html, 'function rcOnLeave(l, date){', 'rcOnLeave 签名保持原样（_v2220/_v2230 锚点）');
  has(html, "if(l.status === 'returned') return false;", 'rcOnLeave 有已销假短路');
  notHas(extractFn('rcOnLeave'), 'return !!date && !!l &&', '旧的「只看日期」裸返回已移除');
  has(extractFn('rcLeaveMap'), 'if(rcOnLeave(l, date))', 'rcLeaveMap 仍走唯一判据，没有另起一套日历');

  /* 三处口径源不许被「顺手优化」掉 */
  has(extractFn('lvStateOf'), "l.status === 'returned'", '请假页 lvStateOf 仍以 returned 归档');
  has(extractFn('lvMatchFilter'), "st === 'returned'", '请假页筛选仍排除已销假');
  has(extractFn('studentsOnLeaveToday'), "l.status === 'returned'", '首页实到数仍排除已销假');
}

console.log('\n=== ② 抽函数真跑：销假当天必须回到可点名单 ===');
const SRC = extractFn('rcLeaveEnd') + '\n' + extractFn('rcOnLeave') + '\n' + extractFn('rcLeaveMap');
ok(SRC.indexOf('function rcLeaveMap(') >= 0, '三个函数都能完整抽出（大括号配对）');

const D = '2026-11-06';   // 固定「点名当天」，不依赖机器时钟
const pending = { studentId: 1, status: 'pending', startDate: '2026-11-01', endDate: '2026-11-10' };
const extended = { studentId: 4, status: 'extended', startDate: '2026-11-01', endDate: '2026-11-10' };
const returnedEarly = { studentId: 2, status: 'returned', startDate: '2026-11-01', endDate: '2026-11-10', returnDate: D };
const returnedNoDate = { studentId: 3, status: 'returned', startDate: '2026-11-01', endDate: '2026-11-10' };
const legacy = { studentId: 5, startDate: '2026-11-01', endDate: '2026-11-10', returnDate: D }; // 无 status 的残缺数据
const STATE = { leaves: [pending, returnedEarly, returnedNoDate, extended, legacy] };

let api;
try {
  api = new Function('state', SRC + '\nreturn { rcLeaveEnd, rcOnLeave, rcLeaveMap };')(STATE);
  ok(true, '沙箱可跑（未引入任何新外部符号）');
} catch (e) {
  ok(false, '沙箱可跑：' + e.message);
}
if (api) {
  ok(api.rcOnLeave(pending, D) === true, '未销假、日期覆盖今天 → 仍在假（原行为不破）');
  ok(api.rcOnLeave(extended, D) === true, '已续假 → 仍在假');
  ok(api.rcOnLeave(pending, '2026-11-11') === false, '结束日之后 → 不在假');
  ok(api.rcOnLeave(pending, '') === false, '空日期 → 不在假');
  ok(api.rcOnLeave(null, D) === false, '空记录 → 不在假');

  ok(api.rcOnLeave(returnedEarly, D) === false, '核心：销假当天不再挂「假」（老板报的症状）');
  ok(api.rcOnLeave(returnedEarly, '2026-11-03') === false, '核心：已销假记录在假期中间日也不算在假');
  ok(api.rcOnLeave(returnedNoDate, D) === false, '滞后销假 / 无 returnDate 也不算在假');
  ok(api.rcLeaveEnd(returnedEarly) === D, 'rcLeaveEnd 的 min 语义保留（残缺数据兜底仍可用）');
  ok(api.rcOnLeave(legacy, D) === true, '无 status 的历史残缺数据仍按日期兜底，未误伤');

  const m = api.rcLeaveMap(D);
  ok(!m[2] && !m[3], '今天请假名单里没有两条已销假记录');
  ok(!!m[1] && !!m[4] && !!m[5], '未销假 / 已续假 / 残缺数据仍在名单');
  ok(Object.keys(m).length === 3, '「今天请假」人数 = 3（修复前会误报 5）');
}

console.log('\n=== ③ 变异证伪：把修复删掉，测试必须咬人 ===');
{
  const mutated = SRC.replace("  if(l.status === 'returned') return false;\n", '');
  ok(mutated !== SRC, '成功构造「没有已销假短路」的变异体');
  try {
    const bad = new Function('state', mutated + '\nreturn { rcOnLeave, rcLeaveMap };')(STATE);
    ok(bad.rcOnLeave(returnedEarly, D) === true, '变异体在销假当天误判为在假（证明 ② 的断言真能抓到回归）');
    ok(!!bad.rcLeaveMap(D)[2], '变异体的请假名单里混进了已销假的人');
  } catch (e) {
    ok(false, '变异体沙箱异常：' + e.message);
  }
  /* 静态守卫同样要能发现这行消失 */
  const fakeHtml = html.replace("if(l.status === 'returned') return false;", '');
  ok(fakeHtml.indexOf("if(l.status === 'returned') return false;") < 0, '变异体的静态守卫会落空（① 的锚点有效）');
}

console.log('\n=== ④ 四方会审：同一条假条，四个口径源必须说同一句话 ===');
{
  /* 这是本次故障的本质：不是某个函数崩了，而是四个模块各算各的。
     把请假页状态派生、筛选、首页实到数、点名判定放进同一个沙箱真跑，
     谁以后再「顺手」改掉其中一处，这里立刻红。 */
  const CROSS = extractFn('lvIsOverdue') + '\n' + extractFn('lvStateOf') + '\n' +
                extractFn('lvMatchFilter') + '\n' + extractFn('studentsOnLeaveToday') + '\n' + SRC;
  try {
    const c = new Function('state', 'localDateStr',
      CROSS + '\nreturn { lvStateOf, lvMatchFilter, studentsOnLeaveToday, rcOnLeave };'
    )(STATE, function () { return D; });
    ok(c.lvStateOf(returnedEarly) === 'returned', '请假页状态派生：已销假');
    ok(c.lvMatchFilter(returnedEarly, 'inleave') === false, '请假页筛选：不在「在假合计」');
    const onLeave = c.studentsOnLeaveToday();
    ok(onLeave.indexOf('2') < 0 && onLeave.indexOf('3') < 0, '首页实到数：不含两条已销假');
    ok(c.rcOnLeave(returnedEarly, D) === false, '点名页：不算今天请假');

    ok(c.lvStateOf(pending) === 'fresh' && c.lvMatchFilter(pending, 'inleave') === true,
       '未销假：请假页仍判在假');
    ok(onLeave.indexOf('1') >= 0 && c.rcOnLeave(pending, D) === true,
       '未销假：首页与点名页也都判在假（四个口径没有反向分家）');
  } catch (e) {
    ok(false, '四方会审沙箱异常：' + e.message);
  }
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ': ' + pass + ' 项通过，' + fail + ' 项失败');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail === 0 ? 0 : 1);

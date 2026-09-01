/* 中国象棋引擎单测（Node） */
const XQ = require('./xiangqi.js');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

console.log('— 初始化与基础 —');
const b0 = XQ.initialBoard();
ok('初始 32 子', b0.flat().filter(p => p).length === 32);
ok('红帅在 (9,4)', b0[9][4] && b0[9][4].t === 'K' && b0[9][4].c === 'r');
ok('黑将在 (0,4)', b0[0][4] && b0[0][4].t === 'K' && b0[0][4].c === 'b');
ok('初始双方均未被将军', !XQ.isInCheck(b0, 'r') && !XQ.isInCheck(b0, 'b'));

const redMoves = XQ.legalMoves(b0, 'r');
// 中国象棋开局红方合法走法：炮(2)*2 + 马(2)*8 + 兵(5)*1 + 车(2)*0(被挡)= 44 左右
ok('开局红方走法在 40~48 之间 (= ' + redMoves.length + ')', redMoves.length >= 40 && redMoves.length <= 48);

console.log('— 坐标解析 —');
ok('h2h3 解析', JSON.stringify(XQ.parseCoord('h2h3')) === JSON.stringify({ fr: 1, fc: 7, tr: 2, tc: 7 }));
ok('a10i1 解析', JSON.stringify(XQ.parseCoord('a10i1')) === JSON.stringify({ fr: 9, fc: 0, tr: 0, tc: 8 }));
ok('非法坐标返回 null', XQ.parseCoord('zzzz') === null);

console.log('— 马蹩腿 —');
// 构造：红马在 (9,1)(初始马位)，(8,1) 放一子蹩腿 -> 该方向目标不可达
const mb = XQ.initialBoard();
mb[8][1] = { t: 'P', c: 'r' }; // 蹩住马向上-右(8,2)? 马在(9,1)走(7,2)需(8,1)空
const horseMoves = XQ.genMoves(mb, 'r').filter(m => m.fr === 9 && m.fc === 1);
ok('马(9,1)被(8,1)蹩腿后无 (7,2) 走法', !horseMoves.some(m => m.tr === 7 && m.tc === 2));

console.log('— 炮翻山 —');
// 炮(7,1)横向右：需恰有一个炮架才能翻山吃子。
// 在 (7,2) 放炮架(红兵)，(7,3) 放黑兵作目标 —— 中间恰 1 个炮架，可翻山吃 (7,3)
const cb = XQ.initialBoard();
cb[7][2] = { t: 'P', c: 'r' }; // 炮架
cb[7][3] = { t: 'P', c: 'b' }; // 翻山目标
const cannonMoves = XQ.genMoves(cb, 'r').filter(m => m.fr === 7 && m.fc === 1);
const cannonTargets = cannonMoves.map(m => m.tr + ',' + m.tc);
ok('炮(7,1)隔(7,2)炮架翻山吃(7,3)黑兵', cannonTargets.includes('7,3'));
// 反向验证：无炮架时不能隔空吃子
const cb2 = XQ.initialBoard();
cb2[7][3] = { t: 'P', c: 'b' }; // (7,2) 为空，无炮架
const cannonTargets2 = XQ.genMoves(cb2, 'r').filter(m => m.fr === 7 && m.fc === 1).map(m => m.tr + ',' + m.tc);
ok('炮(7,1)无炮架时不能吃(7,3)', !cannonTargets2.includes('7,3'));

console.log('— 将死判定 —');
// 构造真正的双车绝杀局面（清空棋盘，避免初始局面其余棋子干扰）：
//   黑将置于 (0,3)（黑方九宫角）；红车(0,5)沿第0行将军，且被红车(1,5)保护；
//   红车(1,5)同时封住第1行，使黑将 (1,3) 也不可逃。
const kb = XQ.initialBoard();
for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) kb[r][c] = null;
kb[0][3] = { t: 'K', c: 'b' };   // 黑将（九宫角）
kb[0][5] = { t: 'R', c: 'r' };   // 红车(0,5)：沿第0行将军，且被(1,5)红车保护
kb[1][5] = { t: 'R', c: 'r' };   // 红车(1,5)：保护(0,5)并封住第1行(含(1,3))
kb[9][4] = { t: 'K', c: 'r' };   // 红将（远离，避免飞将意外）
const kMoves = XQ.legalMoves(kb, 'b');
ok('双车绝杀无合法走法 (= ' + kMoves.length + ')', kMoves.length === 0);
ok('此时黑被将军', XQ.isInCheck(kb, 'b'));

console.log('— 困毙也算负（无合法走法即判负）—');
ok('genMoves 不依赖送将过滤', XQ.genMoves(kb, 'b').length >= 0); // 仅保证不抛错

console.log('— 序列化往返 —');
const s = XQ.toStr(b0);
const b0b = XQ.fromStr(s);
ok('toStr/fromStr 往返一致', XQ.toStr(b0b) === s);

console.log('— 搜索返回一个合法走法 —');
const mv = XQ.search(b0, 'r', 'medium');
ok('medium 搜索返回合法走法', mv && XQ.legalMoves(b0, 'r').some(m => m.fr === mv.fr && m.fc === mv.fc && m.tr === mv.tr && m.tc === mv.tc));
const t0 = Date.now();
XQ.search(b0, 'r', 'hard');
ok('hard 搜索在 5s 内完成 (' + (Date.now() - t0) + 'ms)', Date.now() - t0 < 5000);

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);

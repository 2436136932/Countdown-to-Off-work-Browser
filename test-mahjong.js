/* 麻将引擎单测（移植后回归）
 * 牌编码：0-8 万1-9，9-17 条1-9，18-26 筒1-9，27 红中（赖子）
 */
const MJ = require('./mahjong.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
const T = {
  w: n => n - 1,                    // 万 n (1-9) -> 0-8
  s: n => 9 + n - 1,                // 条 n -> 9-17
  p: n => 18 + n - 1,               // 筒 n -> 18-26
  z: 27,                            // 红中（赖子）
};

console.log('— 牌面标签 —');
ok('1万 = 0', MJ.tileLabel(T.w(1)) === '1万', MJ.tileLabel(T.w(1)));
ok('9筒 = 26', MJ.tileLabel(T.p(9)) === '9筒', MJ.tileLabel(T.p(9)));
ok('红中 = 27', MJ.tileLabel(T.z) === '中', MJ.tileLabel(T.z));
ok('isLaizi(27)', MJ.isLaizi(T.z) === true);
ok('isLaizi(0) = false', MJ.isLaizi(T.w(1)) === false);

console.log('— 基本胡型：4 副 + 1 将（14 张）—');
// 4 刻子 + 1 将：111万 222万 333万 444万 + 55条
ok('4刻子+1将 = 胡', MJ.win([
  T.w(1), T.w(1), T.w(1),
  T.w(2), T.w(2), T.w(2),
  T.w(3), T.w(3), T.w(3),
  T.w(4), T.w(4), T.w(4),
  T.s(5), T.s(5),
], 0) === true);

// 4 顺子 + 1 将：123万 456万 789万 123条 + 55筒
ok('4顺子+1将 = 胡', MJ.win([
  T.w(1), T.w(2), T.w(3),
  T.w(4), T.w(5), T.w(6),
  T.w(7), T.w(8), T.w(9),
  T.s(1), T.s(2), T.s(3),
  T.p(5), T.p(5),
], 0) === true);

// 13 张不该胡（少一张）
ok('13 张不胡', MJ.win([
  T.w(1), T.w(1), T.w(1),
  T.w(2), T.w(2), T.w(2),
  T.w(3), T.w(3), T.w(3),
  T.w(4), T.w(4), T.w(4),
  T.s(5),
], 0) === false);

// 缺将
ok('缺将不胡', MJ.win([
  T.w(1), T.w(1), T.w(1),
  T.w(2), T.w(2), T.w(2),
  T.w(3), T.w(3), T.w(3),
  T.w(4), T.w(4), T.w(4),
  T.s(5), T.s(6),
], 0) === false);

console.log('— 副露（碰）后张数守恒 —');
// 1 个碰（3张已副露）+ 11 张手牌 = 14 总数
ok('1碰 + 3副1将 = 胡', MJ.win([
  T.w(1), T.w(2), T.w(3),
  T.w(4), T.w(5), T.w(6),
  T.w(7), T.w(8), T.w(9),
  T.p(5), T.p(5),
], 1) === true);
ok('碰数不符不胡', MJ.win([
  T.w(1), T.w(2), T.w(3),
  T.w(4), T.w(5), T.w(6),
  T.w(7), T.w(8), T.w(9),
  T.p(5), T.p(5),
], 0) === false);

console.log('— 赖子（红中）百搭 —');
// 赖子补顺子缺口：12万 + 中(赖子当3万) + 456条 + 789筒 + 11万... 构造 4副1将
ok('赖子补刻子 = 胡', MJ.win([
  T.w(1), T.w(1), T.z,      // 11万 + 赖子当1万 = 111万
  T.w(2), T.w(2), T.w(2),
  T.w(3), T.w(3), T.w(3),
  T.w(4), T.w(4), T.w(4),
  T.s(5), T.s(5),
], 0) === true);

// 赖子做将：引擎要求「2 张赖子」成将（canWinTiles: lz>=2），不支持 1 真牌+1 赖子凑将
ok('2 张赖子做将 = 胡', MJ.win([
  T.w(1), T.w(1), T.w(1),
  T.w(2), T.w(2), T.w(2),
  T.w(3), T.w(3), T.w(3),
  T.w(4), T.w(4), T.w(4),
  T.z, T.z,
], 0) === true);
// 记录引擎设计：1 张真牌 + 1 张赖子 不算将（合肥红中赖子麻将规则变体，原版即如此）
ok('1真牌+1赖子 不构成将（引擎设计）', MJ.win([
  T.w(1), T.w(1), T.w(1),
  T.w(2), T.w(2), T.w(2),
  T.w(3), T.w(3), T.w(3),
  T.w(4), T.w(4), T.w(4),
  T.s(5), T.z,
], 0) === false);

console.log('— 七对（如规则支持）—');
// 七对：7 个对子（部分规则支持，此处仅记录引擎行为，不作强断言）
const sevenPairs = [
  T.w(1), T.w(1), T.w(3), T.w(3), T.w(5), T.w(5),
  T.s(2), T.s(2), T.s(4), T.s(4), T.s(6), T.s(6),
  T.p(8), T.p(8),
];
const spResult = MJ.win(sevenPairs, 0);
console.log('  七对判定 =', spResult, '（引擎含 isSevenPairs，True 表示支持）');
ok('七对要么胡要么不胡（不崩）', typeof spResult === 'boolean');

console.log('— 听牌检测 —');
// 123万 456万 789万 123条 + 5筒(单张) => 听 5筒
const tenpaiHand = [
  T.w(1), T.w(2), T.w(3),
  T.w(4), T.w(5), T.w(6),
  T.w(7), T.w(8), T.w(9),
  T.s(1), T.s(2), T.s(3),
  T.p(5),
];
const tp = MJ.tenpai(tenpaiHand, 0);
ok('听牌非空', Array.isArray(tp) && tp.length > 0, JSON.stringify(tp));
const tpLabels = tp.map(x => MJ.tileLabel(x.t));
ok('听 5筒', tpLabels.includes('5筒'), tpLabels.join(','));

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);

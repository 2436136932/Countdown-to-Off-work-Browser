/* ============================================================
 * 斗地主引擎单测：牌型识别 / 比较大小 / 发牌守恒 / 不洗牌模式
 */
const D = require('./ddz.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
}

/* ---------- 造牌工具 ----------
 * rank: 0=3 … 11=A, 12=2, 13=小王, 14=大王
 * 每个 rank 的 4 张牌 id = rank*4 + suit(0..3)
 */
const C = (rank, suit) => (rank >= 13 ? (rank === 13 ? 52 : 53) : rank * 4 + (suit || 0));
/** 依次取某 rank 的 n 张 */
function rk(rank, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(C(rank, i));
  return out;
}
const typeOf = ids => { const c = D.parseCombo(ids); return c ? c.type : null; };

console.log('— 基础牌型 —');
eq('单张', typeOf([C(0)]), 'single');
eq('对子', typeOf(rk(3, 2)), 'pair');
eq('三张', typeOf(rk(5, 3)), 'trio');
eq('三带一', typeOf([...rk(5, 3), C(9)]), 'trio1');
eq('三带二', typeOf([...rk(5, 3), ...rk(9, 2)]), 'trio2');
eq('炸弹', typeOf(rk(7, 4)), 'bomb');
eq('王炸', typeOf([C(13), C(14)]), 'rocket');

console.log('— 顺子（3~A，不含 2 与王）—');
eq('5 张顺子 34567', typeOf([C(0), C(1), C(2), C(3), C(4)]), 'straight');
eq('12 张顺子 3~A', typeOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(r => C(r))), 'straight');
eq('4 张不算顺子', typeOf([C(0), C(1), C(2), C(3)]), null);
eq('含 2 不算顺子', typeOf([C(9), C(10), C(11), C(12), C(0)]), null);
eq('含王不算顺子', typeOf([C(10), C(11), C(12), C(13), C(14)]), null);
eq('不连续不算顺子', typeOf([C(0), C(1), C(2), C(3), C(5)]), null);

console.log('— 连对 —');
eq('3 连对 334455', typeOf([...rk(0, 2), ...rk(1, 2), ...rk(2, 2)]), 'pairs');
eq('2 连对不算（4 张 3344 非法）', typeOf([...rk(0, 2), ...rk(1, 2)]), null);
eq('连对含 2 不算', typeOf([...rk(10, 2), ...rk(11, 2), ...rk(12, 2)]), null);
eq('连对不连续不算', typeOf([...rk(0, 2), ...rk(1, 2), ...rk(3, 2)]), null);

console.log('— 飞机 —');
eq('飞机 2 组 333444', typeOf([...rk(0, 3), ...rk(1, 3)]), 'plane');
eq('飞机 3 组 333444555', typeOf([...rk(0, 3), ...rk(1, 3), ...rk(2, 3)]), 'plane');
eq('飞机带单 333444+56', typeOf([...rk(0, 3), ...rk(1, 3), C(5), C(6)]), 'plane1');
eq('飞机带单 333444+55（同点两张单）', typeOf([...rk(0, 3), ...rk(1, 3), ...rk(5, 2)]), 'plane1');
eq('飞机带对 333444+5566', typeOf([...rk(0, 3), ...rk(1, 3), ...rk(5, 2), ...rk(6, 2)]), 'plane2');
eq('飞机带单不能带对子（333444+55667 是 9 张非法）', typeOf([...rk(0, 3), ...rk(1, 3), ...rk(5, 2), C(6)]), null);
eq('4 连三张是纯飞机不是带单', typeOf([...rk(0, 3), ...rk(1, 3), ...rk(2, 3), ...rk(3, 3)]), 'plane');
eq('飞机主体含 2 不算 222333', typeOf([...rk(12, 3), ...rk(11, 3)]), null, typeOf([...rk(12, 3), ...rk(11, 3)]));

console.log('— 四带二 / 四带两对 —');
eq('四带二 4444+56', typeOf([...rk(0, 4), C(5), C(6)]), 'four2');
eq('四带一对 4444+55', typeOf([...rk(0, 4), ...rk(5, 2)]), 'four2');
eq('四带两对 4444+5566', typeOf([...rk(0, 4), ...rk(5, 2), ...rk(6, 2)]), 'four22');
eq('四带两单不是四带两对', typeOf([...rk(0, 4), C(5), C(6), C(7), C(8)]), null);

console.log('— 非法牌型 —');
eq('空数组', D.parseCombo([]), null);
eq('两张不同点', typeOf([C(0), C(1)]), null);
eq('三张不同点', typeOf([C(0), C(1), C(2)]), null);
eq('5 张杂牌', typeOf([C(0), C(1), C(3), C(5), C(7)]), null);

console.log('— 比较大小 —');
const cmp = (a, b) => D.compareCombo(D.parseCombo(a), D.parseCombo(b));
ok('大单张压小单张', cmp([C(5)], [C(3)]) > 0);
ok('同点不压', cmp([C(5)], [C(5)]) === 0);
ok('王压 2', cmp([C(13)], [C(12)]) > 0);
ok('大王压小王', cmp([C(14)], [C(13)]) > 0);
ok('对子不能压单张', cmp(rk(5, 2), [C(0)]) === 0);
eq('长度不同的顺子不可比', cmp([C(0), C(1), C(2), C(3), C(4)], [C(0), C(1), C(2), C(3), C(4), C(5)]), 0);
eq('长度不同的顺子不可比（反向）', cmp([C(0), C(1), C(2), C(3), C(4), C(5)], [C(0), C(1), C(2), C(3), C(4)]), 0);
ok('同长顺子比最大牌', cmp([C(1), C(2), C(3), C(4), C(5)], [C(0), C(1), C(2), C(3), C(4)]) > 0);
ok('炸弹压普通牌型', cmp(rk(0, 4), [C(14)]) > 0);
ok('大炸弹压小炸弹', cmp(rk(5, 4), rk(3, 4)) > 0);
ok('王炸压炸弹', cmp([C(13), C(14)], rk(12, 4)) > 0);
ok('炸弹压不了王炸', cmp(rk(12, 4), [C(13), C(14)]) < 0);
ok('飞机带单压不过飞机带对（不同型）', cmp([...rk(0, 3), ...rk(1, 3), C(5), C(6)], [...rk(0, 3), ...rk(1, 3), ...rk(5, 2), ...rk(6, 2)]) === 0);

console.log('— canBeat —');
ok('大单张可压', D.canBeat([C(6)], D.parseCombo([C(5)])));
ok('小单张不可压', !D.canBeat([C(4)], D.parseCombo([C(5)])));
ok('首出任意合法牌型可出', D.canBeat([C(0)], null));
ok('首出非法牌型不可出', !D.canBeat([C(0), C(1)], null));

console.log('— 发牌守恒 —');
{
  const deck = D.shuffle(D.createDeck());
  eq('洗牌后仍 54 张', deck.length, 54);
  eq('洗牌后无重复', new Set(deck).size, 54);
  const { hands, bottom } = D.deal(deck);
  eq('3 家各 17 张', hands.map(h => h.length), [17, 17, 17]);
  eq('底牌 3 张', bottom.length, 3);
  const all = hands.flat().concat(bottom);
  eq('发牌后无重复无缺失', new Set(all).size, 54);

  const seg = D.dealSegmented(deck);
  eq('分段发牌 3 家各 17 张', seg.hands.map(h => h.length), [17, 17, 17]);
  eq('分段发牌底牌 3 张', seg.bottom.length, 3);
  eq('分段发牌也无重复', new Set(seg.hands.flat().concat(seg.bottom)).size, 54);
}

console.log('— 收牌 / 切牌（不洗牌模式）—');
{
  const deck = D.shuffle(D.createDeck());
  const { hands, bottom } = D.deal(deck);
  // 模拟：三家打出了部分牌，剩下的是手牌
  const plays = [
    { cards: hands[0].slice(0, 3) },
    { cards: hands[1].slice(0, 2) },
    { cards: hands[2].slice(0, 5) },
    { cards: hands[0].slice(3, 4) },
  ];
  const remaining = [
    hands[0].slice(4),
    hands[1].slice(2),
    hands[2].slice(5),
  ];
  // 底牌最终归地主，也要算进剩牌
  const rem = remaining.map((h, i) => i === 0 ? h.concat(bottom) : h);
  const nd = D.collectDeck(plays, rem);
  eq('收牌后仍是 54 张', nd.length, 54);
  eq('收牌后无重复', new Set(nd).size, 54);
  eq('收牌顺序：先出牌在前', nd[0], plays[0].cards[0]);

  const cut = D.cutDeck(nd, 20);
  eq('切牌后张数不变', cut.length, 54);
  eq('切牌后集合不变', new Set(cut).size, 54);
  eq('切牌是平移不是洗牌', cut.slice(0, 3), nd.slice(20, 23));
  eq('切 0 张等于原样', D.cutDeck(nd, 0), nd);
  eq('切 54 张等于原样', D.cutDeck(nd, 54), nd);
  ok('负数切点也安全', D.cutDeck(nd, -5).length === 54);
  // 非法收牌应抛错
  let threw = false;
  try { D.collectDeck([{ cards: [0, 0] }], []); } catch (e) { threw = true; }
  ok('收牌重复牌会抛错', threw);
}

console.log('— 不洗牌机制：分段发牌保留相邻牌（核心）—');
{
  // 造一个「四张 3 相邻」的牌堆：分段发牌应全部落到同一家（成炸弹），
  // 而 1 张一轮的轮流发牌会把它们拆散（不成炸弹）。
  const deck = D.createDeck();          // 0,1,2,3 就是四张 3，天然相邻
  const segs = D.dealSegmented(deck);
  const r0 = D.countByRank(segs.hands[0]);
  eq('分段发牌：四张 3 全在同一家', r0[0], 4);
  ok('分段发牌：前 17 张的整组同点都成炸弹', D.bombsPerHand(segs.hands) >= 4,
    '实际 ' + D.bombsPerHand(segs.hands) + ' 个');

  const rot = D.deal(deck);
  const rotBombs = D.bombsPerHand(rot.hands);
  eq('轮流发牌：四张 3 被拆散，无炸弹', rotBombs, 0);
}

console.log('— 完整对局模拟（状态机）—');
{
  /** 打完整一局，返回 game 对象；stack 为 null 时随机洗牌 */
  function playFullGame(mode, stack) {
    const g = D.createGame({ mode, deckStack: stack, diff: 'medium' });
    g.bid(0, 3);                        // 玩家叫 3 分当地主，保证流程一致
    g.runAiBids();
    g.settleBid();
    // 关键：炸弹要在「发牌 + 地主拿底牌」之后统计，
    // 打到结束时手牌已大量打空，统计会失真。
    g.__startBombs = D.bombsPerHand(g.state.hands);
    let guard = 0;
    while (g.state.phase === 'play' && guard++ < 800) {
      if (g.isAiTurn()) { g.aiStep(); continue; }
      const hand = g.state.hands[0];
      const target = g.state.table ? g.state.table.combo : null;
      const ctx = {
        seat: 0, landlord: g.state.landlord,
        lastSeat: g.state.table ? g.state.table.seat : null,
        handCounts: g.state.hands.map(h => h.length), diff: 'medium',
      };
      const cards = D.aiChoose(hand, target, ctx);
      if (cards && cards.length && g.play(0, cards).ok) continue;
      if (g.pass(0).ok) continue;
      // 必须出牌却没有可用 AI 牌：出最小单张兜底
      if (!g.play(0, [hand[hand.length - 1]]).ok) break;
    }
    return g;
  }

  const g1 = playFullGame('shuffle', null);
  ok('状态机能打完一局', g1.state.phase === 'over', 'phase=' + g1.state.phase);
  ok('有胜方', !!g1.state.winner);
  eq('打完后三家手牌总数 + 出牌总数 = 54',
     g1.state.hands.flat().length + g1.state.history.reduce((n, h) => n + h.cards.length, 0), 54);

  // 牌序守恒：收牌能拿回完整 54 张
  const harvested = g1.harvestDeck();
  eq('收牌 54 张', harvested.length, 54);
  eq('收牌无重复', new Set(harvested).size, 54);

  // 连续多局：不洗牌 vs 每局重洗，比较开局炸弹总数
  const ROUNDS = 100;
  let shuffleBombs = 0, noSaveBombs = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const gs = playFullGame('shuffle', null);
    shuffleBombs += gs.__startBombs;
  }
  let stack = null;
  for (let i = 0; i < ROUNDS; i++) {
    const gn = playFullGame('nosave', stack);
    noSaveBombs += gn.__startBombs;
    stack = gn.harvestDeck();
  }
  console.log(`    ${ROUNDS} 局开局炸弹总数：洗牌 ${shuffleBombs} vs 不洗牌 ${noSaveBombs}`);
  ok('不洗牌模式的炸弹数明显多于洗牌模式', noSaveBombs > shuffleBombs,
    `洗牌 ${shuffleBombs} vs 不洗牌 ${noSaveBombs}`);
}

console.log('— 不洗牌连局牌堆守恒 —');
{
  let deck = D.shuffle(D.createDeck());
  let bad = 0;
  for (let i = 0; i < 20; i++) {
    const { hands, bottom } = D.dealSegmented(deck);
    if (hands.some(h => h.length !== 17) || bottom.length !== 3) bad++;
    deck = D.collectDeck([], hands.concat([bottom]));
    if (deck.length !== 54) bad++;
  }
  eq('连打 20 局牌堆始终守恒', bad, 0);
}

console.log('— AI 基本行为 —');
{
  // 首出必须合法
  const hand = [C(0), C(1), C(2), C(4), C(8), C(9), C(10), C(11), C(12), C(13), C(14),
    ...rk(3, 2), ...rk(6, 3), ...rk(5, 4)];
  const lead = D.aiChoose(hand, null, { seat: 0, landlord: 0, diff: 'hard' });
  ok('首出返回合法牌型', lead && D.parseCombo(lead), lead ? D.cardsToStr(lead) : 'null');
  ok('首出不会出空', lead && lead.length > 0);

  // 跟牌必须能压
  const target = D.parseCombo([C(2)]);       // 5
  const beat = D.aiChoose(hand, target, { seat: 0, landlord: 0, diff: 'hard' });
  if (beat) {
    ok('跟牌能压过目标', D.canBeat(beat, target), D.cardsToStr(beat));
  } else {
    ok('跟牌选择不要也是允许的', true);
  }

  // 压不过时必须返回 null
  const bigTarget = D.parseCombo([C(14)]);   // 大王单张
  const cantBeat = D.aiChoose([C(0), C(1)], bigTarget, { seat: 0, landlord: 0, diff: 'hard' });
  eq('压不过时返回 null', cantBeat, null);

  // 农民不压队友（medium/hard 下交给随机概率，hard 的 smartPass=1）
  const mateTarget = D.parseCombo([C(2)]);
  const savedRng = Math.random;
  let passCount = 0;
  for (let i = 0; i < 30; i++) {
    const r = D.aiChoose([C(3), C(4)], mateTarget, {
      seat: 1, landlord: 0, lastSeat: 2, handCounts: [17, 2, 5], diff: 'hard',
    });
    if (r === null) passCount++;
  }
  ok('农民对队友的牌大概率不压', passCount >= 25, `30 次里 ${passCount} 次让路`);
}

console.log('— genBeats / genLeads —');
{
  const hand = [C(0), C(1), ...rk(4, 2), ...rk(7, 3), ...rk(9, 4)];
  const tg = D.parseCombo([C(2)]);   // 单张 5
  const beats = D.genBeats(hand, tg);
  ok('genBeats 有结果', beats.length > 0);
  ok('genBeats 全部合法且能压', beats.every(b => D.canBeat(b, tg)), JSON.stringify(beats.map(b => D.cardsToStr(b))));

  const leads = D.genLeads(hand);
  ok('genLeads 有结果', leads.length > 0);
  ok('genLeads 全部是合法牌型', leads.every(l => D.parseCombo(l.cards)), JSON.stringify(leads.map(l => l.type)));
  ok('genLeads 不含炸弹', leads.every(l => D.parseCombo(l.cards).type !== 'bomb'));
}

console.log(fail === 0 ? `\n结果：${pass} 通过，0 失败` : `\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);

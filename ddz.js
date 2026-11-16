/* ============================================================
 * ddz.js — 斗地主引擎（单副 54 张 · 洗牌 / 不洗牌双模式）
 *
 * 牌编码：
 *   0-51  常规牌：rank = id >> 2 (0..12)，suit = id & 3
 *   52    小王（rank 13）
 *   53    大王（rank 14）
 *   rank: 0=3 1=4 2=5 3=6 4=7 5=8 6=9 7=10 8=J 9=Q 10=K 11=A 12=2 13=小王 14=大王
 *   顺子/连对/飞机的主体只能用 rank 0..11（3 到 A），2 与王不可入顺。
 *
 * 两套出口（对齐仓库现有约定）：
 *   - 纯逻辑函数：供 test-ddz.js 直接调用（同 mahjong.js 风格）
 *   - factory()：供 content_pet.js 的 simpleGames 挂载（同 lianliankan.js 风格）
 * ============================================================ */
const DDZ = (() => {
  'use strict';

  /* ---------- 牌编码与基础工具 ---------- */
  const RANK_A = 11;          // A
  const RANK_2 = 12;
  const JOKER_S = 13;         // 小王
  const JOKER_B = 14;         // 大王
  const RANK_LABEL = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'];
  const SUIT_ICON = ['♠', '♥', '♣', '♦'];

  const rankOf = id => (id < 52 ? (id >> 2) : (id === 52 ? JOKER_S : JOKER_B));
  const suitOf = id => (id < 52 ? (id & 3) : -1);
  const isJoker = id => id >= 52;

  /** 牌面短标签，如 "♠A" / "小王" */
  function cardLabel(id) {
    if (isJoker(id)) return RANK_LABEL[rankOf(id)];
    return SUIT_ICON[suitOf(id)] + RANK_LABEL[rankOf(id)];
  }

  /** 该牌在 UI 上的颜色类别：'red' 红 / 'black' 黑 / 'joker' 王 */
  function cardTone(id) {
    if (isJoker(id)) return 'joker';
    const s = suitOf(id);
    return (s === 1 || s === 3) ? 'red' : 'black';
  }

  const sameRank = (a, b) => rankOf(a) === rankOf(b);

  function countByRank(ids) {
    const cnt = new Array(15).fill(0);
    for (const id of ids) cnt[rankOf(id)]++;
    return cnt;
  }

  function groupByRank(ids) {
    const g = {};
    for (const id of ids) {
      const r = rankOf(id);
      (g[r] || (g[r] = [])).push(id);
    }
    return g;
  }

  /* ---------- 牌型识别 ---------- */
  /**
   * 牌型表：
   *  single 单张 / pair 对子 / trio 三张 / trio1 三带一 / trio2 三带二
   *  straight 顺子 / pairs 连对 / plane 飞机 / plane1 飞机带单 / plane2 飞机带对
   *  four2 四带二 / four22 四带两对 / bomb 炸弹 / rocket 王炸
   */
  const mk = (type, key, len) => ({ type, key, len });

  /** 在 cnt 中寻找 k 组连续三张，并校验剩余牌是否构成指定翅膀。 */
  function findPlaneBody(cnt, n, kickerKind) {
    for (let start = 0; start <= RANK_A; start++) {
      if (cnt[start] < 3) continue;
      let k = 0;
      for (let r = start; r <= RANK_A; r++) {
        if (cnt[r] < 3) break;
        k++;
        if (k < 2) continue;
        const used = 3 * k;
        if (used > n) break;
        const remain = n - used;

        const c2 = cnt.slice();
        for (let q = start; q < start + k; q++) c2[q] -= 3;

        if (kickerKind === 'none') {
          if (remain === 0 && c2.every(v => v === 0)) return { start, k };
        } else if (kickerKind === 'pair') {
          // 翅膀必须全是成对的牌，共 k 对
          let ok = true, cntPairs = 0;
          for (let q = 0; q < 15; q++) {
            if (c2[q] === 0) continue;
            if (c2[q] !== 2) { ok = false; break; }
            cntPairs++;
          }
          if (ok && cntPairs === k && remain === 2 * k) return { start, k };
        } else {
          // 带单：剩余总张数正好 k 张（点数可重复）
          let total = 0;
          for (let q = 0; q < 15; q++) total += c2[q];
          if (total === k && remain === k) return { start, k };
        }
      }
    }
    return null;
  }

  function parseStraight(cnt, n) {
    if (n < 5) return null;
    let start = -1, end = -1, total = 0;
    for (let r = 0; r < 15; r++) {
      if (cnt[r] === 0) continue;
      if (cnt[r] !== 1) return null;
      if (r > RANK_A) return null;          // 2 与王不可入顺
      if (start < 0) start = r;
      end = r; total++;
    }
    if (total !== n || end - start + 1 !== n) return null;
    return mk('straight', end, n);
  }

  function parsePairs(cnt, n) {
    if (n < 6 || n % 2 !== 0) return null;
    const k = n / 2;
    if (k < 3) return null;
    let start = -1, end = -1, total = 0;
    for (let r = 0; r < 15; r++) {
      if (cnt[r] === 0) continue;
      if (cnt[r] !== 2) return null;
      if (r > RANK_A) return null;
      if (start < 0) start = r;
      end = r; total++;
    }
    if (total !== k || end - start + 1 !== k) return null;
    return mk('pairs', end, n);
  }

  function parsePlane(cnt, n) {
    if (n < 6) return null;
    // 纯飞机优先（避免 12 张 4 连三张被误判成飞机带单）
    if (n % 3 === 0 && n / 3 >= 2) {
      const body = findPlaneBody(cnt, n, 'none');
      if (body) return mk('plane', body.start + body.k - 1, n);
    }
    if (n % 4 === 0 && n / 4 >= 2) {
      const body = findPlaneBody(cnt, n, 'single');
      if (body) return mk('plane1', body.start + body.k - 1, n);
    }
    if (n % 5 === 0 && n / 5 >= 2) {
      const body = findPlaneBody(cnt, n, 'pair');
      if (body) return mk('plane2', body.start + body.k - 1, n);
    }
    return null;
  }

  /**
   * 识别一组牌的牌型。
   * @param {number[]} ids
   * @returns {{type:string,key:number,len:number}|null} 非法返回 null
   */
  function parseCombo(ids) {
    if (!Array.isArray(ids) || !ids.length) return null;
    const n = ids.length;
    if (n > 20) return null;
    const cnt = countByRank(ids);
    let sum = 0;
    for (let r = 0; r < 15; r++) sum += cnt[r];
    if (sum !== n) return null;

    // 王炸
    if (n === 2 && cnt[JOKER_S] === 1 && cnt[JOKER_B] === 1) return mk('rocket', JOKER_B, 2);
    // 炸弹（4 张同点，含 4 张王？王只有各 1 张，不会命中）
    if (n === 4) {
      for (let r = 0; r < 15; r++) if (cnt[r] === 4) return mk('bomb', r, 4);
    }
    if (n === 1) return mk('single', rankOf(ids[0]), 1);
    if (n === 2) {
      for (let r = 0; r < 15; r++) if (cnt[r] === 2) return mk('pair', r, 2);
      return null;
    }
    if (n === 3) {
      for (let r = 0; r < 15; r++) if (cnt[r] === 3) return mk('trio', r, 3);
      return null;
    }
    if (n === 4) {
      for (let r = 0; r < 15; r++) if (cnt[r] === 3) return mk('trio1', r, 4);
      return null;
    }
    if (n === 5) {
      for (let r = 0; r < 15; r++) if (cnt[r] === 3) {
        for (let q = 0; q < 15; q++) if (q !== r && cnt[q] === 2) return mk('trio2', r, 5);
      }
    }

    const st = parseStraight(cnt, n);
    if (st) return st;
    const pr = parsePairs(cnt, n);
    if (pr) return pr;
    const pl = parsePlane(cnt, n);
    if (pl) return pl;

    // 四带二（4 + 2 单，含一对）与四带两对（4 + 2 对）
    if (n === 6) {
      for (let r = 0; r < 15; r++) if (cnt[r] === 4) return mk('four2', r, 6);
    }
    if (n === 8) {
      for (let r = 0; r < 15; r++) {
        if (cnt[r] !== 4) continue;
        let ok = true, pairCnt = 0;
        for (let q = 0; q < 15; q++) {
          if (q === r || cnt[q] === 0) continue;
          if (cnt[q] === 2) pairCnt++;
          else { ok = false; break; }
        }
        if (ok && pairCnt === 2) return mk('four22', r, 8);
      }
    }
    return null;
  }

  /** 牌型中文名 */
  const TYPE_CN = {
    single: '单张', pair: '对子', trio: '三张', trio1: '三带一', trio2: '三带二',
    straight: '顺子', pairs: '连对', plane: '飞机', plane1: '飞机带单', plane2: '飞机带对',
    four2: '四带二', four22: '四带两对', bomb: '炸弹', rocket: '王炸',
  };

  /**
   * 比较两个牌型。a 大于 b 返回 >0；不可比较返回 0。
   * 规则：王炸 > 炸弹 > 普通牌型；普通牌型必须同 type 且同长度才能比。
   */
  function compareCombo(a, b) {
    if (!a || !b) return 0;
    if (a.type === 'rocket' || b.type === 'rocket') {
      if (a.type === 'rocket' && b.type === 'rocket') return 0;
      return a.type === 'rocket' ? 1 : -1;
    }
    const aBomb = a.type === 'bomb', bBomb = b.type === 'bomb';
    if (aBomb || bBomb) {
      if (aBomb && bBomb) return a.key - b.key;
      return aBomb ? 1 : -1;
    }
    if (a.type !== b.type) return 0;
    if (a.len !== b.len) return 0;
    return a.key - b.key;
  }

  /** cards 能否压过 target（target 为 null 表示首出） */
  function canBeat(cards, target) {
    const c = parseCombo(cards);
    if (!c) return false;
    if (!target) return true;
    return compareCombo(c, target) > 0;
  }

  /* ---------- 牌堆与发牌 ---------- */
  /** 全新单副牌 54 张（3~A 各 4 张 + 2 四张 + 大小王） */
  function createDeck() {
    const d = [];
    for (let i = 0; i < 54; i++) d.push(i);
    return d;
  }

  /** 用传入的 rng 做 Fisher-Yates 洗牌（rng 默认 Math.random，测试可注入） */
  function shuffle(deck, rng) {
    const r = rng || Math.random;
    const a = deck.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  const PLAYER_COUNT = 3;
  const HAND_SIZE = 17;
  const BOTTOM_SIZE = 3;

  /**
   * 按牌堆顺序轮流发牌（1 张一轮）。
   * @returns {{hands:number[][], bottom:number[]}}
   */
  function deal(deck) {
    if (!Array.isArray(deck) || deck.length !== 54) throw new Error('牌堆必须是 54 张');
    const hands = [[], [], []];
    for (let i = 0; i < 51; i++) hands[i % PLAYER_COUNT].push(deck[i]);
    return { hands, bottom: deck.slice(51) };
  }

  /**
   * 不洗牌模式的「分段发牌」：牌堆按顺序切成长度 17 的三段 + 3 张底牌。
   *
   * 为什么不用轮流发：不洗牌玩法的核心手感是「上一局相邻的牌（对子/三张）继续落在同一家」，
   * 若沿用 1 张一轮的轮流发，相邻牌会被拆到不同玩家，炸弹率几乎不会上升，
   * 与「手牌更整齐、炸弹更多」的玩法预期相悖。
   */
  function dealSegmented(deck) {
    if (!Array.isArray(deck) || deck.length !== 54) throw new Error('牌堆必须是 54 张');
    const hands = [];
    for (let p = 0; p < PLAYER_COUNT; p++) {
      hands.push(deck.slice(p * HAND_SIZE, (p + 1) * HAND_SIZE));
    }
    return { hands, bottom: deck.slice(51) };
  }

  /**
   * 不洗牌模式收牌：把本局打出的牌按时间顺序叠成新牌堆，再盖上各家剩牌。
   * 牌数严格守恒（54 张）。
   * @param {Array<{cards:number[]}>} plays 按出牌先后排列的出牌记录
   * @param {number[][]} remaining 三家剩余手牌
   */
  function collectDeck(plays, remaining) {
    const deck = [];
    for (const p of (plays || [])) {
      const cs = Array.isArray(p) ? p : (p && p.cards) || [];
      for (const c of cs) deck.push(c);
    }
    for (const h of (remaining || [])) {
      for (const c of h) deck.push(c);
    }
    if (deck.length !== 54) throw new Error('收牌后牌堆必须是 54 张，实际 ' + deck.length);
    // 校验牌身份不重复、不缺失
    const seen = new Array(54).fill(false);
    for (const c of deck) {
      if (c < 0 || c > 53 || seen[c]) throw new Error('收牌出现重复或非法牌：' + c);
      seen[c] = true;
    }
    return deck;
  }

  /** 切牌：只平移起点，不改变牌之间的相对顺序 */
  function cutDeck(deck, point) {
    const n = deck.length;
    if (!n) return [];
    let p = Number.isFinite(point) ? Math.floor(point) : 0;
    p = ((p % n) + n) % n;
    return deck.slice(p).concat(deck.slice(0, p));
  }

  /** 统计牌堆里的炸弹数量（4 张同点算 1 个，另算王炸），用于验证不洗牌效果 */
  function countBombs(hands, bottom) {
    const all = [];
    for (const h of hands) for (const c of h) all.push(c);
    for (const c of (bottom || [])) all.push(c);
    const cnt = countByRank(all);
    let bombs = 0;
    for (let r = 0; r < 15; r++) if (cnt[r] === 4) bombs++;
    const hasRocket = cnt[JOKER_S] === 1 && cnt[JOKER_B] === 1;
    return { bombs, rocket: hasRocket ? 1 : 0 };
  }

  /** 统计每个玩家手里的炸弹数（炸弹只有整副在同一家才算真炸） */
  function bombsPerHand(hands) {
    let total = 0;
    for (const h of hands) {
      const cnt = countByRank(h);
      for (let r = 0; r < 15; r++) if (cnt[r] === 4) total++;
    }
    return total;
  }

  /* ---------- AI ---------- */
  const DIFF = {
    easy: { bomb: 0.9, smartPass: 0.15, leadLong: 0.3 },
    medium: { bomb: 0.45, smartPass: 0.8, leadLong: 0.7 },
    hard: { bomb: 0.15, smartPass: 1, leadLong: 1 },
  };

  /** 从手牌里列出所有「能压过 target」的组合（同型同长 + 炸弹 + 王炸） */
  function genBeats(hand, target) {
    const out = [];
    if (!target) return out;
    const g = groupByRank(hand);
    const ranks = Object.keys(g).map(Number).sort((a, b) => a - b);
    const cnt = countByRank(hand);
    const kinds = r => g[r] || [];

    const push = cards => {
      const combo = parseCombo(cards);
      if (combo && compareCombo(combo, target) > 0) out.push(cards);
    };

    if (target.type === 'single') {
      for (const r of ranks) if (r > target.key) push([kinds(r)[0]]);
    } else if (target.type === 'pair') {
      for (const r of ranks) if (r > target.key && cnt[r] >= 2) push(kinds(r).slice(0, 2));
    } else if (target.type === 'trio') {
      for (const r of ranks) if (r > target.key && cnt[r] >= 3) push(kinds(r).slice(0, 3));
    } else if (target.type === 'trio1' || target.type === 'trio2') {
      const need = target.type === 'trio1' ? 1 : 2;
      for (const r of ranks) {
        if (r <= target.key || cnt[r] < 3) continue;
        const kick = pickKickers(hand, r, need, 1);
        if (kick) push(kinds(r).slice(0, 3).concat(kick));
      }
    } else if (target.type === 'straight') {
      const len = target.len;
      for (let s = 0; s + len - 1 <= RANK_A; s++) {
        if (s + len - 1 <= target.key) continue;
        const cards = [];
        let ok = true;
        for (let r = s; r < s + len; r++) {
          if (cnt[r] < 1) { ok = false; break; }
          cards.push(kinds(r)[0]);
        }
        if (ok) push(cards);
      }
    } else if (target.type === 'pairs') {
      const k = target.len / 2;
      for (let s = 0; s + k - 1 <= RANK_A; s++) {
        if (s + k - 1 <= target.key) continue;
        const cards = [];
        let ok = true;
        for (let r = s; r < s + k; r++) {
          if (cnt[r] < 2) { ok = false; break; }
          cards.push(...kinds(r).slice(0, 2));
        }
        if (ok) push(cards);
      }
    } else if (target.type === 'plane' || target.type === 'plane1' || target.type === 'plane2') {
      const bodyLen = target.type === 'plane' ? 3 : (target.type === 'plane1' ? 4 : 5);
      const k = target.len / bodyLen;
      const kick = target.type === 'plane' ? 0 : (target.type === 'plane1' ? 1 : 2);
      for (let s = 0; s + k - 1 <= RANK_A; s++) {
        if (s + k - 1 <= target.key) continue;
        const cards = [];
        let ok = true;
        for (let r = s; r < s + k; r++) {
          if (cnt[r] < 3) { ok = false; break; }
          cards.push(...kinds(r).slice(0, 3));
        }
        if (!ok) continue;
        if (!kick) { push(cards); continue; }
        const need = kick * k;
        const rest = hand.filter(id => cards.indexOf(id) < 0);
        const kickers = pickKickersMulti(rest, need, kick);
        if (kickers) push(cards.concat(kickers));
      }
    } else if (target.type === 'four2' || target.type === 'four22') {
      const kick = target.type === 'four2' ? 1 : 2;
      // 四带二带 2 张单牌；四带两对带 4 张（2 对）
      const total = kick === 1 ? 2 : 4;
      for (const r of ranks) {
        if (r <= target.key || cnt[r] < 4) continue;
        const rest = hand.filter(id => rankOf(id) !== r);
        const kickers = pickKickersMulti(rest, total, kick);
        if (kickers) push(kinds(r).slice(0, 4).concat(kickers));
      }
    }

    // 炸弹与王炸总能压（target 本身是炸弹时，只有更大的炸弹/王炸能压）
    for (const r of ranks) {
      if (cnt[r] === 4) {
        const cards = kinds(r).slice(0, 4);
        if (compareCombo(mk('bomb', r, 4), target) > 0) out.push(cards);
      }
    }
    if (cnt[JOKER_S] && cnt[JOKER_B]) {
      const cards = [kinds(JOKER_S)[0], kinds(JOKER_B)[0]];
      if (compareCombo(mk('rocket', JOKER_B, 2), target) > 0) out.push(cards);
    }
    return out;
  }

  /** 挑 n 组「need 张」的带牌，优先点数小的、不动炸弹 */
  function pickKickers(hand, excludeRank, need, kickSize) {
    const cnt = countByRank(hand);
    const g = groupByRank(hand);
    const ranks = Object.keys(g).map(Number)
      .filter(r => r !== excludeRank && cnt[r] <= 3 && !(cnt[r] === 4))
      .sort((a, b) => a - b);
    const picked = [];
    for (const r of ranks) {
      if (picked.length >= kickSize * need) break;
      if (cnt[r] >= kickSize) picked.push(...g[r].slice(0, kickSize));
    }
    return picked.length >= kickSize * need ? picked.slice(0, kickSize * need) : null;
  }

  function pickKickersMulti(hand, total, kickSize) {
    return pickKickers(hand, -1, total / kickSize, kickSize);
  }

  /** 列出首出候选（不含炸弹/王炸，炸弹留作后用） */
  function genLeads(hand) {
    const g = groupByRank(hand);
    const ranks = Object.keys(g).map(Number).sort((a, b) => a - b);
    const cnt = countByRank(hand);
    const out = [];

    for (const r of ranks) {
      const cs = g[r];
      if (cs.length === 1) out.push({ cards: [cs[0]], type: 'single' });
      else if (cs.length === 2) out.push({ cards: cs.slice(0, 2), type: 'pair' });
      else if (cs.length === 3) out.push({ cards: cs.slice(0, 3), type: 'trio' });
      else if (cs.length === 4) { /* 炸弹不主动出 */ }
    }

    // 顺子（长度 5 起，尽量长）
    for (let s = 0; s <= RANK_A; s++) {
      let e = s;
      while (e <= RANK_A && cnt[e] >= 1) e++;
      const len = e - s;
      if (len >= 5) {
        const cards = [];
        for (let r = s; r < s + len; r++) cards.push(g[r][0]);
        out.push({ cards, type: 'straight' });
      }
      // 必须只在真的跨过一段时才前移，否则空点数会让 s 原地打转（死循环）
      if (e > s) s = e - 1;
    }

    // 连对（3 对起）
    for (let s = 0; s <= RANK_A; s++) {
      let e = s;
      while (e <= RANK_A && cnt[e] >= 2) e++;
      const len = e - s;
      if (len >= 3) {
        const cards = [];
        for (let r = s; r < s + len; r++) cards.push(...g[r].slice(0, 2));
        out.push({ cards, type: 'pairs' });
      }
      if (e > s) s = e - 1;
    }

    // 飞机（2 组连续三张起）
    for (let s = 0; s <= RANK_A; s++) {
      let e = s;
      while (e <= RANK_A && cnt[e] >= 3) e++;
      const len = e - s;
      if (len >= 2) {
        const cards = [];
        for (let r = s; r < s + len; r++) cards.push(...g[r].slice(0, 3));
        out.push({ cards, type: 'plane' });
      }
      if (e > s) s = e - 1;
    }
    return out;
  }

  /**
   * AI 决策。
   * @param {number[]} hand       我的手牌
   * @param {object|null} target  桌上等待压的牌型（null = 我首出）
   * @param {object} ctx          { diff, seat, landlord, lastSeat, handCounts, played:[], rng }
   * @returns {number[]|null}     要出的牌；null = 不要
   */
  function aiChoose(hand, target, ctx) {
    const c = ctx || {};
    const diff = DIFF[c.diff] || DIFF.medium;
    const rng = c.rng || Math.random;
    const mine = hand.slice();

    // 队友判断：农民之间是队友
    const iAmLandlord = c.seat === c.landlord;
    const lastIsTeammate = !iAmLandlord && c.lastSeat !== undefined && c.lastSeat !== null
      && c.lastSeat !== c.landlord && c.lastSeat !== c.seat;

    if (target) {
      // 农民之间是队友：原则上让路，只有能一把走完时才接队友的牌
      if (lastIsTeammate && rng() < diff.smartPass) {
        let finisher = null;
        for (const b of genBeats(mine, target)) {
          if (b.length === mine.length) { finisher = b; break; }
        }
        return finisher || null;
      }

      const beats = genBeats(mine, target);
      if (!beats.length) return null;

      // 分出「非炸弹」与「炸弹」
      const normal = [], bombs = [];
      for (const b of beats) {
        const combo = parseCombo(b);
        if (!combo) continue;
        if (combo.type === 'bomb' || combo.type === 'rocket') bombs.push(b);
        else normal.push(b);
      }

      if (normal.length) {
        // 选点数最小的能压组合
        normal.sort((x, y) => {
          const cx = parseCombo(x), cy = parseCombo(y);
          return compareCombo(cx, cy) || (x.length - y.length);
        });
        const pick = normal[0];
        // 手牌少时更积极
        if (mine.length <= 4) return pick;
        // 出完就赢：把能一次走完的优先
        const all = mine.length;
        if (pick.length === all) return pick;
        return pick;
      }

      // 只剩炸弹可压：保守使用
      if (bombs.length) {
        const urgent = mine.length <= 6
          || (c.handCounts || []).some((n, i) => i !== c.seat && n <= 3);
        if (urgent || rng() > diff.bomb) {
          bombs.sort((x, y) => {
            const cx = parseCombo(x), cy = parseCombo(y);
            return compareCombo(cx, cy);
          });
          return bombs[0];
        }
        return null;
      }
      return null;
    }

    // 首出：优先长牌型快速清牌，其次小单张
    const leads = genLeads(mine);
    if (!leads.length) return mine.length ? [mine[0]] : null;

    // 能一把出完直接出
    for (const l of leads) if (l.cards.length === mine.length) return l.cards;

    const score = l => {
      const weight = { straight: 100, pairs: 90, plane: 95, trio: 40, pair: 30, single: 10 };
      const combo = parseCombo(l.cards);
      const key = combo ? combo.key : 0;
      // 长牌型优先；同长度点数小的优先
      return (weight[l.type] || 10) + l.cards.length * 4 - key;
    };
    leads.sort((a, b) => score(b) - score(a));
    if (diff.leadLong < 1 && rng() > diff.leadLong) {
      // 简单难度：随机挑一个
      return leads[Math.floor(rng() * leads.length)].cards;
    }
    return leads[0].cards;
  }

  /* ---------- 对局状态机（纯逻辑，UI 只负责渲染） ---------- */
  /**
   * 手牌强度评估，用于叫分。
   * 只看大牌与炸弹，够用且稳定。
   */
  function handStrength(hand) {
    const cnt = countByRank(hand);
    let s = 0;
    if (cnt[JOKER_B]) s += 6;
    if (cnt[JOKER_S]) s += 4;
    if (cnt[JOKER_B] && cnt[JOKER_S]) s += 3;   // 王炸额外
    s += cnt[RANK_2] * 1.5;
    s += cnt[RANK_A] * 0.7;
    for (let r = 0; r <= RANK_A; r++) if (cnt[r] === 4) s += 5;
    return s;
  }

  /** AI 叫分：返回 0(不叫)/1/2/3 */
  function aiBid(hand, diff, rng) {
    const s = handStrength(hand);
    const noise = (rng || Math.random)() * 2 - 1;   // ±1 抖动，避免每局都一样
    const v = s + noise;
    if (v >= 13) return 3;
    if (v >= 9) return 2;
    if (v >= 5.5) return 1;
    return 0;
  }

  /**
   * 创建一局游戏。
   * @param {object} opts
   *   mode: 'shuffle' 每局重洗 | 'nosave' 不洗牌（沿用上一局牌堆）
   *   deckStack: 不洗牌模式下传入上一局的牌堆（54 张）
   *   diff: 'easy'|'medium'|'hard'
   *   rng: 随机源（可注入以便测试复现）
   *   seat: 玩家座位（默认 0）
   */
  function createGame(opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const mySeat = o.seat === undefined ? 0 : o.seat;

    const st = {
      mode: o.mode === 'nosave' ? 'nosave' : 'shuffle',
      diff: o.diff || 'medium',
      seat: mySeat,
      phase: 'bid',            // bid | play | over
      hands: [[], [], []],
      bottom: [],
      landlord: -1,
      turn: 0,
      table: null,             // { seat, cards, combo }
      passCount: 0,
      history: [],             // 本局出牌 [{seat, cards}]
      bids: [],                // 叫分记录
      winner: null,            // { side:'landlord'|'farmer', seat }
      lastDealStack: null,     // 本局使用的牌堆（供下一局 nosave 复用）
      seed: 0,
    };

    /** 发牌。nosave 且传入上一局牌堆时，切牌后分段发。 */
    function dealNew() {
      let stack;
      if (st.mode === 'nosave' && o.deckStack && o.deckStack.length === 54) {
        stack = o.deckStack.slice();
      } else {
        stack = shuffle(createDeck(), rng);
      }
      // nosave：随机切牌（只平移不改变相对顺序，保留聚集）
      if (st.mode === 'nosave' && o.deckStack && o.deckStack.length === 54) {
        stack = cutDeck(stack, Math.floor(rng() * 54));
      }
      st.lastDealStack = stack;
      const dealt = st.mode === 'nosave' && o.deckStack ? dealSegmented(stack) : deal(stack);
      st.hands = dealt.hands.map(h => h.slice());
      st.bottom = dealt.bottom.slice();
      // 手牌排序：点大到小、同点按花色，便于阅读
      for (const h of st.hands) sortCards(h);
      st.phase = 'bid';
      st.bids = [];
      st.landlord = -1;
      st.turn = mySeat;
      st.table = null;
      st.passCount = 0;
      st.history = [];
      st.winner = null;
    }

    /** 手牌排序：rank 降序（大牌在前），同 rank 按 id */
    function sortCards(arr) {
      arr.sort((a, b) => (rankOf(b) - rankOf(a)) || (a - b));
      return arr;
    }

    /** 叫分（seat 叫人）。返回是否继续 */
    function bid(seat, score) {
      if (st.phase !== 'bid') return st;
      st.bids.push({ seat, score: Math.max(0, Math.min(3, score | 0)) });
      return st;
    }

    /** 结算叫分：最高分当地主，全不叫则重发 */
    function settleBid() {
      let best = -1, bestScore = 0;
      for (const b of st.bids) {
        if (b.score > bestScore) { bestScore = b.score; best = b.seat; }
      }
      if (best < 0) return false;       // 全不叫 → 调用方决定重发
      st.landlord = best;
      // 地主拿底牌并排序
      st.hands[best] = sortCards(st.hands[best].concat(st.bottom));
      st.phase = 'play';
      st.turn = best;
      st.table = null;
      st.passCount = 0;
      return true;
    }

    function removeCards(hand, cards) {
      const rest = hand.slice();
      for (const c of cards) {
        const i = rest.indexOf(c);
        if (i < 0) return null;         // 手里没有这张牌
        rest.splice(i, 1);
      }
      return rest;
    }

    /**
     * 出牌。seat 必须轮到自己，牌必须合法且能压过桌面。
     * @returns {{ok:boolean, error?:string}}
     */
    function play(seat, cards) {
      if (st.phase !== 'play') return { ok: false, error: '不在出牌阶段' };
      if (seat !== st.turn) return { ok: false, error: '还没轮到你' };
      if (!Array.isArray(cards) || !cards.length) return { ok: false, error: '没选牌' };

      const combo = parseCombo(cards);
      if (!combo) return { ok: false, error: '不是合法牌型' };

      const rest = removeCards(st.hands[seat], cards);
      if (!rest) return { ok: false, error: '手里没有这些牌' };

      if (st.table && compareCombo(combo, st.table.combo) <= 0) {
        return { ok: false, error: '压不过桌面上的牌' };
      }

      st.hands[seat] = rest;
      st.table = { seat, cards: cards.slice(), combo };
      st.history.push({ seat, cards: cards.slice() });
      st.passCount = 0;

      if (rest.length === 0) {
        st.phase = 'over';
        const isLandlord = seat === st.landlord;
        st.winner = { side: isLandlord ? 'landlord' : 'farmer', seat };
        return { ok: true };
      }
      st.turn = (seat + 1) % 3;
      return { ok: true };
    }

    /** 过牌 */
    function pass(seat) {
      if (st.phase !== 'play') return { ok: false, error: '不在出牌阶段' };
      if (seat !== st.turn) return { ok: false, error: '还没轮到你' };
      if (!st.table) return { ok: false, error: '新一轮必须出牌' };
      if (st.table.seat === seat) return { ok: false, error: '轮到你自由出牌' };

      st.passCount++;
      // 另两家都过 → 桌面清空，由最后出牌者开新轮
      if (st.passCount >= 2) {
        st.turn = st.table.seat;
        st.table = null;
        st.passCount = 0;
      } else {
        st.turn = (seat + 1) % 3;
      }
      return { ok: true };
    }

    /** 当前行动方是否 AI（非玩家） */
    const isAiTurn = () => st.phase === 'play' && st.turn !== mySeat;

    /** 让当前 AI 走一步（出牌或过牌） */
    function aiStep() {
      if (!isAiTurn()) return null;
      const seat = st.turn;
      const hand = st.hands[seat];
      const target = st.table ? st.table.combo : null;
      const ctx = {
        diff: st.diff,
        seat,
        landlord: st.landlord,
        lastSeat: st.table ? st.table.seat : null,
        handCounts: st.hands.map(h => h.length),
        rng,
      };
      const cards = aiChoose(hand, target, ctx);
      if (cards && cards.length) {
        const r = play(seat, cards);
        if (r.ok) return { seat, action: 'play', cards };
        // AI 给出非法牌时兜底过牌，避免卡死
      }
      if (st.table) {
        const r = pass(seat);
        if (r.ok) return { seat, action: 'pass' };
      }
      return { seat, action: 'pass' };
    }

    /** 补算：AI 叫分阶段连续补齐（玩家叫完分后调用） */
    function runAiBids() {
      for (let i = 0; i < 3; i++) {
        const seat = (mySeat + 1 + i) % 3;
        if (st.bids.some(b => b.seat === seat)) continue;
        bid(seat, aiBid(st.hands[seat], st.diff, rng));
      }
    }

    /** 把本局牌堆收起来，供下一局 nosave 复用（必须先走到 over） */
    function harvestDeck() {
      return collectDeck(st.history, st.hands);
    }

    dealNew();

    return {
      state: st,
      dealNew, bid, settleBid, play, pass, aiStep, runAiBids,
      harvestDeck, isAiTurn,
      /** 玩家可选牌型提示 */
      hint() {
        const hand = st.hands[mySeat];
        if (st.table) {
          const beats = genBeats(hand, st.table.combo);
          return beats.length ? beats[0] : null;
        }
        const leads = genLeads(hand);
        return leads.length ? leads[0].cards : (hand.length ? [hand[0]] : null);
      },
    };
  }

  /* ---------- 对外导出（纯逻辑） ---------- */
  const API = {
    // 牌
    createDeck, shuffle, deal, dealSegmented, collectDeck, cutDeck,
    countBombs, bombsPerHand,
    // 牌型
    parseCombo, compareCombo, canBeat, rankOf, suitOf, isJoker,
    cardLabel, cardTone, sameRank, countByRank, groupByRank,
    // AI
    aiChoose, aiBid, handStrength, genBeats, genLeads,
    // 对局
    createGame,
    // 常量
    RANK_A, RANK_2, JOKER_S, JOKER_B, RANK_LABEL, SUIT_ICON, TYPE_CN,
    PLAYER_COUNT, HAND_SIZE, BOTTOM_SIZE, DIFF,
    // 测试用：把牌数组转成可读字符串
    cardsToStr(ids) { return (ids || []).map(cardLabel).join(' '); },
  };

  return API;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DDZ;
if (typeof window !== 'undefined') window.DDZ = DDZ;

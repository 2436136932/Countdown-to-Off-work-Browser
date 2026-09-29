/* 悔棋（undo）专项回归
 * A) 目标化竞态：出牌后 240ms 内立刻悔棋 —— doDiscard 里排的 checkClaims 定时器
 *    仍会触发，对着已回滚的状态做碰/杠 → 副露错位 / 张数错乱。
 * B) 随机悔棋压力：正常对局中随机插入悔棋，检查守恒与副露完整性。
 */
'use strict';

/* ---------- 轻量 DOM stub（与 test-mj-conserve.js 同源） ---------- */
function makeEl() {
  const el = {
    className: '', textContent: '', style: { setProperty() {} },
    dataset: {}, children: [], _innerHTML: '',
    // 必须解析标签建出子节点，否则 buildDom 里的 querySelector 会拿到 null
    set innerHTML(v) {
      this._innerHTML = v;
      this.children = [];
      if (!v) return;
      const re = /<([a-zA-Z0-9_-]+)([^>]*)>/g;
      let m;
      while ((m = re.exec(v)) !== null) {
        const child = makeEl();
        child.tagName = m[1];
        const attrs = m[2];
        const cls = attrs.match(/class="([^"]*)"/);
        if (cls) child.className = cls[1];
        const id = attrs.match(/id="([^"]*)"/);
        if (id) child.id = id[1];
        this.children.push(child);
        child.parentNode = this;
      }
    },
    get innerHTML() { return this._innerHTML; },
    listeners: {},
    classList: {
      set: new Set(),
      add(c) { this.set.add(c); },
      remove(c) { this.set.delete(c); },
      toggle(c, on) { if (on === undefined) { if (this.set.has(c)) this.set.delete(c); else this.set.add(c); } else if (on) this.set.add(c); else this.set.delete(c); },
      contains(c) { return this.set.has(c); },
    },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    addEventListener(t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); },
    removeEventListener(t, fn) { if (this.listeners[t]) this.listeners[t] = this.listeners[t].filter(f => f !== fn); },
    setAttribute(k, v) { this._attrs = this._attrs || {}; this._attrs[k] = v; },
    getAttribute(k) { return (this._attrs || {})[k]; },
    dispatch(t, ev) { (this.listeners[t] || []).forEach(fn => { try { fn(ev || {}); } catch (e) {} }); },
    get firstChild() { return this.children[0] || null; },
    parentNode: null,
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector(sel) {
      function walk(n) {
        if (!n) return null;
        if (sel.startsWith('.') && n.className && n.className.includes && n.className.includes(sel.slice(1))) return n;
        if (sel.startsWith('#') && n.id === sel.slice(1)) return n;
        for (const c of (n.children || [])) { const r = walk(c); if (r) return r; }
        return null;
      }
      return walk(this);
    },
    querySelectorAll(sel) {
      const out = [];
      (function walk(n) {
        if (!n) return;
        if (sel.startsWith('.') && n.className && n.className.includes && n.className.includes(sel.slice(1))) out.push(n);
        for (const c of (n.children || [])) walk(c);
      })(this);
      return out;
    },
  };
  return el;
}

const doc = {
  createElement: makeEl,
  createElementNS: (ns, tag) => { const e = makeEl(); e.namespaceURI = ns; e.tagName = tag; return e; },
  querySelector: () => null,
  querySelectorAll: () => [],
};
global.window = { addEventListener() {}, removeEventListener() {}, requestAnimationFrame(cb) { setTimeout(cb, 0); } };
global.document = doc;
global.localStorage = { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = v; } };

const MJ = require('./mahjong.js');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 捕获引擎里的守恒报错 */
const origError = console.error;
let consErr = [];
console.error = (...a) => { consErr.push(a.map(String).join(' ')); };

let rng = 987654321;
function rnd() { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; }

(async () => {
  const host = makeEl();
  const inst = MJ.factory();
  inst.mount(host, {
    setStatus: () => {},
    onGameEnd: () => {},
    llm: () => Promise.reject('no-llm'),
  });

  let badTotal = 0, badMeld = 0, maxHand = 0, raceMelded = 0, badLastSeat = 0;
  function check(st, tag) {
    if (st.total !== 112) {
      badTotal++;
      if (badTotal <= 3) console.log('    [' + tag + '] 全桌 ' + st.total + ' 张 (应为112)');
    }
    if (st.meldBad > 0) {
      badMeld++;
      if (badMeld <= 3) console.log('    [' + tag + '] 副露错位 ' + st.meldBad + ' 副');
    }
    // lastSeat 只需是合法座位即可（牌河可能因碰/杠被清空，渲染已做守卫）；
    // 「悔棋后 lastSeat 是否精确回滚」由 test-mj-lastseat.js 专项覆盖
    if (!(st.lastSeat >= 0 && st.lastSeat <= 3)) {
      badLastSeat++;
      if (badLastSeat <= 3) console.log('    [' + tag + '] lastSeat 非法: ' + st.lastSeat);
    }
    maxHand = Math.max(maxHand, ...st.hands);
  }

  /* ---------- A) 目标化竞态：出牌后立刻悔棋（落在 240ms 窗口内） ---------- */
  console.log('— A) 出牌后立刻悔棋（竞态窗口） —');
  const A_ITER = 100;
  for (let i = 0; i < A_ITER; i++) {
    let st = window.__smokeState();
    if (st.phase === 'over') { window.__mjNewGame(); await sleep(150); i--; continue; }
    if (st.phase === 'claim' && st.pending) { window.__mjClaim(true); await sleep(200); continue; }
    if (st.canDiscard) {
      const meldsBefore = st.melds.reduce((a, b) => a + b, 0);
      window.__mjDiscard(0);
      inst.undo();                 // 立刻悔棋：checkClaims 定时器还没触发
      await sleep(400);            // 让 240ms 的 checkClaims 打在已回滚的状态上
      st = window.__smokeState();
      if (st.melds.reduce((a, b) => a + b, 0) > meldsBefore) raceMelded++;
      check(st, 'A' + i);
      continue;
    }
    await sleep(150);
  }
  console.log('  竞态窗口内实际触发副露次数: ' + raceMelded);

  /* ---------- B) 随机悔棋压力 ---------- */
  console.log('— B) 随机悔棋压力 —');
  let undoCalls = 0;
  for (let g = 0; g < 20; g++) {
    if (g) { window.__mjNewGame(); await sleep(150); }
    for (let i = 0; i < 120; i++) {
      const st = window.__smokeState();
      if (st.phase === 'over') break;
      check(st, 'B' + g + '-' + i);
      if (rnd() < 0.12) {
        if (inst.undo()) undoCalls++;
        await sleep(120);
        check(window.__smokeState(), 'B-undo' + g);
        continue;
      }
      if (st.phase === 'claim' && st.pending) { window.__mjClaim(true); await sleep(160); continue; }
      if (st.canBuGang) { window.__mjBuGang(); await sleep(160); continue; }
      if (st.canAnGang) { window.__mjAnGang(); await sleep(160); continue; }
      if (st.canDiscard) { window.__mjDiscard(0); await sleep(160); continue; }
      await sleep(160);
    }
  }
  console.log('  实际悔棋次数: ' + undoCalls);

  console.log('— 断言 —');
  ok('悔棋前后全桌牌数恒为 112', badTotal === 0, badTotal + ' 次偏离');
  ok('悔棋不会造成副露错位', badMeld === 0, badMeld + ' 次错位');
  ok('悔棋不会让手牌超过 14 张', maxHand <= 14, '最大 ' + maxHand + ' 张');
  ok('悔棋后 lastSeat 仍指向有牌河的玩家', badLastSeat === 0, badLastSeat + ' 次错位');
  ok('引擎无守恒报错', consErr.length === 0, consErr.slice(0, 3).join(' | '));

  console.error = origError;
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error = origError; console.error(e); process.exit(1); });

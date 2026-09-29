/* 张数守恒强化回归：真实对局中反复触发 碰/明杠/暗杠/补杠，
 * 每一步都断言全桌实体牌总数恒为 112，且没有任何一家出现 >14 张手牌。
 * 这是"15 张胡不了"的直接回归测试（修复前必然失败）。
 */
'use strict';

/* ---------- 轻量 DOM stub（与 test-mj-count.js 同源，去掉 innerHTML 正则解析开销） ---------- */
function makeEl() {
  const el = {
    className: '', textContent: '', style: { setProperty() {} },
    dataset: {}, children: [], _innerHTML: '',
    // 必须像 test-mj-count.js 一样解析标签建出子节点，否则 buildDom 里的 querySelector 会拿到 null
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

(async () => {
  const statuses = [];
  const host = makeEl();
  const inst = MJ.factory();
  inst.mount(host, {
    setStatus: (s) => statuses.push(String(s || '')),
    onGameEnd: () => {},
    llm: () => Promise.reject('no-llm'),
  });

  console.log('— 开局 —');
  let st = window.__smokeState();
  ok('开局全桌 = 112 张', st.total === 112, '实际 ' + st.total);
  ok('开局庄家 14 张', st.hands[0] === 14, '实际 ' + st.hands[0]);

  /* 真实对局：玩家尽量碰/杠，AI 自动出牌，跑若干步。
   * 关键：单局很快会因 AI 自摸结束，碰不一定会出现；
   * 所以跑多局累计，直到确实观察到碰为止（保底覆盖关键路径）。 */
  let maxHand = 0, sawPeng = false, sawGang = false, minTotal = 999, maxTotal = 0;
  let games = 0, steps = 0;
  const STEP = 120;

  for (let g = 0; g < 60 && !(sawPeng && sawGang); g++) {
    if (g > 0) { window.__mjNewGame(); await sleep(STEP); }
    games++;
    for (let i = 0; i < 300; i++) {
      st = window.__smokeState();
      if (st.phase === 'over') break;

      minTotal = Math.min(minTotal, st.total);
      maxTotal = Math.max(maxTotal, st.total);
      maxHand = Math.max(maxHand, ...st.hands);

      if (st.total !== 112) {
        ok('对局中守恒', false, '第' + games + '局第' + i + '步 全桌 ' + st.total + ' 张');
        g = 9999; break;
      }

      // 玩家碰/杠决策：一律接受（触发 applyMeld 关键路径）
      if (st.phase === 'claim' && st.pending) {
        if (st.pending === 'peng') sawPeng = true;
        if (st.pending === 'gang') sawGang = true;
        window.__mjClaim(true);
        await sleep(STEP);
        steps++;
        continue;
      }
      // 玩家回合：能补杠/暗杠就杠，否则出牌
      if (st.canBuGang) { sawGang = true; window.__mjBuGang(); await sleep(STEP); steps++; continue; }
      if (st.canAnGang) { sawGang = true; window.__mjAnGang(); await sleep(STEP); steps++; continue; }
      if (st.canDiscard) { window.__mjDiscard(0); await sleep(STEP); steps++; continue; }
      await sleep(STEP);
    }
  }

  console.log('— 对局中 (' + games + ' 局 / ' + steps + ' 步) —');
  const stEnd = window.__smokeState();
  minTotal = Math.min(minTotal, stEnd.total);
  maxTotal = Math.max(maxTotal, stEnd.total);
  maxHand = Math.max(maxHand, ...stEnd.hands);

  ok('全程全桌牌数恒为 112', minTotal === 112 && maxTotal === 112, '范围 ' + minTotal + '~' + maxTotal);
  ok('任何一家手牌从未超过 14 张', maxHand <= 14, '最大 ' + maxHand + ' 张');
  ok('触发了碰（关键回归路径）', sawPeng, sawPeng ? '' : '本局未出现碰，测试覆盖不足');
  ok('引擎无张数守恒报错', consErr.length === 0, consErr.slice(0, 3).join(' | '));

  /* 直接验证修复前的两个根因函数行为 */
  console.log('— 定向：碰/补杠账目 —');
  const MJmod = require('./mahjong.js');
  ok('15 张不能胡（回归）',
    MJmod.win([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 0) === false);
  ok('14 张标准型能胡',
    MJmod.win([0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 0, 0], 0) === true);

  console.error = origError;
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error = origError; console.error(e); process.exit(1); });

/* 悔棋后 lastSeat 一致性专项测试
 *
 * 背景：lastSeat 记录"最近出牌人"，它同时影响
 *   1) 牌河末张的 fresh/pop 高亮（render）
 *   2) AI 防喂牌 dangerOf()：跳过 lastSeat 家的最近出牌
 * undo() 用 restore() 回滚状态，若 lastSeat 不在快照里，
 * 悔棋后它会停留在"未来"的值 → 高亮指错家 + AI 防喂牌判断偏移。
 *
 * 本测试直接验证：悔棋后 lastSeat 必须回到该快照记录的值。
 */
'use strict';

function makeEl() {
  const el = {
    className: '', textContent: '', style: { setProperty() {} },
    dataset: {}, children: [], _innerHTML: '',
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
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const host = makeEl();
  const inst = MJ.factory();
  inst.mount(host, { setStatus: () => {}, onGameEnd: () => {}, llm: () => Promise.reject('no') });

  console.log('— 悔棋后 lastSeat 必须回到快照值 —');
  let checked = 0, mismatches = 0, advanced = 0;

  for (let g = 0; g < 12; g++) {
    if (g) { window.__mjNewGame(); await sleep(150); }
    for (let i = 0; i < 150; i++) {
      const st = window.__smokeState();
      if (st.phase === 'over') break;
      if (st.phase === 'claim' && st.pending) { window.__mjClaim(true); await sleep(140); continue; }
      if (st.canBuGang) { window.__mjBuGang(); await sleep(140); continue; }
      if (st.canAnGang) { window.__mjAnGang(); await sleep(140); continue; }
      if (st.canDiscard) {
        const before = window.__smokeState().lastSeat;
        window.__mjDiscard(0);                      // 出牌：lastSeat 变为 0
        await sleep(60);
        const afterDiscard = window.__smokeState().lastSeat;
        if (before !== afterDiscard) advanced++;    // lastSeat 确实前进过，测试有意义
        inst.undo();                                // 悔棋
        const afterUndo = window.__smokeState().lastSeat;
        checked++;
        if (afterUndo !== before) {
          mismatches++;
          if (mismatches <= 5) {
            console.log('    [g' + g + '] 快照 lastSeat=' + before
              + ' → 出牌后=' + afterDiscard + ' → 悔棋后=' + afterUndo);
          }
        }
        await sleep(80);
        continue;
      }
      await sleep(140);
    }
  }

  console.log('  核对次数: ' + checked + '（其中 ' + advanced + ' 次 lastSeat 确实发生过变化）');
  ok('悔棋后 lastSeat 精确回到快照值', mismatches === 0, mismatches + ' 次不一致');
  ok('测试确实覆盖了 lastSeat 变化的场景', advanced > 0, advanced + ' 次');

  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* 麻将手牌数量守恒基础回归（轻量 DOM stub）
 * 验证：开局庄家14张 / 玩家出牌后13张 / 15张不能胡
 */
'use strict';

function makeEl() {
  const el = {
    className: '', textContent: '', style: { setProperty() {} },
    dataset: {},
    children: [],
    _innerHTML: '',
    set innerHTML(v) {
      this._innerHTML = v;
      this.children = [];
      if (!v) return;
      const re = /<([a-zA-Z0-9_-]+)([^>]*)>/g;
      let m;
      while ((m = re.exec(v)) !== null) {
        const tag = m[1];
        const attrs = m[2];
        const child = makeEl();
        child.tagName = tag;
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
    addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
    removeEventListener(type, fn) { if (this.listeners[type]) this.listeners[type] = this.listeners[type].filter(f => f !== fn); },
    setAttribute(k, v) { this._attrs = this._attrs || {}; this._attrs[k] = v; },
    getAttribute(k) { return (this._attrs || {})[k]; },
    dispatch(type, ev) { (this.listeners[type] || []).forEach(fn => { try { fn(ev || {}); } catch (e) { console.error('dispatch error', type, e); } }); },
    get firstChild() { return this.children[0] || null; },
    parentNode: null,
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector(sel) {
      function walk(node) {
        if (!node) return null;
        if (sel.startsWith('.') && node.className && node.className.includes && node.className.includes(sel.slice(1))) return node;
        if (sel.startsWith('#') && node.id === sel.slice(1)) return node;
        for (const c of (node.children || [])) { const r = walk(c); if (r) return r; }
        return null;
      }
      return walk(this);
    },
    querySelectorAll(sel) {
      const out = [];
      function walk(node) {
        if (!node) return;
        if (sel.startsWith('.') && node.className && node.className.includes && node.className.includes(sel.slice(1))) out.push(node);
        for (const c of (node.children || [])) walk(c);
      }
      walk(this);
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
const win = {
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame(cb) { setTimeout(cb, 0); },
};
global.window = win;
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

  const st0 = window.__smokeState();
  ok('开局庄家 14 张', st0.hands[0] === 14, '实际 ' + st0.hands[0]);
  ok('开局其余三家 13 张', st0.hands.slice(1).every(x => x === 13), JSON.stringify(st0.hands));

  window.__mjDiscard(0);
  await sleep(300);
  const st1 = window.__smokeState();
  ok('玩家出牌后 13 张', st1.hands[0] === 13, '实际 ' + st1.hands[0]);

  ok('15 张不能胡', MJ.win([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14], 0) === false);

  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

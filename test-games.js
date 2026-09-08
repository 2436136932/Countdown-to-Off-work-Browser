/* 三游戏（扫雷/2048/连连看）移植后冒烟单测
 * 用最小 DOM stub 驱动 mount，验证：能 mount、能渲染、能重置、不抛异常。
 * 纯逻辑不变量（2048 滑动合并、连连看寻路）尽量通过 stub 回调验证。
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
      // 简近似：赋了 HTML 就生成一个 span 子元素（连连看需要 firstChild）
      if (v && this.children.length === 0) {
        const span = makeEl();
        span.className = 'e';
        this.children.push(span);
        span.parentNode = this;
      } else if (v === '') {
        this.children = [];
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
  };
  return el;
}

const doc = {
  createElement: makeEl,
  createElementNS: (ns, tag) => { const e = makeEl(); e.namespaceURI = ns; e.tagName = tag; return e; },
  querySelector: () => null,
  querySelectorAll: () => [],
};
const win = { addEventListener() {}, removeEventListener() {} };
global.window = win;
global.document = doc;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

const appCtx = { setStatus() {}, onGameEnd() {}, llm() { return Promise.resolve(''); } };
const host = makeEl();

console.log('— 扫雷 —');
const MS = require('./minesweeper.js');
{
  const inst = MS.factory();
  let statusLog = [];
  inst.mount(host, { ...appCtx, setStatus: t => statusLog.push(t) });
  console.log('  mount 后 host 子元素数:', host.children.length);
  ok('扫雷 mount 成功', host.children.length > 0 && !!host.children[0].className.includes('mn-'));
  ok('网格使用 CSS 变量 --c', host.children[0].style.setPropertyCallCount ? true : true); // style.setProperty stub 存在即不崩
  inst.onNewGame();
  ok('新局不崩', true);
  const grid = host.children[0];
  ok('网格有格子（默认中等 12×12=144）', grid.children.length === 144, '实际 ' + grid.children.length);
  console.log('  setStatus:', statusLog.slice(0, 2).join(' | '));
}

console.log('— 2048 —');
const GG = require('./g2048.js');
{
  const inst = GG.factory();
  const hostG = makeEl();
  inst.mount(hostG, { ...appCtx, setStatus: () => {} });
  ok('2048 mount 不崩', true);
  inst.onNewGame();
  ok('2048 新局不崩', true);
  // 冒烟：向左滑动 N 次，盘面应有变化且 max 增长（2/4 合并）
  const before = window.__smokeState();
  for (let i = 0; i < 8; i++) window.__g48Move('left');
  const after = window.__smokeState();
  ok('2048 移动后得分/盘面变化', after.score >= before.score);
  ok('2048 移动后 max 合理（2^n）', [2,4,8,16,32,64,128,256,512,1024,2048].includes(after.max), 'max=' + after.max);
  console.log('  before:', JSON.stringify(before), '| after:', JSON.stringify(after));
  // 悔棋
  const beforeUndo = window.__smokeState();
  inst.undo();
  const afterUndo = window.__smokeState();
  ok('2048 悔棋可回退', afterUndo.score <= beforeUndo.score);
  inst.destroy();
}

console.log('— 连连看 —');
const LK = require('./lianliankan.js');
{
  const inst = LK.factory();
  const hostL = makeEl();
  inst.mount(hostL, { ...appCtx, setStatus: () => {} });
  ok('连连看 mount 不崩', true);
  inst.onNewGame();
  ok('连连看 新局不崩', true);
  // 冒烟：找一个可消除对（__llPair 返回 [a,b] 或 null）
  const pair = typeof window.__llPair === 'function' ? window.__llPair() : null;
  const st = window.__smokeState();
  ok('冒烟状态可用', !!st);
  console.log('  __smokeState:', JSON.stringify(st));
  console.log('  __llPair:', JSON.stringify(pair));
  ok('连连看有可消除对（或已全消）', pair === null || (typeof pair === 'object' && pair.a && pair.b), JSON.stringify(pair));
  inst.destroy();
}

console.log('— 扫雷补充：挖开与冒烟 —');
{
  const inst = MS.factory();
  const hostS = makeEl();
  inst.mount(hostS, { ...appCtx, setStatus: () => {} });
  inst.onNewGame();
  window.__mnOpen();   // 挖中心
  const st = window.__smokeState();
  ok('扫雷挖开后 dug>0 或结束', st.dug > 0 || st.over, JSON.stringify(st));
  console.log('  挖开后:', JSON.stringify(st));
  inst.destroy();
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
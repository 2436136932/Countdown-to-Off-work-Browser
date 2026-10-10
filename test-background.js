/* ============================================================
 * background.js 回归测试：提醒调度 / 消息路由 / 节假日缓存落盘
 *
 * 覆盖三个曾经真实失效的点：
 *  1. 'notify' alarm 从未创建 → 下班提醒几乎永不触发
 *  2. 设置页发 { action:'syncHolidays' }，background 只认 { type:'sync-holidays' } → 按钮失败
 *  3. 缓存只写元数据、不写 days → SW 休眠后联网数据丢失、设置页显示 0 处放假/调休
 *
 * 做法：用内存版 chrome API 桩加载真实的 background.js，走真实的 core.js 同步链路
 * （fetch 也被桩成返回 holiday-cn 格式数据）。
 * ============================================================ */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (desc, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log('FAIL', desc, '->', JSON.stringify(got), 'want', JSON.stringify(want));
};
const ok = (desc, cond) => t(desc, !!cond, true);

/* ---------- chrome API 桩 ---------- */
function makeChrome() {
  const store = { sync: {}, local: {} };
  const alarms = [];
  const notifications = [];
  const L = { onAlarm: [], onMessage: [], onInstalled: [], onStartup: [], onCommand: [], onChanged: [] };
  const chrome = {
    alarms: {
      create: (name, opts) => alarms.push({ name, opts }),
      onAlarm: { addListener: fn => L.onAlarm.push(fn) },
    },
    runtime: {
      id: 'test-extension',
      lastError: null,
      onMessage: { addListener: fn => L.onMessage.push(fn) },
      onInstalled: { addListener: fn => L.onInstalled.push(fn) },
      onStartup: { addListener: fn => L.onStartup.push(fn) },
      sendMessage: () => {},
    },
    storage: {
      sync: {
        get: async (d) => (d && typeof d === 'object' ? { ...d, ...store.sync } : { ...store.sync }),
        set: async (o) => Object.assign(store.sync, o),
      },
      local: {
        get: async (k) => (typeof k === 'string' ? { [k]: store.local[k] } : { ...k, ...store.local }),
        set: async (o) => Object.assign(store.local, o),
      },
      onChanged: { addListener: fn => L.onChanged.push(fn) },
    },
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
    },
    notifications: { create: o => notifications.push(o) },
    commands: { onCommand: { addListener: fn => L.onCommand.push(fn) } },
    tabs: { query: async () => [], sendMessage: async () => {} },
    scripting: { executeScript: async () => {} },
  };
  return { chrome, store, alarms, notifications, L };
}

const env = makeChrome();
global.chrome = env.chrome;

/* ---------- fetch 桩：返回 holiday-cn 格式数据 ---------- */
const fetchedYears = [];
global.fetch = async (url) => {
  const m = String(url).match(/(\d{4})\.json$/);
  const year = m ? Number(m[1]) : new Date().getFullYear();
  fetchedYears.push(year);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      year,
      days: [
        { date: `${year}-01-01`, name: '元旦', isOffDay: true },
        { date: `${year}-01-02`, name: '元旦', isOffDay: true },
        { date: `${year}-01-04`, name: '元旦调休', isOffDay: false },
      ],
    }),
  };
};

/* ---------- 加载 core.js / theme.js / background.js ---------- */
const CORE = new Function(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8') + '; return CORE;')();
const THEME = new Function(fs.readFileSync(path.join(__dirname, 'theme.js'), 'utf8') + '; return THEME;')();
global.CORE = CORE;
global.THEME = THEME;

new Function(fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8'))();

/* ---------- 断言 ---------- */
(async () => {
  await new Promise(r => setTimeout(r, 60));   // 等 background 顶部异步 IIFE 落定

  // 1. 提醒调度：notify alarm 必须被创建（此前完全没有）
  const notify = env.alarms.find(a => a.name === 'notify');
  ok('notify alarm 已注册', notify);
  t('notify 周期为 1 分钟', notify && notify.opts.periodInMinutes, 1);
  ok('badge alarm 仍然存在', env.alarms.some(a => a.name === 'badge'));
  ok('节假日同步 alarm 仍然存在', env.alarms.some(a => a.name === 'holiday-sync'));

  // 2. 消息路由：设置页历史上发的是 action 字段
  const send = (msg) => new Promise(resolve => {
    const kept = env.L.onMessage.some(fn => fn(msg, {}, resolve));
    if (!kept) resolve(null);
  });

  const r1 = await send({ action: 'syncHolidays' });
  ok('action:syncHolidays 有响应', r1);
  ok('action:syncHolidays 返回成功年份数', r1 && r1.ok > 0);
  t('同步了当年与下一年', fetchedYears.length >= 2, true);

  const r2 = await send({ type: 'sync-holidays' });
  ok('type:sync-holidays 兼容保留', r2 && r2.ok > 0);

  // 3. 缓存落盘：必须带上 days 数据，否则 SW 休眠后全部丢失
  const cache = env.store.local.holidayCache;
  ok('holidayCache 已写入', cache);
  ok('缓存含多年 years[]', Array.isArray(cache.years) && cache.years.length >= 2);
  ok('缓存含实际 days 数据', cache.years.every(j => Array.isArray(j.days) && j.days.length > 0));
  t('缓存 totalDays 正确', cache.totalDays, cache.years.reduce((n, j) => n + j.days.length, 0));
  ok('兼容字段 json 同时存在', !!(cache.json && cache.json.days));
  ok('fetchedAt 已记录', typeof cache.fetchedAt === 'number');

  // 4. 冷启动能读回缓存（applyCachedDays 走 years[] 结构；重建是懒执行的）
  const coreFresh = new Function(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8') + '; return CORE;')();
  const before = coreFresh.mapBuildCount();
  coreFresh.applyCachedDays(cache);
  t('applyCachedDays 本身不立即重建（懒）', coreFresh.mapBuildCount() - before, 0);
  t('读回后元旦仍为假日', coreFresh.getDayInfo(new Date(Number(cache.years[0].year), 0, 1)).kind, 'holiday');
  t('读回后调休仍为补班', coreFresh.getDayInfo(new Date(Number(cache.years[0].year), 0, 4)).kind, 'makeup');
  t('首次查询触发一次重建', coreFresh.mapBuildCount() - before, 1);

  // 5. 查询表缓存：反复 snapshot 不应反复重建
  //（旧实现的条件是 `_holidayMap && !_extraDays`，联网数据到位后每次调用都全量重建）
  const base = coreFresh.mapBuildCount();
  const cfg = { ...coreFresh.DEFAULTS };
  for (let i = 0; i < 50; i++) coreFresh.snapshot(new Date(2026, 7, 27, 13, 30), cfg);
  t('50 次 snapshot 不重复重建查询表', coreFresh.mapBuildCount() - base, 0);

  // 6. 提醒实际能发出来（仅在今天是工作日时校验，避免周末跑测失败）
  const today = new Date();
  const worksToday = ['workday', 'makeup'].includes(CORE.getDayInfo(today).kind);
  if (worksToday) {
    // 把下班时间设成 30 分钟后，命中 notifyBeforeOff 分支
    const target = new Date(today.getTime() + 30 * 60000);
    const hm = String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
    env.store.sync = { end: hm, notifyBeforeOff: true, notifyAtOff: true, showBadge: true, focusEnabled: false };
    const n0 = env.notifications.length;
    for (const fn of env.L.onAlarm) await fn({ name: 'notify' });
    const added = env.notifications.slice(n0);
    ok('notify alarm 触发后发出提醒', added.length > 0);
    if (added.length) t('提前 30 分钟提醒文案', added[0].title, '还有 30 分钟下班');
  } else {
    console.log('SKIP 提醒实发校验（今天非工作日）');
  }

  console.log(fail === 0 ? ('ALL PASS: ' + pass + ' assertions') : ('FAILED: ' + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
/* ============================================================
 * Offwork Countdown — 共享核心逻辑 v3
 * 纯函数、无依赖。popup / options / welcome / background 共用。
 *
 * v2: 官方放假 + 调休补班；getDayInfo / monthMatrix / badgeText。
 * v3: 月薪模式（按当月应上班天数折算日薪，支持试用期折扣）、
 *     自定义倒数日 events、今日进度 progress、卡片自定义 cards。
 * ============================================================ */

const CORE = (() => {

  /* ---------- 默认配置 ---------- */
  const DEFAULTS = {
    workdays: [1, 2, 3, 4, 5],   // 0=周日 … 6=周六
    start: '09:00',
    end: '18:00',
    payday: 15,                  // 每月发薪日
    incomeMode: 'daily',         // daily | monthly
    dailyIncome: 300,            // 日薪模式：每天收入（元）
    monthlySalary: 6500,         // 月薪模式：税前月薪（元）
    probation: false,            // 试用期 8 折
    showIncome: true,            // 「今天赚了」统计位开关
    showBadge: true,             // 工具栏图标角标
    notifyBeforeOff: true,       // 下班前 30 分钟提醒
    notifyAtOff: true,           // 到点下班提醒
    focusEnabled: false,         // 专注模式：勿扰时段开关
    focusStart: '12:00',         // 勿扰时段开始
    focusEnd: '14:00',           // 勿扰时段结束
    showWeek: true,              // 「本周剩余」横幅开关
    petEnabled: false,           // 摸鱼电子宠物开关
    llmUrl: '',                  // 大模型 API Base URL（OpenAI 兼容，如 https://api.deepseek.com/v1）
    llmKey: '',                  // API Key
    llmModel: '',                // 模型名（留空则自动获取第一个可用模型）
    llmTemperature: 0.9,         // 吐槽创造性温度 (0~1.5)
    petPrompt: '',               // 人设提示词（作为 system 消息发送；留空 = 不加任何系统提示，裸调模型）
    llmMaxTokens: 200,           // 单次回复最大输出 token（支持长对话）
    llmThinking: false,          // 思考模式：开启后模型先推理再回答（更聪明但更慢）
    theme: 'light',              // light | dark | auto（跟随系统）
    skin: 'pro',                 // pro | alpine | sierra | midnight | amber | lilac | sakura | paper
    texture: 'none',             // none | dots | noise
    glassOpacity: 65,            // 卡片毛玻璃不透明度 (10~100，默认 65，透出精美背景)
    glassColor: '',              // 自定义玻璃底色（hex，如 #a7c7ff）；留空 = 跟随主题白/黑，纯透明玻璃
    cards: ['payday', 'friday', 'holiday', 'income'],  // 显示顺序（income 受 showIncome 二次控制）
    events: [],                  // 自定义倒数日 [{name, date:'YYYY-MM-DD', repeatYearly?}]
    eventSlot: 'holiday',        // 第几张卡被倒数日替换（找不到该卡则追加在末尾）：'none'|卡片key
  };

  const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ============================================================
   * 官方节假日数据（国办发明电〔2025〕7号，2025-11-04 发布）
   * ============================================================ */
  const HOLIDAY_RANGES = {
    2026: [
      { name: '元旦',   from: [1, 1],   to: [1, 3] },
      { name: '春节',   from: [2, 15],  to: [2, 23] },
      { name: '清明节', from: [4, 4],   to: [4, 6] },
      { name: '劳动节', from: [5, 1],   to: [5, 5] },
      { name: '端午节', from: [6, 19],  to: [6, 21] },
      { name: '中秋节', from: [9, 25],  to: [9, 27] },
      { name: '国庆节', from: [10, 1],  to: [10, 7] },
    ],
  };

  /** 调休补班日（周末但需要上班的日子） */
  const MAKEUP_WORKDAYS = {
    2026: [
      { m: 1,  d: 4,  name: '元旦调休' },
      { m: 2,  d: 14, name: '春节调休' },
      { m: 2,  d: 28, name: '春节调休' },
      { m: 5,  d: 9,  name: '劳动节调休' },
      { m: 9,  d: 20, name: '国庆节调休' },
      { m: 10, d: 10, name: '国庆节调休' },
    ],
  };

  /* ---------- 预建查询表（懒加载缓存） ---------- */
  const _key = (y, m, d) => `${y}-${m}-${d}`;
  let _holidayMap = null;   // key -> 名称
  let _makeupMap = null;    // key -> 名称
  let _extraDays = null;    // 远程合并数据（holiday-cn 格式 days[]），null = 未加载

  function buildMaps() {
    if (_holidayMap && !_extraDays) return;
    _holidayMap = {}; _makeupMap = {};
    for (const [year, ranges] of Object.entries(HOLIDAY_RANGES)) {
      for (const r of ranges) {
        let cur = new Date(+year, r.from[0] - 1, r.from[1]);
        const end = new Date(+year, r.to[0] - 1, r.to[1]);
        while (cur <= end) {
          _holidayMap[_key(cur.getFullYear(), cur.getMonth() + 1, cur.getDate())] = r.name;
          cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
        }
      }
    }
    for (const [year, list] of Object.entries(MAKEUP_WORKDAYS)) {
      for (const it of list) _makeupMap[_key(+year, it.m, it.d)] = it.name;
    }
    // 远程数据优先级最高：覆盖内置表（官方最新公告为准）
    if (_extraDays && Array.isArray(_extraDays.days)) {
      for (const it of _extraDays.days) {
        const [y, m, d] = it.date.split('-').map(Number);
        const k = _key(y, m, d);
        if (it.isOffDay) { delete _makeupMap[k]; _holidayMap[k] = it.name; }
        else { delete _holidayMap[k]; _makeupMap[k] = it.name + '调休'; }
      }
    }
  }

  /* ---------- 节假日数据：联网更新（holiday-cn） ---------- */
  const REMOTE_URLS = [
    'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/',       // jsDelivr，国内可直连
    'https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/',    // 备用 CDN
    'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/', // 源站兜底
  ];

  /**
   * 拉取指定年份的节假日 JSON 并合并进查询表。
   * @returns {{ok:boolean, year?:number, count?:number, error?:string}}
   */
  async function syncHolidays(year) {
    const y = year || new Date().getFullYear();
    let lastErr = 'unknown';
    for (const base of REMOTE_URLS) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 8000);
        const res = await fetch(base + y + '.json', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(timer);
        if (!res.ok) { lastErr = 'HTTP ' + res.status; continue; }
        const json = await res.json();
        if (!json || !Array.isArray(json.days) || json.year !== y) {
          lastErr = '数据格式异常'; continue;
        }
        // 关键：官方未发布该年安排时 days 为空数组——视为「暂无数据」，
        // 不能用它覆盖缓存（否则会把已有数据清掉）。
        if (json.days.length === 0) {
          lastErr = `${y} 年官方安排尚未发布`;
          continue;
        }
        _extraDays = json;
        // 立即重建查询表使远程数据生效
        _holidayMap = null;
        buildMaps();
        return { ok: true, year: json.year, count: json.days.length };
      } catch (e) { lastErr = e.name === 'AbortError' ? '请求超时' : String(e.message || e); }
    }
    return { ok: false, error: lastErr };
  }

  /** 应用本地缓存的远程数据（chrome.storage.local.holidayCache） */
  function applyCachedDays(cached) {
    const json = cached?.json?.days?.length ? cached.json
      : (cached?.days?.length ? cached : null);
    if (json) {
      _extraDays = json;
      _holidayMap = null;   // 强制重建
    }
  }

  /* ---------- 存取 ---------- */
  async function loadConfig() {
    try {
      const data = await chrome.storage.sync.get(DEFAULTS);
      // 关键：过滤掉 null/undefined，避免 storage 缺失字段时覆盖 DEFAULTS（这是数据全 0 的根因）
      const merged = { ...DEFAULTS };
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (v === null || v === undefined) continue;
        // 数组字段必须是数组；字符串不能为空串
        if (Array.isArray(DEFAULTS[k]) && !Array.isArray(v)) continue;
        if (typeof DEFAULTS[k] === 'string' && typeof v === 'string' && v.trim() === '') {
          merged[k] = DEFAULTS[k]; continue;
        }
        merged[k] = v;
      }
      return merged;
    } catch {
      return { ...DEFAULTS };
    }
  }

  async function saveConfig(patch) {
    await chrome.storage.sync.set(patch);
  }

  /* ---------- 工具 ---------- */
  const pad = n => String(n).padStart(2, '0');

  function parseHM(str) {
    const [h, m] = String(str).split(':').map(Number);
    return { h: h || 0, m: m || 0 };
  }

  function atTime(base, hm) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hm.h, hm.m, 0, 0);
  }

  /**
   * 当前时刻是否处于「专注模式」勿扰时段内。
   * 支持跨午夜时段（如 22:00 → 06:00）。
   */
  function inFocusTime(now = new Date(), cfg) {
    const c = cfg || DEFAULTS;
    if (!c.focusEnabled) return false;
    const { h: sh, m: sm } = parseHM(c.focusStart || '12:00');
    const { h: eh, m: em } = parseHM(c.focusEnd || '14:00');
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const curMin = now.getHours() * 60 + now.getMinutes();
    if (startMin === endMin) return true;             // 首尾相同 → 全天勿扰
    if (startMin < endMin) return curMin >= startMin && curMin < endMin;
    return curMin >= startMin || curMin < endMin;     // 跨午夜
  }

  /**
   * 某天是什么日子。
   * @returns {{kind:'holiday'|'makeup'|'workday'|'weekend', name?:string}}
   *   holiday — 法定假日（不上班）
   *   makeup  — 调休补班（周末但要上班）
   *   workday — 普通工作日
   *   weekend — 普通周末
   */
  function getDayInfo(date, cfg) {
    buildMaps();
    const k = _key(date.getFullYear(), date.getMonth() + 1, date.getDate());
    if (_holidayMap[k]) return { kind: 'holiday', name: _holidayMap[k] };
    if (_makeupMap[k]) return { kind: 'makeup', name: _makeupMap[k] };
    const workdays = (cfg && Array.isArray(cfg.workdays)) ? cfg.workdays : DEFAULTS.workdays;
    if (workdays.includes(date.getDay())) return { kind: 'workday' };
    return { kind: 'weekend' };
  }

  /** 该日是否上班（工作日或补班日） */
  function isWorkDate(date, cfg) {
    return getDayInfo(date, cfg).kind === 'workday'
      || getDayInfo(date, cfg).kind === 'makeup';
  }

  /* ---------- 节假日查询 ---------- */

  /** 下一个未来的法定假日（含今天）。返回 { date:Date, name:string } 或 null */
  function nextHoliday(now = new Date()) {
    buildMaps();
    const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let i = 0; i < 500; i++) {
      const k = _key(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
      if (_holidayMap[k]) return { date: new Date(cur), name: _holidayMap[k] };
      cur.setDate(cur.getDate() + 1);
    }
    return null;
  }

  /** 今天是否法定假日 */
  function isHolidayToday(now = new Date()) {
    return getDayInfo(now).kind === 'holiday';
  }

  /* ---------- 日历矩阵 ---------- */

  /**
   * 生成某月日历矩阵（周一起始）。
   * @returns Array<Array<{y,m,d,inMonth}>|null> 每周 7 格，周日起始位以 null 补齐前导
   */
  function monthMatrix(year, month) {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // 周一为第一列：getDay() 0=周日 → 前导空格数 = (getDay()+6)%7
    const lead = (first.getDay() + 6) % 7;

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ y: year, m: month + 1, d, inMonth: true });
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  /** 某月的放假 / 补班标注列表 [{d, name, kind}] */
  function monthFestivals(year, month /* 0-based */) {
    buildMaps();
    const out = [];
    for (const [k, name] of Object.entries(_holidayMap)) {
      const [y, m, d] = k.split('-').map(Number);
      if (y === year && m - 1 === month) out.push({ d, name, kind: 'holiday' });
    }
    for (const [k, name] of Object.entries(_makeupMap)) {
      const [y, m, d] = k.split('-').map(Number);
      if (y === year && m - 1 === month) out.push({ d, name, kind: 'makeup' });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /* ---------- 各项统计 ---------- */

  /** 发薪倒计时天数：当月未过发薪日算当月，否则下月 */
  function daysToPayday(now = new Date(), payday = DEFAULTS.payday) {
    const y = now.getFullYear();
    const m = now.getMonth();
    let target = new Date(y, m, payday);
    const todayZero = new Date(y, m, now.getDate());
    if (target < todayZero) target = new Date(y, m + 1, payday);
    return Math.round((target - todayZero) / 86400000);
  }

  /** 距最近周五天数（0~6） */
  function daysToFriday(now = new Date()) {
    return (5 - now.getDay() + 7) % 7;
  }

  /**
   * 本周剩余工作小时数（周一为一周起点）。
   * 只统计「未来」的工作时长：今天未下班的算剩余段，之后的工作日算全天；
   * 法定假日与普通周末不计入。
   */
  function weekHoursRemaining(now = new Date(), cfg) {
    const c = cfg || DEFAULTS;
    const { h: sh, m: sm } = parseHM(c.start || '09:00');
    const { h: eh, m: em } = parseHM(c.end || '18:00');
    const fullDayH = Math.max(0, (eh * 60 + em) - (sh * 60 + sm)) / 60;
    if (!(fullDayH > 0)) return 0;

    const dow = now.getDay();               // 0=周日
    const mondayOffset = (dow + 6) % 7;     // 距本周一的天数
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);

    let total = 0;
    for (let i = 0; i <= 6; i++) {
      const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const info = getDayInfo(day, c);
      const isWork = info.kind === 'workday' || info.kind === 'makeup';
      if (!isWork) continue;

      if (i < mondayOffset) continue;       // 本周已过去的日期
      if (i === mondayOffset) {
        // 今天：按传入时间算剩余
        const startT = atTime(day, { h: sh, m: sm });
        const endT = atTime(day, { h: eh, m: em });
        if (now < startT) total += fullDayH;
        else if (now < endT) total += Math.max(0, (endT - now) / 3600000);
        // 已下班 → 不计
      } else {
        total += fullDayH;
      }
    }
    return Math.round(total * 10) / 10;
  }

  /** 下一个节假日天数（节假日当天返回 0） */
  function daysToHoliday(now = new Date()) {
    const nh = nextHoliday(now);
    if (!nh) return null;
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((nh.date - todayZero) / 86400000);
  }

  /**
   * 「今天赚了」：上班日（含补班）按已工作时长线性累计；休息日为 0。
   * v3: 支持 daily/monthly 双模式与试用期 8 折（effectiveDailyIncome）。
   */
  function earnedToday(now, cfg) {
    const c = cfg || DEFAULTS;
    const { h: sh, m: sm } = parseHM(c.start || DEFAULTS.start);
    const { h: eh, m: em } = parseHM(c.end || DEFAULTS.end);
    const startT = atTime(now, { h: sh, m: sm });
    const endT = atTime(now, { h: eh, m: em });
    if (!(endT - startT > 0)) return 0;   // NaN 也拦住

    if (!isWorkDate(now, c)) return 0;
    if (now <= startT) return 0;

    const elapsed = Math.min(now, endT) - startT;
    const ratio = Math.max(0, Math.min(1, elapsed / (endT - startT)));
    if (!Number.isFinite(ratio)) return 0;
    return effectiveDailyIncome(now, c) * ratio;
  }

  /* ---------- 月薪模式 ---------- */

  /** 某月应上班天数 = 该月内的工作日 + 调休补班日 − 法定假 */
  function workdaysInMonth(year, month /*0-based*/, cfg) {
    let n = 0;
    const days = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      if (isWorkDate(new Date(year, month, d), cfg)) n++;
    }
    return n;
  }

  /**
   * 实际用于「今天赚了」的日收入：
   * daily 模式 → 日薪（试用期打 8 折）；
   * monthly 模式 → 月薪 ÷ 当月应上班天数（试用期再打 8 折），四舍五入到分。
   */
  function effectiveDailyIncome(now, cfg) {
    const c = cfg || DEFAULTS;
    const discount = c.probation ? 0.8 : 1;
    if (c.incomeMode === 'monthly') {
      const days = workdaysInMonth(now.getFullYear(), now.getMonth(), c) || 22;
      return Math.round(c.monthlySalary * discount / days * 100) / 100;
    }
    return Math.round(c.dailyIncome * discount * 100) / 100;
  }

  /* ---------- 自定义倒数日 ---------- */

  /** _key() 定义于上方查询表区（y-m-d）。这里算目标日零点与今天的差值天数。 */
  function daysUntil(dateStr, now = new Date()) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today0) / 86400000);
  }

  /**
   * 下一个要展示的自定义倒数日：
   * 只剩未来的； repeatYearly 的每年自动顺延到下一个生日/纪念日；
   * 当天(days===0)也显示为 0；已过期(非重复)的忽略。
   * @returns {{name:string, days:number} | null}
   */
  function nextEvent(now = new Date(), events = DEFAULTS.events) {
    let best = null;
    for (const ev of (events || [])) {
      if (!ev || !ev.name || !ev.date) continue;
      let days = daysUntil(ev.date, now);
      if (days < 0 && ev.repeatYearly) {
        // 顺延一年（简单按年份+1，2/29 → 平年落到 3/1 由 Date 自动处理为 2/28）
        const [y, m, d] = ev.date.split('-').map(Number);
        const thisYear = new Date(now.getFullYear(), m - 1, d);
        days = Math.round((thisYear - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
        if (days < 0) {
          const nextYear = new Date(now.getFullYear() + 1, m - 1, d);
          days = Math.round((nextYear - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
        }
      }
      if (days < 0) continue;
      if (!best || days < best.days) best = { name: ev.name, days };
    }
    return best;
  }

  /* ---------- 汇总给 UI 的数据包 ---------- */
  function snapshot(now, cfg) {
    const { h: sh, m: sm } = parseHM(cfg.start);
    const { h: eh, m: em } = parseHM(cfg.end);
    const startT = atTime(now, { h: sh, m: sm });
    const endT = atTime(now, { h: eh, m: em });

    const info = getDayInfo(now, cfg);
    const worksToday = info.kind === 'workday' || info.kind === 'makeup';
    let status, remainingSec;

    if (!worksToday) {
      status = info.kind === 'holiday'
        ? { key: 'rest', label: `${info.name} · 休息` }
        : { key: 'rest', label: '今天休息' };
      remainingSec = null;
    } else if (now < startT) {
      status = { key: 'before', label: '距上班' };
      remainingSec = Math.floor((startT - now) / 1000);
    } else if (now >= endT) {
      status = { key: 'after', label: '已下班' };
      remainingSec = null;
    } else {
      status = { key: 'working', label: '下班还有' };
      remainingSec = Math.floor((endT - now) / 1000);
    }

    const nh = nextHoliday(now);

    // 今日进度：上班日内 start→end 线性；非工作日 null
    let progress = null;
    if (worksToday && endT > startT) {
      progress = Math.max(0, Math.min(1, (now - startT) / (endT - startT)));
    }

    const cards = {
      payday: { label: '发薪', value: daysToPayday(now, cfg.payday), unit: '天' },
      friday: { label: '周五', value: daysToFriday(now), unit: '天' },
      holiday: { label: nh ? nh.name : '节日', value: daysToHoliday(now), unit: '天' },
      income: { label: '今天赚了', value: earnedToday(now, cfg).toFixed(2), unit: '¥' },
    };

    // 自定义倒数日卡片（有事件时；slot='_append' 表示追加到末尾而非替换）
    const ev = nextEvent(now, cfg.events);
    let eventCard = null;
    if (ev) {
      eventCard = {
        label: ev.name,
        value: ev.days,
        unit: '天',
        slot: cfg.eventSlot === 'none' ? '_append' : cfg.eventSlot,
      };
    }

    return {
      status,
      countdown: remainingSec,
      dayInfo: info,
      progress,
      cards,
      eventCard,
      weekRemaining: weekHoursRemaining(now, cfg),
      meta: {
        range: `${cfg.start} – ${cfg.end}`,
        dayLabel: DAY_LABELS[now.getDay()],
      },
    };
  }

  /* ---------- 角标文案 ---------- */

  /**
   * 由 snapshot 得出角标文本（最多 4 字符）。
   * 工作中：≥1h 显示 "3h"，<1h 显示 "45m"；休息日显示 "休"；其他为空。
   */
  function badgeText(snap) {
    if (!snap) return '';
    if (snap.status.key === 'working' && snap.countdown !== null) {
      const sec = snap.countdown;
      if (sec >= 3600) return `${Math.floor(sec / 3600)}h`;
      return `${Math.max(1, Math.ceil(sec / 60))}m`;
    }
    if (snap.status.key === 'rest') return '休';
    return '';
  }

  function dateString(dt = new Date()) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return {
    DEFAULTS, DAY_LABELS,
    loadConfig, saveConfig,
    getDayInfo, isWorkDate,
    isWorkday: getDayInfo,
    dateString,
    daysToPayday, daysToFriday, daysToHoliday, earnedToday,
    nextHoliday, isHolidayToday,
    monthMatrix, monthFestivals,
    workdaysInMonth, effectiveDailyIncome,
    nextEvent, daysUntil,
    badgeText, snapshot,
    inFocusTime, weekHoursRemaining,
    syncHolidays, applyCachedDays, REMOTE_URLS,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CORE;
}
if (typeof window !== 'undefined') {
  window.CORE = CORE;
}

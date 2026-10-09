/* v1.7 回归测试：午休不计入有效工时 + 专属仪式感 */
const fs = require('fs');
const path = require('path');
global.chrome = { storage: { sync: { get: async (d) => d, set: async () => {} } } };
const CORE = new Function(
  fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8') + '; return CORE;')();

let pass = 0, fail = 0;
const t = (desc, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log('FAIL', desc, '->', JSON.stringify(got), 'want', JSON.stringify(want));
};

const BASE = { workdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };
const LUNCH = { ...BASE, lunchEnabled: true, lunchStart: '12:00', lunchEnd: '13:00' };
const H = h => h * 3600000;

/* ============ 1. 午休不计入有效工时 ============ */
// 2026-08-27 周四 / 08-28 周五
t('workday is thu 2026-08-27', CORE.snapshot(new Date(2026, 7, 27), BASE).dayInfo.kind, 'workday');
t('shift 9h without lunch', CORE.snapshot(new Date(2026, 7, 27, 12), BASE).meta.shiftHours, 9);
t('effective 9h when lunch off', CORE.snapshot(new Date(2026, 7, 27, 12), BASE).meta.effectiveHours, 9);
t('shift 9h with lunch', CORE.snapshot(new Date(2026, 7, 27, 12), LUNCH).meta.shiftHours, 9);
t('effective 8h with lunch', CORE.snapshot(new Date(2026, 7, 27, 12), LUNCH).meta.effectiveHours, 8);

// 自定义午休时段（13:30–14:30）
const CUSTOM = { ...BASE, lunchEnabled: true, lunchStart: '13:30', lunchEnd: '14:30' };
t('custom lunch effective 8h', CORE.snapshot(new Date(2026, 7, 27, 13), CUSTOM).meta.effectiveHours, 8);

// 午休在班次之外（08:00–09:00）不重复扣除
const OUTSIDE = { ...BASE, lunchEnabled: true, lunchStart: '07:00', lunchEnd: '08:00' };
t('lunch outside shift keeps 9h', CORE.snapshot(new Date(2026, 7, 27, 12), OUTSIDE).meta.effectiveHours, 9);

// 进度：午休期间停走
t('progress @12:00 = 3/8', +(CORE.snapshot(new Date(2026, 7, 27, 12, 0), LUNCH).progress.toFixed(4)), 0.375);
t('progress @12:30 = 3/8 (pause)', +(CORE.snapshot(new Date(2026, 7, 27, 12, 30), LUNCH).progress.toFixed(4)), 0.375);
t('progress @13:00 = 3/8 (just over)', +(CORE.snapshot(new Date(2026, 7, 27, 13, 0), LUNCH).progress.toFixed(4)), 0.375);
t('progress @14:00 = 4/8', +(CORE.snapshot(new Date(2026, 7, 27, 14, 0), LUNCH).progress.toFixed(4)), 0.5);
t('progress @18:00 = 1', CORE.snapshot(new Date(2026, 7, 27, 18, 0), LUNCH).progress, 1);

// 收益：午休期间不涨
const e1200 = CORE.earnedToday(new Date(2026, 7, 27, 12, 0), { ...LUNCH, incomeMode: 'daily', dailyIncome: 400 });
const e1230 = CORE.earnedToday(new Date(2026, 7, 27, 12, 30), { ...LUNCH, incomeMode: 'daily', dailyIncome: 400 });
const e1330 = CORE.earnedToday(new Date(2026, 7, 27, 13, 30), { ...LUNCH, incomeMode: 'daily', dailyIncome: 400 });
t('income frozen during lunch', Math.round(e1200 * 100) / 100, 150);
t('income unchanged at 12:30', Math.round(e1230 * 100) / 100, 150);
t('income grows after lunch', Math.round(e1330 * 100) / 100, 175);

// 本周剩余工时：周四 14:00 → 今天剩 4h + 周五 8h = 12h（未开午休为 13h）
t('week remaining excludes lunch', CORE.weekHoursRemaining(new Date(2026, 7, 27, 14, 0), LUNCH), 12);
t('week remaining without lunch', CORE.weekHoursRemaining(new Date(2026, 7, 27, 14, 0), BASE), 13);

// lunchInfo 展示数据
const li = CORE.lunchInfo(new Date(2026, 7, 27, 12, 30), LUNCH);
t('lunchInfo enabled', li.enabled, true);
t('lunchInfo label', li.label, '12:00–13:00');
t('lunchInfo minutes', li.minutes, 60);
t('lunchInfo inProgress@12:30', li.inProgress, true);
t('lunchInfo not inProgress@14:00', CORE.lunchInfo(new Date(2026, 7, 27, 14, 0), LUNCH).inProgress, false);
t('lunchInfo off by default', CORE.lunchInfo(new Date(2026, 7, 27, 12, 30), BASE).enabled, false);
t('snapshot carries lunch', CORE.snapshot(new Date(2026, 7, 27, 12, 30), LUNCH).lunch.label, '12:00–13:00');

// 自定义上下班时间必须生效（validHM 解析回归）
const LATE = { ...BASE, start: '10:00', end: '19:00', lunchEnabled: true, lunchStart: '13:00', lunchEnd: '14:00' };
t('custom shift: before work @09:30', CORE.snapshot(new Date(2026, 7, 27, 9, 30), LATE).status.key, 'before');
t('custom shift: working @10:30', CORE.snapshot(new Date(2026, 7, 27, 10, 30), LATE).status.key, 'working');
t('custom shift: after @19:00', CORE.snapshot(new Date(2026, 7, 27, 19, 0), LATE).status.key, 'after');
t('custom shift effective 8h', CORE.snapshot(new Date(2026, 7, 27, 12), LATE).meta.effectiveHours, 8);
t('custom lunch progress @13:30 paused', +(CORE.snapshot(new Date(2026, 7, 27, 13, 30), LATE).progress.toFixed(4)), 0.375);

/* ============ 2. 专属仪式感 ============ */
// 周五 = 本周最后一个工作日
const fri = CORE.snapshot(new Date(2026, 7, 28, 10, 0), BASE);
t('fri is last workday of week', fri.isLastWorkdayOfWeek, true);
t('fri ceremony kind', fri.ceremony && fri.ceremony.kind, 'week-end');
t('fri ceremony tone', fri.ceremony && fri.ceremony.tone, 'weekend');
t('fri ceremony title', fri.ceremony && fri.ceremony.title, '本周最后一个工作日');
t('fri ceremony celebrate', fri.ceremony && fri.ceremony.celebrate, '周末愉快 🎉');

// 周四不是
const thu = CORE.snapshot(new Date(2026, 7, 27, 10, 0), BASE);
t('thu is not last workday', thu.isLastWorkdayOfWeek, false);
t('thu has no ceremony', thu.ceremony, null);

// 节假日前夕 + 本周最后一个工作日 → 双喜临门
// 2026-02-14 周六（春节调休补班），次日 2026-02-15 春节
const eve = CORE.snapshot(new Date(2026, 1, 14, 10, 0), BASE);
t('makeup sat is workday', eve.dayInfo.kind, 'makeup');
t('eve preHoliday', eve.preHoliday, true);
t('eve preHolidayName', eve.preHolidayName, '春节');
t('eve ceremony kind both', eve.ceremony && eve.ceremony.kind, 'both');
t('eve ceremony tone festival', eve.ceremony && eve.ceremony.tone, 'festival');
t('eve ceremony sub mentions 春节', /春节/.test((eve.ceremony && eve.ceremony.sub) || ''), true);

// 节假日前夕但本周还有补班 → 只算节前最后一天
// 2025-12-31 周三，次日元旦；2026-01-04 周日为元旦调休补班
const eve2 = CORE.snapshot(new Date(2025, 11, 31, 10, 0), BASE);
t('2025-12-31 is workday', eve2.dayInfo.kind, 'workday');
t('2025-12-31 preHoliday', eve2.preHoliday, true);
t('2025-12-31 not last workday (01-04 补班)', eve2.isLastWorkdayOfWeek, false);
t('2025-12-31 ceremony holiday-eve', eve2.ceremony && eve2.ceremony.kind, 'holiday-eve');
t('2025-12-31 holiday name', eve2.preHolidayName, '元旦');

// 周五次日不是节日 → 普通仪式感；2026-10-09 周五次日为国庆调休补班 → 无仪式感
t('no ceremony when makeup tomorrow', CORE.snapshot(new Date(2026, 9, 9, 10, 0), BASE).ceremony, null);

// 非工作日不触发
t('no ceremony on sunday', CORE.snapshot(new Date(2026, 7, 30, 10, 0), BASE).ceremony, null);
t('no ceremony on holiday', CORE.snapshot(new Date(2026, 1, 16, 10, 0), BASE).ceremony, null);

// 用户可在设置中关闭
t('ceremony off by user', CORE.snapshot(new Date(2026, 7, 28, 10, 0), { ...BASE, ceremonyEnabled: false }).ceremony, null);
t('ceremonyEnabled default on', CORE.DEFAULTS.ceremonyEnabled, true);

// 自定义工作日（周日~周四）：周四不是本周最后一个工作日（周日还要上班）
const SUN_THU = { ...BASE, workdays: [0, 1, 2, 3, 4] };
t('thu not last when sunday works', CORE.snapshot(new Date(2026, 7, 27, 10, 0), SUN_THU).isLastWorkdayOfWeek, false);
// 周四=最后（周一~周四排班）
const MON_THU = { ...BASE, workdays: [1, 2, 3, 4] };
t('thu is last when mon-thu', CORE.snapshot(new Date(2026, 7, 27, 10, 0), MON_THU).isLastWorkdayOfWeek, true);
t('thu ceremony when mon-thu', CORE.snapshot(new Date(2026, 7, 27, 10, 0), MON_THU).ceremony && CORE.snapshot(new Date(2026, 7, 27, 10, 0), MON_THU).ceremony.kind, 'week-end');

console.log(fail === 0 ? ('ALL PASS: ' + pass + ' assertions') : ('FAILED: ' + fail));
process.exit(fail ? 1 : 0);

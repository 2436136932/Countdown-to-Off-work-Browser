/* v1.4 全量回归测试：防回归与核心算法验证 */
const fs = require('fs');
const path = require('path');
global.chrome = { storage: { sync: { get: async (d) => d, set: async () => {} } } };
// 相对路径解析：不再硬编码本机绝对路径，clone 到任何目录都能跑
const CORE = new Function(
  fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8')
  + '; return CORE;')();

let pass = 0, fail = 0;
const t = (desc, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log('FAIL', desc, '->', JSON.stringify(got), 'want', JSON.stringify(want));
};

const BASE = { workdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };

// 1. 月薪折算：
// 2026 年 6 月（monthIndex 5）：21 天工作日 -> 6500 / 21 = 309.52
// 2026 年 7 月（monthIndex 6）：23 天工作日 -> 6500 / 23 = 282.61
// 2026 年 8 月（monthIndex 7）：21 天工作日 -> 6500 / 21 = 309.52
t('monthly 6500/21d(jun)', CORE.effectiveDailyIncome(new Date(2026, 5, 27), { incomeMode: 'monthly', monthlySalary: 6500 }), Math.round(6500 / 21 * 100) / 100);
t('monthly 6500/23d(jul)', CORE.effectiveDailyIncome(new Date(2026, 6, 27), { incomeMode: 'monthly', monthlySalary: 6500 }), Math.round(6500 / 23 * 100) / 100);
t('monthly 6500/21d(aug)', CORE.effectiveDailyIncome(new Date(2026, 7, 27), { incomeMode: 'monthly', monthlySalary: 6500 }), Math.round(6500 / 21 * 100) / 100);
t('monthly probation x0.8(aug)', CORE.effectiveDailyIncome(new Date(2026, 7, 27), { incomeMode: 'monthly', monthlySalary: 6500, probation: true }), Math.round(5200 / 21 * 100) / 100);
t('daily 300 probation', CORE.effectiveDailyIncome(new Date(2026, 7, 27), { dailyIncome: 300, probation: true }), 240);

const e50 = CORE.earnedToday(new Date(2026, 7, 27, 13, 30), { incomeMode: 'monthly', monthlySalary: 6500, ...BASE });
t('earned@13:30 monthly(aug)', Math.round(e50 * 100) / 100, Math.round(6500 / 21 / 2 * 100) / 100);

// 2. 倒数日（今天设为 2026-08-27）
const today = new Date(2026, 7, 27);
t('event future 52d', CORE.nextEvent(today, [{ name: 'a', date: '2026-10-18' }]), { name: 'a', days: 52 });
t('event today 0d', CORE.nextEvent(today, [{ name: 'b', date: '2026-08-27' }]), { name: 'b', days: 0 });
t('event past null', CORE.nextEvent(today, [{ name: 'c', date: '2026-01-01' }]), null);
t('event yearly rollover', CORE.nextEvent(today, [{ name: 'd', date: '2025-08-20', repeatYearly: true }]), { name: 'd', days: 358 });

// 3. 今日进度
t('progress 13:30 = 50%', +(CORE.snapshot(new Date(2026, 7, 27, 13, 30), BASE).progress.toFixed(4)), 0.5);
t('progress weekend null', CORE.snapshot(new Date(2026, 7, 29), BASE).progress, null);

// 4. snapshot 兼容测试
t('snapshot cards complete', Object.keys(CORE.snapshot(today, BASE).cards).length, 4);

console.log(fail === 0 ? ('ALL PASS: ' + pass + ' assertions') : ('FAILED: ' + fail));
process.exit(fail ? 1 : 0);

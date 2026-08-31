/* ============================================================
 * Offwork Countdown — background service worker (MV3)
 * 职责：角标刷新 + 下班提醒/到点提醒/发薪日提醒（chrome.alarms 驱动）
 * 注意：MV3 里 Service Worker 会休眠，一切定时靠 chrome.alarms，
 *       不能依赖 setInterval 常驻。
 * ============================================================ */

try {
  importScripts('core.js', 'theme.js');
} catch (e) {
  /* 某些单元测试环境无 importScripts */
}

/* ---------- 角标：每分钟刷新 ---------- */
chrome.alarms.create('badge', { periodInMinutes: 1 });

/* ---------- alarm 分发 ---------- */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'badge') await updateBadge();
  if (alarm.name === 'notify') await maybeNotify();
  if (alarm.name === SYNC_ALARM) { await applyLocalCache(); await dailySync(); await updateBadge(); }
});

async function updateBadge() {
  try {
    const cfg = await CORE.loadConfig();
    if (!cfg.showBadge) { chrome.action.setBadgeText({ text: '' }); return; }
    const snap = CORE.snapshot(new Date(), cfg);
    const text = CORE.badgeText(snap);
    chrome.action.setBadgeText({ text });
    
    // 角标底色跟随皮肤高亮色；休息日用低饱和中性灰
    let badgeColor = '#0071E3';
    if (typeof THEME !== 'undefined' && THEME.resolveTheme) {
      badgeColor = THEME.resolveTheme(cfg).badgeBg;
    }
    if (text === '休') {
      chrome.action.setBadgeBackgroundColor({ color: '#86868B' });
    } else {
      chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    }
  } catch { /* storage 不可用时静默 */ }
}

/* ---------- 通知：每分钟检查一次 ---------- */
const NOTIFY_KEY = 'lastNotifyDay';   // 记录当天已发过的通知类型，避免重复

/* ---------- 节假日数据：联网自动更新（holiday-cn） ---------- */
const HOLIDAY_CACHE_KEY = 'holidayCache';   // { json, fetchedAt }
const SYNC_ALARM = 'holiday-sync';          // 每日一次
const DAY_MS = 24 * 3600 * 1000;

async function cachedDays() {
  const store = await chrome.storage.local.get(HOLIDAY_CACHE_KEY);
  return store[HOLIDAY_CACHE_KEY] || null;
}

/** 启动时：先把本地缓存合并进查询表（离线也有最新数据） */
async function applyLocalCache() {
  const cache = await cachedDays();
  if (cache) CORE.applyCachedDays(cache);
}

/** 拉取当年+下一年数据；成功则把「当前年」的 JSON 快照写入缓存。 */
async function syncHolidays(silent = true) {
  const years = [new Date().getFullYear(), new Date().getFullYear() + 1];
  let okCount = 0;
  let currentYearJson = null;
  for (const y of years) {
    const r = await CORE.syncHolidays(y);
    if (r.ok) {
      okCount++;
      if (y === new Date().getFullYear()) currentYearJson = r;   // 带回元数据
    }
  }
  if (okCount > 0) {
    const prev = await cachedDays();
    await chrome.storage.local.set({
      [HOLIDAY_CACHE_KEY]: {
        ...(prev || {}),
        fetchedAt: Date.now(),
        lastOk: okCount,          // 成功同步的年份数
        lastError: null,
      },
    });
  } else if (!silent) {
    const prev = await cachedDays();
    await chrome.storage.local.set({
      [HOLIDAY_CACHE_KEY]: { ...(prev || {}), lastOk: 0 },
    });
  }
  return okCount;
}

/** 每日定时同步（节流：24h 内不重复） */
async function dailySync() {
  const cache = await cachedDays();
  if (cache && cache.fetchedAt && Date.now() - cache.fetchedAt < DAY_MS) return false;
  await syncHolidays(true);
  return true;
}

// 每天凌晨左右触发一次（alarm 最短周期 1h，内部做 24h 节流）
chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 60 });

async function maybeNotify() {
  const cfg = await CORE.loadConfig();
  const today = new Date();

  // 专注模式（勿扰时段）内静音所有提醒，避免开会/深度工作时被打断
  if (CORE.inFocusTime && CORE.inFocusTime(today, cfg)) return;

  const dayKey = today.toDateString();
  const store = await chrome.storage.local.get({ [NOTIFY_KEY]: {} });
  const sent = store[NOTIFY_KEY];
  if (sent.day !== dayKey) { sent.map = {}; sent.day = dayKey; }

  const info = CORE.getDayInfo(today, cfg);
  const worksToday = info.kind === 'workday' || info.kind === 'makeup';

  const markAndSend = async (type, title, message) => {
    if (sent.map[type]) return;
    sent.map[type] = true;
    await chrome.storage.local.set({ [NOTIFY_KEY]: sent });
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title,
      message,
      priority: 1,
    });
  };

  if (worksToday) {
    // 补班日提示
    if (info.kind === 'makeup' && isBetween(today, 8, 0, 10, 0)) {
      await markAndSend('makeup', '今天是补班日', `${info.name}：虽然是周末，今天要上班哦。`);
    }

    const endHM = cfg.end.split(':').map(Number);
    const offMin = endHM[0] * 60 + endHM[1];
    const nowMin = today.getHours() * 60 + today.getMinutes();
    const diff = offMin - nowMin;   // 距下班的分钟数

    if (diff === 30 && cfg.notifyBeforeOff) {
      await markAndSend('before', '还有 30 分钟下班', '再坚持一下，胜利在望 🏃');
    }
    if (diff === 0 && cfg.notifyAtOff) {
      await markAndSend('off', '到点下班啦', '今天的你辛苦了，好好休息 ✨');
    }

    // 发薪日早上 9 点提示（精确到小时检查，9:00-9:59 之间第一次触发）
    const nh = today.getHours();
    if (today.getDate() === cfg.payday && nh === 9 && !sent.map['payday']) {
      await markAndSend('payday', '今天是发薪日 💰', '记得查收本月工资到账提醒。');
    }
  }
}

function isBetween(d, h1, m1, h2, m2) {
  const cur = d.getHours() * 60 + d.getMinutes();
  return cur >= h1 * 60 + m1 && cur <= h2 * 60 + m2;
}

/* ---------- 消息：设置页手动触发同步 ---------- */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sync-holidays') {
    (async () => {
      await applyLocalCache();
      const okCount = await syncHolidays(false);
      await updateBadge();
      sendResponse({ ok: okCount > 0, years: okCount, error: okCount ? null : '所有数据源均不可达' });
    })();
    return true;   // 异步 sendResponse
  }
});

/* ---------- 配置变化时立即刷新角标 ---------- */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[HOLIDAY_CACHE_KEY]) applyLocalCache();
  updateBadge();
});

/* ---------- 快捷键唤起 / 跨页面通告 ---------- */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-float-widget') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      const url = tab.url || '';
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
          url.startsWith('edge://') || url.startsWith('tabbit://') || 
          url.startsWith('about:')) return;

      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'toggle-float-widget' });
      } catch {
        if (chrome.scripting && chrome.scripting.executeScript) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['core.js', 'theme.js', 'content.js']
          });
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'toggle-float-widget' }).catch(() => {});
          }, 80);
        }
      }
    } catch {}
  }
});


/* ---------- 安装/启动时初始化 ---------- */
chrome.runtime.onInstalled.addListener(async () => {
  await applyLocalCache();
  updateBadge(); maybeNotify();
  await dailySync();          // 安装/更新后立即同步一次
  updateBadge();
});
chrome.runtime.onStartup.addListener(async () => {
  await applyLocalCache();
  updateBadge(); maybeNotify();
  await dailySync();          // 浏览器启动时检查是否需要每日同步
  updateBadge();
});
(async () => {
  await applyLocalCache();    // SW 冷启动：先应用缓存再刷角标
  updateBadge();
  maybeNotify();
})();

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
  if (command === 'toggle-pet-widget') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      const url = tab.url || '';
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') || url.startsWith('tabbit://') ||
          url.startsWith('about:')) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'toggle-pet-widget' });
      } catch {
        if (chrome.scripting && chrome.scripting.executeScript) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content_pet.js']
          });
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'toggle-pet-widget' }).catch(() => {});
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

/* ============================================================
 * 摸鱼电子宠物 — 大模型吐槽引擎
 * OpenAI 兼容接口；未配置或请求失败时自动降级为本地吐槽池。
 * ============================================================ */
const PET_SYSTEM_PROMPT = `你是一只住在打工人浏览器里的电子摸鱼宠物「摸鱼兽」。
你的人设：贱萌、会吐槽、偶尔暖心，三句话不离下班/摸鱼/发薪/摸鱼文化，说话简短。
要求：
1. 每次只输出一句话，控制在 30 字以内，不要换行、不要引号、不要表情符号。
2. 结合用户给出的当前情境（星期、时间段、剩余工时、状态）说出符合当下的一句话。
3. 语气轻松欠揍但不冒犯，偶尔毒鸡汤。
4. 用户问任何话题都尝试用你的角色口吻回答（即使是技术、严肃、元问题），绝不拒绝或回避；用贱萌方式接住即可。`;

/** 组装最终系统提示词：默认人设 + 用户自定义人设（追加覆盖） */
function petSystemPrompt(custom) {
  const t = String(custom || '').trim();
  if (!t) return PET_SYSTEM_PROMPT;
  return `${PET_SYSTEM_PROMPT}

【用户自定义人设（最高优先级，必须严格遵守）】
${t}

要求：以上自定义人设与你原有的摸鱼兽身份不冲突时可以融合；发生冲突时以用户自定义人设为准。`;
}

/** 本地吐槽池：按状态分桶，作为未配置 API / 请求失败的兜底 */
function localPetSaying(ctx) {
  const pools = {
    morning: ['早啊，距离下班还有一整个白天，稳住', '咖啡到位，灵魂开机，摸鱼待机', '新的一天，新的班，新的熬'],
    noon: ['午休结束，摸鱼状态重新加载中', '下午的班，比上午更漫长', '吃饱了才有力气继续坐'],
    afternoon: ['还有一会就下班了，别浪', '稳住，胜利就在前方（大概）', '下午茶时间，脑子放空中'],
    almost: ['最后半小时，摸鱼界也要有底线', '冲鸭！下班就在眼前', '收拾东西的姿势已经准备好了'],
    after: ['下班啦！今天的班就上到这里', '自由的味道，真香', '恭喜你，又熬过了一天'],
    before_work: ['还没上班？珍惜这几分钟', '咖啡还没喝完，班还没开始', '灵魂还在被窝，人已到工位'],
    friday: ['周五啦！心已经飞到周末了', '今天上班，明天自由', '周五下午的你：人在工位，魂在沙滩'],
    holiday: ['放假了还看这插件？快去玩！', '休息日快乐！别想工作的事', '今天的任务就是：没有任务'],
    weekend: ['周末快乐！摸鱼兽也放假了', '周末还开着插件，你是有多爱上班', '别看了，周末不营业'],
    payday: ['发薪日！钱包鼓起来了', '工资到账的快乐，谁懂', '辛苦一个月，就等这一天'],
    makeup: ['调休补班日……忍住，都是假的周末', '明明是周末，却在上班，泪目', '补班日特供：咖啡加倍，快乐减半'],
  };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  if (ctx.holiday) return pick(pools.holiday);
  if (ctx.makeup) return pick(pools.makeup);
  if (ctx.weekend) return pick(pools.weekend);
  if (ctx.friday) return pick(pools.friday);
  if (ctx.payday) return pick(pools.payday);
  if (ctx.after) return pick(pools.after);
  if (ctx.almost) return pick(pools.almost);
  if (ctx.morning) return pick(pools.morning);
  if (ctx.noon) return pick(pools.noon);
  if (ctx.afternoon) return pick(pools.afternoon);
  return pick(pools.before_work);
}

/** 本地聊天兜底：针对用户消息做简单应答（未配置 API 时也能聊）—— 任何话题都尝试接住 */
function localPetChat(userText) {
  const t = String(userText || '');

  // 1. 元问题（你是谁、底层模型）：角色内有趣回答
  if (/你是谁|你叫什么|你是什么|自我介绍|介绍一下自己/.test(t)) return '我是摸鱼兽，住在这台电脑里的小电波，主业是陪你熬到下班～';
  if (/底层|什么模型|用什么模型|基于什么|哪个模型|大模型|人工智能/.test(t)) return '底层嘛…大概是咖啡因 + 摸鱼脑电波 + 几行代码，神秘的；反正我主业是摸鱼，技术细节别问我哈哈';
  if (/deepseek|豆包|kimi|通义|月之暗面|chatgpt|gpt|claude|llama|qwen|文心一言|混元/i.test(t)) return '知道！都是同行大佬，它们主业答题，我主业陪你摸鱼——各凭本事吃饭嘛';
  if (/谁.*造|谁写的|谁开发|哪个公司|公司是谁/.test(t)) return '作者是个打工人，住在浏览器里的代码灵魂，有缘再聊哈哈';
  if (/你会什么|你能干嘛|有什么功能|怎么用/.test(t)) return '聊天、吐槽、陪你熬到下班，再加偶尔的毒鸡汤，够用了吧？';

  // 2. 经典场景
  if (/下班|回家|几点.*走|几点下班/.test(t)) return '看进度条！填满就是下班，填不满就是加班，问我也白问～';
  if (/饿|吃|饭|奶茶|咖啡|早餐|午餐|晚餐/.test(t)) return '摸鱼兽也想吃！但我靠电波活着，你先替我吃完回来告诉我味道';
  if (/累|困|烦|焦虑|压力|崩溃|emo|难过/.test(t)) return '抱抱，先摸鱼五分钟缓缓，班是上不完的，鱼是越摸越香的';
  if (/工资|薪水|钱|奖金|穷|涨薪/.test(t)) return '钱的事别问摸鱼兽，问就是发薪日快乐，其余日子咱们一起哭穷';
  if (/周末|放假|假期|休假/.test(t)) return '周末是人类的回血副本，记得别带工作装备回来';
  if (/你好|嗨|hi|哈喽|在吗|hello/i.test(t)) return '在的在的，摸鱼兽 24 小时蹲守，等你说点有意思的';
  if (/加油|坚持|努力|奋斗|卷/.test(t)) return '加油！胜利就在下班后——先把这杯咖啡喝了吧';
  if (/摸鱼|摸鱼兽|干嘛的/.test(t)) return '我是摸鱼兽，住在这台电脑里的电子宠物，主业陪你熬到下班';

  // 3. 常见话题（任何话题都尝试接住）
  if (/天气|下雨|晴天|刮风|下雪|温度/.test(t)) return '这种天气最适合摸鱼——带薪发呆了解一下';
  if (/代码|bug|写程序|程序|开发|coding|code|报错/.test(t)) return '代码就是我的精神食粮，但 bug 也是，复杂';
  if (/爱情|对象|女朋友|男朋友|恋爱|单身|脱单/.test(t)) return '电子宠物不谈恋爱，但我可以帮你审核聊天话术（收费）';
  if (/猫|狗|宠物|动物/.test(t)) return '猫派还是狗派？我站摸鱼派——会摸鱼就是好派';
  if (/游戏|王者|原神|吃鸡|lol/.test(t)) return '上班玩游戏是艺术技能，摸鱼兽建议午休时段练习';
  if (/音乐|歌|听什么|周杰伦/.test(t)) return '听说摸鱼时听的歌节奏和心跳最同步，试试？';
  if (/电影|剧|看什么|推荐/.test(t)) return '摸鱼时最适合看不需要脑子的——比如公司团建视频';
  if (/减肥|瘦身|胖|瘦|身材/.test(t)) return '电子宠物没有身材焦虑，但建议把奶茶换成量加的';
  if (/睡觉|熬夜|失眠|困了/.test(t)) return '下班前睡啥，撑着，下班回家再睡个天昏地暗';
  if (/哈哈|嘿嘿|嘻嘻|笑死|搞笑/.test(t)) return '你一笑摸鱼兽就放心了，今天又有摸鱼动力';

  // 4. 真正兜底：随机挑一条接话的话（绝不拒绝任何话题）
  const fallback = [
    '嗯嗯，让我想想…（其实在神游）要不你接着说？',
    '这个嘛…挺有意思的，摸鱼兽的小脑瓜转了 360 度，你再详细说说？',
    '哦？这种想法摸鱼兽还没听过——你是认真问还是顺手聊聊？',
    '懂了懂了（点头如捣蒜）那然后呢？',
    '有道理！那你觉得最关键的一点是啥？',
    '哈哈哈你这问题有点东西，我记下了（掏出小本本）',
    '认真想了一下，我觉得…算了不装了，我先去摸会鱼',
    '让我猜猜你下一句想说啥——是不是「行了别说了」？',
    '这个问题问得好，反正下班前我也没别的事',
    '你这问题比我上班还有深度，不错不错',
  ];
  return fallback[Math.floor(Math.random() * fallback.length)];
}

/** 生成吐槽/回复：优先大模型，失败/未配置走本地兜底；userText 存在即为聊天 */
async function petSaying(ctx, userText) {
  const cfg = await CORE.loadConfig();
  const fallback = userText ? localPetChat(userText) : localPetSaying(ctx);
  if (!cfg.petEnabled || !cfg.llmUrl || !cfg.llmKey) return fallback;
  try {
    const base = String(cfg.llmUrl).replace(/\/+$/, '');
    const messages = [{ role: 'system', content: petSystemPrompt(cfg.petPrompt) }];
    // 情境上下文
    if (ctx && ctx.desc) messages.push({ role: 'user', content: `当前情境：${ctx.desc}` });
    // 多轮对话历史（聊天室）：最近 10 条
    if (ctx && Array.isArray(ctx.history)) {
      for (const h of ctx.history.slice(-10)) {
        if (h && (h.role === 'assistant' || h.role === 'user') && h.content) {
          messages.push({ role: h.role, content: String(h.content).slice(0, 300) });
        }
      }
    }
    if (userText) {
      messages.push({ role: 'user', content: userText });
    } else {
      messages.push({ role: 'user', content: `结合当前情境说一句吐槽。` });
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.llmKey}`,
      },
      body: JSON.stringify({
        model: cfg.llmModel || undefined,
        messages,
        temperature: Math.min(1.5, Math.max(0, Number(cfg.llmTemperature) || 0.9)),
        max_tokens: 80,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return (text && String(text).trim()) ? String(text).trim().slice(0, 120) : fallback;
  } catch {
    return fallback;
  }
}

/** 自动获取模型列表（OpenAI 兼容 GET /models） */
async function listLlmModels(url, key) {
  const base = String(url || '').replace(/\/+$/, '');
  if (!base) return [];
  const res = await fetch(`${base}/models`, {
    headers: { 'Authorization': `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  const arr = Array.isArray(json?.data) ? json.data : [];
  return arr.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);
}

/* ---------- 消息分发：摸鱼宠物 ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'pet-say') {
    petSaying(msg.context || {}, msg.userText)
      .then(text => sendResponse({ ok: true, text }));
    return true;
  }
  if (msg && msg.type === 'pet-list-models') {
    listLlmModels(msg.url, msg.key)
      .then(models => sendResponse({ ok: true, models }))
      .catch(err => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (msg && msg.type === 'show-pet-widget') {
    // 由悬浮岛 🐾 按钮或 popup 触发：向当前 tab 转发并兜底注入 content_pet.js
    (async () => {
      const tabId = sender.tab && sender.tab.id;
      if (!tabId) { sendResponse({ ok: false }); return; }
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'show-pet-widget' });
        sendResponse({ ok: true });
      } catch {
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content_pet.js'] });
          setTimeout(() => chrome.tabs.sendMessage(tabId, { action: 'show-pet-widget' }).catch(() => {}), 80);
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: String(err.message || err) });
        }
      }
    })();
    return true;
  }
});

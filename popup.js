/**
 * Popup 脚本：苹果 HIG 风格渲染引擎
 */

const $ = id => document.getElementById(id);

/* ---------- 配置缓存 ----------
 * 旧实现每秒调用一次 CORE.loadConfig()（每次都走 chrome.storage.sync 异步 IO）。
 * 这里改为「启动读一次 + 监听变更」，与悬浮岛（content.js 的 currentCfg）保持一致。 */
let _cfg = null;
let _cfgReady = CORE.loadConfig().then(c => (_cfg = c)).catch(() => (_cfg = { ...CORE.DEFAULTS }));
function getConfig() { return _cfgReady.then(() => _cfg); }

try {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    _cfg = await CORE.loadConfig();
    if (typeof THEME !== 'undefined' && THEME.applyToDOM) THEME.applyToDOM(_cfg, document.documentElement);
    render();
    if ($('view-cal').classList.contains('on')) renderCalendar();
  });
} catch { /* 非扩展环境（如本地预览）忽略 */ }

/* ---------- 主题与皮肤动态注入 ---------- */
async function applyTheme() {
  const cfg = await getConfig();
  if (typeof THEME !== 'undefined' && THEME.applyToDOM) {
    THEME.applyToDOM(cfg, document.documentElement);
    // 同时也给 body 切换 dark class
    const isDark = (cfg.theme === 'dark') || (cfg.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', isDark);
  } else {
    const isDark = (cfg.theme === 'dark') || (cfg.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', isDark);
  }
}
applyTheme();

/* ---------- 视图切换（倒计时 / 日历） ---------- */
const tabDown = $('tab-down');
const tabCal = $('tab-cal');
const viewDown = $('view-down');
const viewCal = $('view-cal');

tabDown.addEventListener('click', () => {
  tabDown.classList.add('on');
  tabCal.classList.remove('on');
  viewDown.classList.add('on');
  viewCal.classList.remove('on');
});

tabCal.addEventListener('click', () => {
  tabCal.classList.add('on');
  tabDown.classList.remove('on');
  viewCal.classList.add('on');
  viewDown.classList.remove('on');
  renderCalendar();
});

/* ---------- 格式化工具 ---------- */
function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ---------- 渲染主循环 ---------- */
const CONFETTI_COLORS = ['#FF3B30', '#FF9F0A', '#34C759', '#0071E3', '#BF5AF2', '#FFD60A'];

/** 仪式感横幅彩纸屑（每个横幅只挂载一次） */
function mountConfetti(card) {
  if (card.dataset.confetti === '1') return;
  card.dataset.confetti = '1';
  for (let i = 0; i < 12; i++) {
    const dot = document.createElement('span');
    dot.className = 'cer-dot';
    dot.style.left = (5 + Math.random() * 90).toFixed(1) + '%';
    dot.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    dot.style.animationDelay = (Math.random() * 2.8).toFixed(2) + 's';
    dot.style.animationDuration = (2.2 + Math.random() * 1.6).toFixed(2) + 's';
    card.appendChild(dot);
  }
}

function render() {
  const now = new Date();
  getConfig().then(cfg => {
    const snap = CORE.snapshot(now, cfg);
    const cer = snap.ceremony;

    /* 专属仪式感横幅（本周最后一个工作日 / 节假日前夕） */
    const cerCard = $('ceremony-card');
    if (cer && cerCard) {
      cerCard.style.display = 'flex';
      cerCard.dataset.tone = cer.tone;
      $('ceremony-emoji').textContent = cer.emoji;
      $('ceremony-title').textContent = cer.title;
      $('ceremony-sub').textContent = cer.sub;
      mountConfetti(cerCard);
    } else if (cerCard) {
      cerCard.style.display = 'none';
    }

    /* 状态文案：午休时段单独标注（倒计时仍指向下班时刻） */
    let statusLabel = snap.status.label;
    if (snap.status.key === 'working' && snap.lunch && snap.lunch.inProgress) {
      statusLabel = '午休中 · 下班还有';
    }
    $('status').textContent = statusLabel;

    const elCd = $('countdown');
    elCd.classList.remove('celebrate');
    if (snap.countdown !== null) {
      elCd.textContent = fmt(snap.countdown);
      elCd.classList.remove('rest-state');
    } else if (snap.status.key === 'after' && cer) {
      // 仪式感日的下班时刻：换成专属庆祝文案
      elCd.textContent = cer.celebrate;
      elCd.classList.remove('rest-state');
      elCd.classList.add('celebrate');
    } else if (snap.status.key === 'rest') {
      elCd.textContent = '休息中';
      elCd.classList.add('rest-state');
    } else {
      elCd.textContent = '00:00:00';
      elCd.classList.remove('rest-state');
    }

    /* 今日进度条 (Apple Pill Capsule) */
    const barWrap = $('progress-wrap');
    if (snap.progress !== null && cfg.showProgress !== false) {
      barWrap.style.display = 'flex';
      $('progress-bar').style.width = (snap.progress * 100).toFixed(2) + '%';
      $('progress-text').textContent =
        snap.status.key === 'after' ? '100%' : Math.round(snap.progress * 100) + '%';
    } else {
      barWrap.style.display = 'none';
    }

    /* 今日收益特别卡片 */
    const incomeCard = $('income-card');
    if (cfg.showIncome && snap.cards && snap.cards.income) {
      incomeCard.style.display = 'flex';
      $('income-value').textContent = '¥ ' + snap.cards.income.value;
    } else {
      incomeCard.style.display = 'none';
    }

    /* 本周剩余工时横幅 */
    const weekCard = $('week-card');
    if (cfg.showWeek !== false && typeof snap.weekRemaining === 'number') {
      weekCard.style.display = 'flex';
      $('week-value').textContent = snap.weekRemaining + ' 小时';
    } else {
      weekCard.style.display = 'none';
    }

    /* 倒数日小组件网格渲染 */
    renderCards(snap, cfg);

    const lunchOn = !!(snap.lunch && snap.lunch.enabled);
    $('range').textContent = `工作日 ${cfg.start} – ${cfg.end}`
      + (lunchOn ? ` · 午休 ${snap.lunch.label}` : '');
    $('range').title = lunchOn
      ? `午休 ${snap.lunch.label} 不计工时 · 有效工时 ${snap.lunch.effectiveHours} 小时/天`
      : `班次时长 ${snap.meta && snap.meta.shiftHours ? snap.meta.shiftHours : ''} 小时/天`;

    // 今日身份标签
    const info = snap.dayInfo;
    let tag = '';
    if (info.kind === 'holiday') tag = `法定假 · ${info.name}`;
    else if (info.kind === 'makeup') tag = `调休补班 · ${info.name}`;
    else if (info.kind === 'weekend') tag = '周末';
    $('today-tag').textContent = tag;
    $('today-tag').style.display = tag ? '' : 'none';
  });
}

/**
 * 渲染倒数日小组件栅格（排除已作为大胶囊展示的 income）
 * 动态根据剩余卡片数量调整 grid 列数，保持像素级左右对称
 */
function renderCards(snap, cfg) {
  const wrap = $('cards-grid');
  wrap.innerHTML = '';

  // 基础 order，不把 income 塞入方块以免挤爆排版
  const baseOrder = Array.isArray(cfg.cards)
    ? cfg.cards.filter(k => k !== 'income')
    : ['payday', 'friday', 'holiday'];

  const items = [];
  const eventSlot = snap.eventCard && snap.eventCard.slot;

  for (const key of baseOrder) {
    if (eventSlot && eventSlot === key) {
      items.push({ label: snap.eventCard.label, value: snap.eventCard.value + ' 天', isEvent: true });
      continue;
    }
    const c = snap.cards[key];
    if (c && c.value !== null) {
      items.push({ label: c.label, value: c.value + ' 天', isEvent: false });
    }
  }

  // 若倒数日选择追加展示（_append）或槽位不冲突
  if (snap.eventCard && (eventSlot === '_append' || !baseOrder.includes(eventSlot))) {
    items.push({ label: snap.eventCard.label, value: snap.eventCard.value + ' 天', isEvent: true });
  }

  // 样式网格自适应
  wrap.className = 'cards-grid';
  if (items.length === 3) {
    wrap.classList.add('cols-3');
  } else if (items.length === 2) {
    wrap.classList.add('cols-2');
  }

  const frag = document.createDocumentFragment();
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'widget-card' + (item.isEvent ? ' event' : '');

    const lbl = document.createElement('span');
    lbl.className = 'widget-label';
    lbl.textContent = item.label;

    const val = document.createElement('span');
    val.className = 'widget-value';
    val.textContent = item.value;

    card.appendChild(lbl);
    card.appendChild(val);
    frag.appendChild(card);
  });

  wrap.appendChild(frag);
}

render();
setInterval(render, 1000);

$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('open-float')?.addEventListener('click', async () => {
  const btn = $('open-float');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    // 检查是否为浏览器受限页面（如扩展管理页、新标签页等）
    const url = tab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
        url.startsWith('edge://') || url.startsWith('tabbit://') || 
        url.startsWith('about:') || url.startsWith('devtools://')) {
      if (btn) {
        const oldText = btn.textContent;
        btn.textContent = '仅限普通网页有效';
        btn.style.color = '#ff9500';
        setTimeout(() => {
          btn.textContent = oldText;
          btn.style.color = 'var(--accent)';
        }, 2200);
      }
      return;
    }

    // 尝试直接发消息给 content script
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'toggle-float-widget' });
      window.close();
    } catch {
      // 若当前 tab 尚未注入 content script（比如在扩展更新前打开的网页），只注入 content.js
      // CORE/THEME 已在页面里（manifest 条目 1 提供），避免重复声明 SyntaxError
      if (chrome.scripting && chrome.scripting.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id, { action: 'toggle-float-widget' });
            } catch {}
            window.close();
          }, 80);
        } catch {
          window.close();
        }
      } else {
        window.close();
      }
    }
  } catch {}
});


/* ================= 日历视图 ================= */
const DOW = ['一', '二', '三', '四', '五', '六', '日'];
let calY, calM;
const now0 = new Date();
calY = now0.getFullYear();
calM = now0.getMonth();

$('cal-prev').addEventListener('click', () => {
  calM--; if (calM < 0) { calM = 11; calY--; }
  renderCalendar();
});
$('cal-next').addEventListener('click', () => {
  calM++; if (calM > 11) { calM = 0; calY++; }
  renderCalendar();
});

function renderCalendar() {
  getConfig().then(cfg => {
    $('cal-title').textContent = `${calY} 年 ${calM + 1} 月`;
    const wrap = $('cal-grid');
    wrap.innerHTML = '';

    // 星期表头
    DOW.forEach(d => {
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = d;
      wrap.appendChild(el);
    });

    // 复用 core 的月历矩阵与节日列表（批量算好、已排序），避免此处重复实现导致两份逻辑漂移
    const weeks = CORE.monthMatrix(calY, calM);            // 周一为首列，前导/尾部以 null 补齐
    const fest = CORE.monthFestivals(calY, calM);          // [{d, name, kind}]
    const festByDay = new Map(fest.map(f => [f.d, f]));

    const todayNow = new Date();
    const isCurrentMonth = (calY === todayNow.getFullYear() && calM === todayNow.getMonth());
    const todayDate = isCurrentMonth ? todayNow.getDate() : -1;

    const frag = document.createDocumentFragment();
    for (const week of weeks) {
      for (const cellData of week) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        if (!cellData) {
          cell.classList.add('empty');
          frag.appendChild(cell);
          continue;
        }
        const d = cellData.d;
        cell.textContent = d;
        if (d === todayDate) cell.classList.add('today');

        const f = festByDay.get(d);
        if (f) {
          cell.classList.add(f.kind === 'holiday' ? 'hol' : 'makeup');
          cell.title = f.name || '';
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = f.kind === 'holiday' ? '假' : '班';
          cell.appendChild(tag);
        }
        frag.appendChild(cell);
      }
    }
    wrap.appendChild(frag);
  });
}

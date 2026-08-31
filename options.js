/* 设置页逻辑 v4（支持 Apple HIG 8 款精选皮肤 + 纹理质感） */
const $ = id => document.getElementById(id);
const LABELS = ['一', '二', '三', '四', '五', '六', '日']; // 周一开始
let selected = new Set([1, 2, 3, 4, 5]);

/* ---------- 皮肤与纹理状态 ---------- */
let currentSkin = 'pro';
let currentTexture = 'none';

/* ---------- HIG 静默自动保存 (Auto-Save Engine) ---------- */
let saveTimer = null;
function showSyncState(state) {
  const ind = $('sync-indicator');
  const txt = $('sync-text');
  if (!ind || !txt) return;
  if (state === 'saving') {
    ind.classList.add('saving');
    txt.textContent = '正在静默同步...';
  } else if (state === 'saved') {
    ind.classList.remove('saving');
    txt.textContent = '已自动同步 ✓';
    setTimeout(() => {
      if (!ind.classList.contains('saving')) {
        txt.textContent = '所有配置实时同步已就绪';
      }
    }, 2000);
  }
}

async function doSave() {
  showSyncState('saving');
  try {
    await CORE.saveConfig({
      workdays: [...selected],
      start: $('start').value || '09:00',
      end: $('end').value || '18:00',
      payday: Math.min(31, Math.max(1, Number($('payday').value) || 15)),
      incomeMode: $('incomeMode').value,
      dailyIncome: Math.max(0, Number($('income').value) || 0),
      monthlySalary: Math.max(0, Number($('salary').value) || 0),
      probation: $('probation').checked,
      showIncome: $('showIncome').checked,
      showBadge: $('showBadge').checked,
      notifyBeforeOff: $('notifyBeforeOff').checked,
      notifyAtOff: $('notifyAtOff').checked,
      focusEnabled: $('focusEnabled').checked,
      focusStart: $('focusStart').value || '12:00',
      focusEnd: $('focusEnd').value || '14:00',
      showWeek: $('showWeek').checked,
      theme: $('theme').value,
      skin: currentSkin,
      texture: currentTexture,
      glassOpacity: $('glassOpacity') ? (isNaN(parseInt($('glassOpacity').value, 10)) ? 65 : parseInt($('glassOpacity').value, 10)) : 65,
      eventSlot: $('eventSlot').value,
      cards: cardsOrder.filter(k => k === 'income' ? true : !cardsHidden.has(k)),
      events: events.map(e => ({ name: e.name, date: e.date, repeatYearly: !!e.repeatYearly })),
    });
    showSyncState('saved');
  } catch (err) {
    console.error('Auto-save error:', err);
  }
}

function autoSave(delay = 0) {
  clearTimeout(saveTimer);
  if (delay === 0) {
    doSave();
  } else {
    showSyncState('saving');
    saveTimer = setTimeout(doSave, delay);
  }
}


function renderSkinGrid() {
  const grid = $('skin-grid');
  if (!grid || typeof THEME === 'undefined') return;
  grid.innerHTML = '';
  // 注意：必须用 SKIN_LIST（纯数组）遍历，不要用 SKINS（混血结构：数组+字符串 key）
  // 否则 Object.keys 会把 13 个数字索引 + 13 个字符串 key 共 26 项全部渲染，导致皮肤卡片重复
  const skins = THEME.SKIN_LIST;
  skins.forEach(s => {
    const key = s.key;
    const card = document.createElement('div');
    card.className = 'skin-card' + (key === currentSkin ? ' active' : '');
    card.title = s.desc;

    const ring = document.createElement('div');
    ring.className = 'skin-ring';
    ring.style.backgroundColor = s.colors.light.accent;

    const name = document.createElement('span');
    name.className = 'skin-name';
    name.textContent = s.name;

    const sub = document.createElement('span');
    sub.className = 'skin-sub';
    sub.textContent = s.sub;

    card.appendChild(ring);
    card.appendChild(name);
    card.appendChild(sub);

    card.addEventListener('click', () => {
      currentSkin = key;
      document.querySelectorAll('.skin-card').forEach(el => el.classList.remove('active'));
      card.classList.add('active');
      previewTheme();
      autoSave(0);
    });
    grid.appendChild(card);
  });
}

function setupTextures() {
  const chips = document.querySelectorAll('.texture-chip');
  chips.forEach(btn => {
    btn.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentTexture = btn.dataset.tex || 'none';
      previewTheme();
    });
  });
}

function updateTextureUI(tex) {
  document.querySelectorAll('.texture-chip').forEach(btn => {
    if (btn.dataset.tex === tex) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function getOpacityLabel(val) {
  if (val === 0) return '0% (全透明空气)';
  if (val <= 20) return `${val}% (极透)`;
  if (val <= 45) return `${val}% (轻透)`;
  if (val <= 75) return `${val}% (透润)`;
  if (val <= 95) return `${val}% (磨砂)`;
  return '100% (纯色)';
}

function updateGlassOpacityUI(val) {
  const lbl = $('glassOpacityVal');
  if (lbl) lbl.textContent = getOpacityLabel(val);
}

function previewTheme(overrides = {}) {
  if (typeof THEME === 'undefined') return;
  const rawInput = $('glassOpacity') ? parseInt($('glassOpacity').value, 10) : 65;
  const curOpacity = overrides.glassOpacity !== undefined 
    ? overrides.glassOpacity 
    : (isNaN(rawInput) ? 65 : rawInput);
  THEME.applyToDOM({
    theme: $('theme').value,
    skin: currentSkin,
    texture: currentTexture,
    glassOpacity: curOpacity
  }, document.documentElement);
}

/* ---------- 卡片自定义（排序 + 显隐） ---------- */
const CARD_NAMES = {
  payday: '发薪', friday: '周五', holiday: '节日', income: '今天赚了',
};
let cardsOrder = ['payday', 'friday', 'holiday', 'income'];
let cardsHidden = new Set();

function renderCardsEditor() {
  const box = $('cards-editor');
  if (!box) return;
  box.innerHTML = '';
  cardsOrder.forEach((key, idx) => {
    const row = document.createElement('div');
    row.className = 'card-row';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = CARD_NAMES[key] || key;

    const up = document.createElement('button');
    up.textContent = '↑';
    up.title = '上移';
    up.disabled = idx === 0;
    up.addEventListener('click', () => moveCard(idx, -1));

    const down = document.createElement('button');
    down.textContent = '↓';
    down.title = '下移';
    down.disabled = idx === cardsOrder.length - 1;
    down.addEventListener('click', () => moveCard(idx, 1));

    const eye = document.createElement('button');
    const isHidden = key === 'income' ? !$('showIncome').checked : cardsHidden.has(key);
    eye.className = isHidden ? 'off' : 'on';
    eye.textContent = isHidden ? '🙈 隐藏' : '👁 显示';
    eye.addEventListener('click', () => toggleCard(key));

    row.appendChild(name);
    row.appendChild(up);
    row.appendChild(down);
    row.appendChild(eye);
    box.appendChild(row);
  });
}

function moveCard(fromIdx, dir) {
  const toIdx = fromIdx + dir;
  if (toIdx < 0 || toIdx >= cardsOrder.length) return;
  const tmp = cardsOrder[fromIdx];
  cardsOrder[fromIdx] = cardsOrder[toIdx];
  cardsOrder[toIdx] = tmp;
  renderCardsEditor();
  autoSave(0);
}

function toggleCard(key) {
  if (key === 'income') {
    $('showIncome').checked = !$('showIncome').checked;
  } else {
    cardsHidden.has(key) ? cardsHidden.delete(key) : cardsHidden.add(key);
  }
  renderCardsEditor();
  autoSave(0);
}

/* ---------- 自定义倒数日 ---------- */
let events = [];

function renderEvents() {
  const box = $('events-list');
  if (!box) return;
  box.innerHTML = '';
  events.forEach((ev, i) => {
    const row = document.createElement('div');
    row.className = 'event-item';
    const nm = document.createElement('span');
    nm.className = 'ev-name-text';
    nm.textContent = ev.name;
    const dt = document.createElement('span');
    dt.className = 'ev-date-text';
    dt.textContent = ev.date + (ev.repeatYearly ? ' · 每年' : '');
    const rep = document.createElement('button');
    rep.className = 'chip';
    rep.style.padding = '4px 10px';
    rep.textContent = ev.repeatYearly ? '重复:开' : '重复:关';
    rep.addEventListener('click', () => { ev.repeatYearly = !ev.repeatYearly; renderEvents(); autoSave(0); });
    const del = document.createElement('button');
    del.className = 'chip del';
    del.style.padding = '4px 10px';
    del.textContent = '删除';
    del.addEventListener('click', () => { events.splice(i, 1); renderEvents(); autoSave(0); });
    row.appendChild(nm); row.appendChild(dt); row.appendChild(rep); row.appendChild(del);
    box.appendChild(row);
  });
  $('ev-repeat-hint').textContent = '添加后可在列表中切换';
}

$('ev-add')?.addEventListener('click', () => {
  const name = $('ev-name').value.trim();
  const date = $('ev-date').value;
  if (!name || !date) return;
  if (events.length >= 6) {
    alert('最多添加 6 个倒数日');
    return;
  }
  events.push({ name, date });
  $('ev-name').value = '';
  $('ev-date').value = '';
  renderEvents();
  autoSave(0);
});

/* ---------- 收入模式切换 ---------- */
function refreshIncomeMode() {
  const mode = $('incomeMode').value;
  $('daily-input-wrap').style.display = mode === 'daily' ? '' : 'none';
  $('monthly-input-wrap').style.display = mode === 'monthly' ? 'flex' : 'none';
}
$('incomeMode')?.addEventListener('change', refreshIncomeMode);

/* ---------- 专注模式（勿扰时段） ---------- */
function syncFocusTimeUI() {
  const on = !!(($('focusEnabled')) && $('focusEnabled').checked);
  $('focus-time-wrap').style.display = on ? 'flex' : 'none';
}
$('focusEnabled')?.addEventListener('change', () => {
  syncFocusTimeUI();
  autoSave(0);
});

/* ---------- 工作日胶囊 ---------- */
function renderChips() {
  const box = $('workdays');
  box.innerHTML = '';
  const order = [1, 2, 3, 4, 5, 6, 0];
  order.forEach(d => {
    const b = document.createElement('button');
    b.className = 'chip' + (selected.has(d) ? ' on' : '');
    b.textContent = LABELS[(d + 6) % 7];
    b.addEventListener('click', () => {
      selected.has(d) ? selected.delete(d) : selected.add(d);
      b.classList.toggle('on');
    });
    box.appendChild(b);
  });
}

/* ---------- 初始化 ---------- */
async function init() {
  const cfg = await CORE.loadConfig();
  selected = new Set(cfg.workdays);
  $('start').value = cfg.start;
  $('end').value = cfg.end;
  $('payday').value = cfg.payday;
  $('incomeMode').value = cfg.incomeMode || 'daily';
  $('income').value = cfg.dailyIncome;
  $('salary').value = cfg.monthlySalary;
  $('probation').checked = !!cfg.probation;
  $('showIncome').checked = !!cfg.showIncome;
  $('showBadge').checked = !!cfg.showBadge;
  $('notifyBeforeOff').checked = !!cfg.notifyBeforeOff;
  $('notifyAtOff').checked = !!cfg.notifyAtOff;
  $('focusEnabled').checked = !!cfg.focusEnabled;
  $('focusStart').value = cfg.focusStart || '12:00';
  $('focusEnd').value = cfg.focusEnd || '14:00';
  $('showWeek').checked = cfg.showWeek !== false;
  syncFocusTimeUI();
  $('theme').value = cfg.theme || 'light';
  $('eventSlot').value = cfg.eventSlot || 'holiday';

  currentSkin = cfg.skin || 'pro';
  currentTexture = cfg.texture || 'none';

  const opVal = typeof cfg.glassOpacity === 'number' ? cfg.glassOpacity : 65;
  if ($('glassOpacity')) {
    $('glassOpacity').value = opVal;
    updateGlassOpacityUI(opVal);
  }

  cardsOrder = Array.isArray(cfg.cards) ? [...cfg.cards] : ['payday', 'friday', 'holiday', 'income'];
  Object.keys(CARD_NAMES).forEach(k => { if (!cardsOrder.includes(k)) cardsOrder.push(k); });
  cardsOrder = cardsOrder.filter(k => CARD_NAMES[k]);
  events = Array.isArray(cfg.events) ? [...cfg.events] : [];

  renderSkinGrid();
  setupTextures();
  updateTextureUI(currentTexture);
  previewTheme({ glassOpacity: opVal });

  refreshIncomeMode();
  renderChips();
  renderCardsEditor();
  renderEvents();
}

$('glassOpacity')?.addEventListener('input', (e) => {
  const parsed = parseInt(e.target.value, 10);
  const val = isNaN(parsed) ? 65 : parsed;
  updateGlassOpacityUI(val);
  previewTheme({ glassOpacity: val });
  autoSave(120);
});

$('theme')?.addEventListener('change', () => {
  previewTheme();
  autoSave(0);
});

/* ---------- 保存 ---------- */
$('save').addEventListener('click', async () => {
  await CORE.saveConfig({
    workdays: [...selected],
    start: $('start').value || '09:00',
    end: $('end').value || '18:00',
    payday: Math.min(31, Math.max(1, Number($('payday').value) || 15)),
    incomeMode: $('incomeMode').value,
    dailyIncome: Math.max(0, Number($('income').value) || 0),
    monthlySalary: Math.max(0, Number($('salary').value) || 0),
    probation: $('probation').checked,
    showIncome: $('showIncome').checked,
    showBadge: $('showBadge').checked,
    notifyBeforeOff: $('notifyBeforeOff').checked,
    notifyAtOff: $('notifyAtOff').checked,
    focusEnabled: $('focusEnabled').checked,
    focusStart: $('focusStart').value || '12:00',
    focusEnd: $('focusEnd').value || '14:00',
    showWeek: $('showWeek').checked,
    theme: $('theme').value,
    skin: currentSkin,
    texture: currentTexture,
    glassOpacity: $('glassOpacity') ? (isNaN(parseInt($('glassOpacity').value, 10)) ? 65 : parseInt($('glassOpacity').value, 10)) : 65,
    eventSlot: $('eventSlot').value,
    cards: cardsOrder.filter(k => k === 'income' ? true : !cardsHidden.has(k)),
    events: events.map(e => ({ name: e.name, date: e.date, repeatYearly: !!e.repeatYearly })),
  });
  const t = $('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
});

$('showIncome')?.addEventListener('change', renderCardsEditor);

/* ---------- 节假日联网更新 ---------- */
async function refreshHolidayStatus() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const { holidayCache } = await chrome.storage.local.get('holidayCache');
  const el = $('holiday-status');
  const sub = $('holiday-sub');
  if (!holidayCache) {
    el.textContent = '使用内置 2026 年官方数据（国办发明电〔2025〕7号）';
    sub.textContent = '将在后台每日自动检查更新（假日表未发布时保持内置版）';
    return;
  }
  const dateStr = holidayCache.fetchedAt ? new Date(holidayCache.fetchedAt).toLocaleString() : '最近';
  const c = holidayCache.totalDays || holidayCache.days?.length || 0;
  el.textContent = `已同步 ${holidayCache.year || 2026} 官方节假日数据（${c} 处放假/调休）`;
  sub.textContent = `上次检查：${dateStr} · 来源 holiday-cn (jsDelivr CDN)`;
}

const syncBtn = $('sync-now');
if (syncBtn) {
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = '同步中…';
    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'syncHolidays' }, reply => {
          if (chrome.runtime.lastError) resolve({ ok: 0, error: chrome.runtime.lastError.message });
          else resolve(reply || {});
        });
      });
      if (resp && resp.ok > 0) {
        syncBtn.textContent = '更新完成 ✓';
        await refreshHolidayStatus();
      } else {
        syncBtn.textContent = '已是最新 / 跳过';
      }
    } catch {
      syncBtn.textContent = '请求失败';
    } finally {
      setTimeout(() => { syncBtn.disabled = false; syncBtn.textContent = '立即更新'; }, 2200);
    }
  });
}

init();
refreshHolidayStatus();


// 恢复出厂设置
$('reset-default')?.addEventListener('click', async () => {
  if (confirm('确定要恢复出厂推荐设置吗？这将重设时间、皮肤与小组件。')) {
    chrome.storage.sync.clear(async () => {
      alert('已恢复出厂设置');
      location.reload();
    });
  }
});

// 各输入项无感监听
['start', 'end', 'payday', 'income', 'salary', 'focusStart', 'focusEnd'].forEach(id => {
  $(id)?.addEventListener('input', () => autoSave(400));
  $(id)?.addEventListener('change', () => autoSave(0));
});

['incomeMode', 'theme', 'eventSlot'].forEach(id => {
  $(id)?.addEventListener('change', () => autoSave(0));
});

['probation', 'showIncome', 'showWeek', 'showBadge', 'notifyBeforeOff', 'notifyAtOff'].forEach(id => {
  $(id)?.addEventListener('change', () => autoSave(0));
});

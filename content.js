(function() {
  'use strict';

  // 避免在同一个页面重复注入
  if (window.__OFFWORK_COUNTDOWN_ISLAND_INJECTED__) return;
  window.__OFFWORK_COUNTDOWN_ISLAND_INJECTED__ = true;

  let shadowHost = null;
  let shadowRoot = null;
  let islandEl = null;
  let timerId = null;
  let isVisible = false;
  let currentCfg = null;

  function fmtTime(sec) {
    if (typeof sec !== 'number' || isNaN(sec) || sec < 0) return '00:00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // 1. 初始化 Shadow DOM 容器（完全隔离宿主网页的样式）
  function setupDOM() {
    if (shadowHost) return;

    shadowHost = document.createElement('div');
    shadowHost.id = '__offwork_countdown_island_host__';
    shadowHost.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
    
    // 挂载到 html 或 body
    (document.fullscreenElement || document.body || document.documentElement).appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    // 2. 注入苹果 HIG 纯正大圆角毛玻璃样式
    const style = document.createElement('style');
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      .island-shell {
        pointer-events: auto;
        position: fixed;
        top: 24px;
        right: 24px;
        width: 324px;
        border-radius: 26px; /* 纯正 iOS 26px 连续曲率超椭圆大圆角 */
        background: var(--island-bg, transparent);
        backdrop-filter: var(--island-filter, none);
        -webkit-backdrop-filter: var(--island-filter, none);
        border: 0.5px solid var(--island-border, rgba(0, 0, 0, 0.08));
        box-shadow: var(--island-shadow, 0 12px 32px -4px rgba(0, 0, 0, 0.12));
        padding: 14px 18px 16px;
        color: var(--island-text, #1d1d1f);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "HarmonyOS Sans SC", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        user-select: none;
        opacity: 0;
        transform: translateY(-16px) scale(0.96);
        transform-origin: top right;
        transition: opacity .35s cubic-bezier(0.16, 1, 0.3, 1), 
                    transform .35s cubic-bezier(0.16, 1, 0.3, 1),
                    background .25s ease,
                    width .32s cubic-bezier(0.16, 1, 0.3, 1),
                    border-radius .32s cubic-bezier(0.16, 1, 0.3, 1),
                    padding .32s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .island-shell.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      /* 双击缩小成顶部胶囊形态 */
      .island-shell.mini {
        width: 148px;
        border-radius: 999px;
        padding: 8px 16px;
        gap: 0;
        cursor: pointer;
      }
      .island-shell.mini .island-header,
      .island-shell.mini .sub-badge,
      .island-shell.mini .progress-wrap,
      .island-shell.mini .income-box,
      .island-shell.mini .widget-grid,
      .island-shell.mini .island-foot {
        display: none !important;
      }
      .island-shell.mini .time-row {
        padding: 0;
      }
      .island-shell.mini .clock-num {
        font-size: 22px;
        font-weight: 500;
        letter-spacing: -0.5px;
        line-height: 1.2;
      }

      /* 顶部手柄 + 极简收起按钮 */
      .island-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: grab;
        padding: 0 2px 2px;
      }
      .island-header:active { cursor: grabbing; }
      
      .handle-pill {
        width: 38px;
        height: 4.5px;
        border-radius: 99px;
        background: rgba(0, 0, 0, 0.16);
        margin-left: 14px;
        transition: background .2s ease;
      }
      .dark .handle-pill { background: rgba(255, 255, 255, 0.28); }

      .close-btn {
        background: rgba(0, 0, 0, 0.05);
        border: none;
        color: var(--island-sub, #86868b);
        width: 20px;
        height: 20px;
        border-radius: 50%;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all .2s ease;
      }
      .close-btn:hover {
        background: rgba(0, 0, 0, 0.12);
        color: var(--island-text, #1d1d1f);
      }
      .dark .close-btn { background: rgba(255, 255, 255, 0.1); }
      .dark .close-btn:hover { background: rgba(255, 255, 255, 0.2); }

      /* 核心倒计时数字区 */
      .time-row {
        text-align: center;
        padding: 2px 0 4px;
      }
      .sub-badge {
        font-size: 11.5px;
        color: var(--island-sub, #86868b);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 3px;
        font-weight: 500;
      }
      .sub-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--island-accent, #0071e3);
      }
      .clock-num {
        font-size: 40px;
        font-weight: 280;
        letter-spacing: -1px;
        font-variant-numeric: tabular-nums;
        line-height: 1.05;
        color: var(--island-text, #1d1d1f);
        transition: font-size .2s ease;
      }

      /* 胶囊进度槽 */
      .progress-capsule-bg {
        height: 8px;
        background: rgba(0, 0, 0, 0.06);
        border-radius: 99px;
        overflow: hidden;
        position: relative;
        box-shadow: inset 0 1px 2px rgba(0,0,0,0.06);
      }
      .dark .progress-capsule-bg { background: rgba(255, 255, 255, 0.1); }
      
      .progress-capsule-fill {
        height: 100%;
        border-radius: 99px;
        background: linear-gradient(90deg, var(--island-accent, #0071e3), var(--island-accent-glow, #34c759));
        box-shadow: 0 0 8px var(--island-accent-shadow, rgba(0,113,227,0.3));
        transition: width .4s ease;
      }

      /* 收益横向微胶囊 */
      .income-box {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 9px 13px;
        border-radius: 14px;
        background: var(--tile-bg, rgba(255, 255, 255, 0.45));
        backdrop-filter: blur(12px);
        border: 0.5px solid var(--tile-border, rgba(255, 255, 255, 0.55));
        box-shadow: 0 2px 8px rgba(0,0,0,0.02);
      }
      .income-label { font-size: 11.5px; color: var(--island-sub, #86868b); }
      .income-val { font-size: 13px; font-weight: 600; color: var(--island-accent, #0071e3); font-variant-numeric: tabular-nums; }

      /* 小方块网格 (4 项) */
      .widget-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      .mini-tile {
        border-radius: 12px;
        padding: 7px 4px 6px;
        text-align: center;
        background: var(--tile-bg, rgba(255, 255, 255, 0.45));
        backdrop-filter: blur(12px);
        border: 0.5px solid var(--tile-border, rgba(255, 255, 255, 0.55));
        box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        transition: transform .15s ease;
      }
      .mini-tile:hover { transform: translateY(-1px); }
      .dark .mini-tile {
        background: rgba(45, 45, 48, 0.55);
        border-color: rgba(255, 255, 255, 0.1);
      }
      .tile-label { font-size: 10px; color: var(--island-sub, #86868b); margin-bottom: 2px; }
      .tile-number { font-size: 14.5px; font-weight: 600; color: var(--island-text, #1d1d1f); }
      .tile-unit { font-size: 9px; font-weight: normal; margin-left: 1px; color: var(--island-sub, #86868b); }

      /* 底部快捷提示 */
      .island-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10.5px;
        color: var(--island-sub, #86868b);
        padding-top: 1px;
      }
      .hotkey-hint {
        background: rgba(0,0,0,0.05);
        padding: 2px 6px;
        border-radius: 6px;
        font-family: monospace;
        font-size: 9.5px;
      }
      .dark .hotkey-hint { background: rgba(255,255,255,0.1); }
    `;
    shadowRoot.appendChild(style);

    const island = document.createElement('div');
    island.className = 'island-shell';
    island.id = 'apple-vibrancy-island';
    island.innerHTML = `
      <div class="island-header" id="drag-handle">
        <div style="width:20px"></div>
        <div class="handle-pill"></div>
        <button class="close-btn" id="close-island" title="收起 (Alt+W)">✕</button>
      </div>

      <div class="time-row">
        <div class="sub-badge"><span class="sub-dot"></span><span id="isl-status">下班倒计时</span></div>
        <div class="clock-num" id="isl-time">00:00:00</div>
      </div>

      <div class="progress-wrap">
        <div class="progress-capsule-bg">
          <div class="progress-capsule-fill" id="isl-progress" style="width: 0%"></div>
        </div>
      </div>

      <div class="income-box" id="isl-income-box">
        <span class="income-label">今日已获得收益</span>
        <span class="income-val" id="isl-income">¥ 0.00</span>
      </div>

      <div class="income-box" id="isl-week-box">
        <span class="income-label">本周剩余工时</span>
        <span class="income-val" id="isl-week">0 小时</span>
      </div>

      <div class="widget-grid" id="isl-grid">
        <!-- 动态生成 4 项小方块 -->
      </div>

      <div class="island-foot">
        <span id="isl-slot-tip">工作日 09:00 – 18:00</span>
        <span class="hotkey-hint">Alt+W</span>
      </div>
    `;

    shadowRoot.appendChild(island);
    islandEl = island;

    // 绑定关闭
    shadowRoot.getElementById('close-island').addEventListener('click', hideIsland);

    // 绑定拖拽（整个面板可拖，含胶囊形态）
    setupDrag(island);

    // 双击：在完整岛与顶部胶囊形态之间切换
    island.addEventListener('dblclick', (e) => {
      e.preventDefault();
      island.classList.toggle('mini');
      tick();
    });
  }

  // 3. 拖拽逻辑与吸附防出界（绑定整个面板，完整形态与胶囊形态均可拖动）
  function setupDrag(panel) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let origTop = 0, origLeft = 0;

    panel.addEventListener('mousedown', (e) => {
      // 关闭按钮不触发拖拽
      if (e.target && e.target.closest && e.target.closest('.close-btn')) return;
      // 双击切换胶囊形态时不触发拖拽（双击时两次 mousedown 几乎无位移，可忽略）
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      panel.style.transition = 'none'; // 拖拽时禁过渡保证跟手
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      let left = origLeft + (e.clientX - startX);
      let top = origTop + (e.clientY - startY);

      // 防出屏幕
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;

      left = Math.max(10, Math.min(winW - w - 10, left));
      top = Math.max(10, Math.min(winH - h - 10, top));

      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.right = 'auto';
    }

    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      panel.style.transition = 'opacity .35s cubic-bezier(0.16, 1, 0.3, 1), transform .35s cubic-bezier(0.16, 1, 0.3, 1), background .25s ease, width .32s cubic-bezier(0.16, 1, 0.3, 1), border-radius .32s cubic-bezier(0.16, 1, 0.3, 1), padding .32s cubic-bezier(0.16, 1, 0.3, 1)';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }

  // 4. 数据更新与毛玻璃渲染
  async function tick() {
    if (!isVisible || !islandEl) return;
    try {
      if (!currentCfg) currentCfg = await CORE.loadConfig();
      const now = new Date();
      const snap = CORE.snapshot(now, currentCfg);
      const themeRes = THEME.resolveTheme(currentCfg);

      // 应用深浅模式与通透度变量
      islandEl.classList.toggle('dark', themeRes.isDark);
      
      const opacity = typeof currentCfg.glassOpacity === 'number' ? currentCfg.glassOpacity / 100 : 0.65;
      const blurPx = Math.round(opacity * 28);
      const filterVal = blurPx > 0 ? `blur(${blurPx}px) saturate(${100 + Math.round(opacity * 90)}%)` : 'none';
      const bgRgb = themeRes.isDark ? '28, 28, 32' : '255, 255, 255';
      const tileOpacity = (opacity * 0.55).toFixed(2);
      
      islandEl.style.setProperty('--island-bg', opacity > 0 ? `rgba(${bgRgb}, ${opacity})` : 'transparent');
      islandEl.style.setProperty('--island-filter', filterVal);
      islandEl.style.setProperty('--island-border', opacity > 0 
        ? (themeRes.isDark ? `rgba(255,255,255,${Math.max(0.04, opacity * 0.16)})` : `rgba(255,255,255,${Math.max(0.18, opacity * 0.75)})`)
        : (themeRes.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'));
      islandEl.style.setProperty('--island-shadow', opacity > 0
        ? `0 20px 48px -6px rgba(0,0,0,${Math.min(0.25, opacity * 0.3)}), 0 1px 3px rgba(0,0,0,0.05), inset 0 1px 1px 0 rgba(255,255,255,${opacity * 0.85})`
        : '0 8px 28px -4px rgba(0, 0, 0, 0.12)');
      islandEl.style.setProperty('--tile-bg', opacity > 0 ? `rgba(${bgRgb}, ${tileOpacity})` : 'transparent');
      islandEl.style.setProperty('--tile-border', opacity > 0 
        ? (themeRes.isDark ? `rgba(255,255,255,${Math.max(0.03, opacity * 0.12)})` : `rgba(255,255,255,${Math.max(0.12, opacity * 0.6)})`)
        : 'transparent');
      islandEl.style.setProperty('--island-text', themeRes.textPrimary);
      islandEl.style.setProperty('--island-sub', themeRes.textSecondary);
      islandEl.style.setProperty('--island-accent', themeRes.accent);
      islandEl.style.setProperty('--island-accent-glow', themeRes.accent);
      islandEl.style.setProperty('--island-accent-shadow', `${themeRes.accent}40`);

      // 更新时间与提示（mini 胶囊形态字号更紧凑）
      const isMini = islandEl.classList.contains('mini');
      const timeEl = shadowRoot.getElementById('isl-time');
      const statusEl = shadowRoot.getElementById('isl-status');
      const progEl = shadowRoot.getElementById('isl-progress');

      if (snap.status.key === 'rest') {
        statusEl.textContent = '今日休息中';
        timeEl.textContent = '休息中';
        timeEl.style.fontSize = isMini ? '18px' : '26px';
        progEl.style.width = '100%';
      } else if (snap.status.key === 'before') {
        statusEl.textContent = '距离上班开始还有';
        timeEl.textContent = fmtTime(snap.countdown);
        timeEl.style.fontSize = isMini ? '22px' : '40px';
        progEl.style.width = '0%';
      } else if (snap.status.key === 'after') {
        statusEl.textContent = '今日工作已顺利结束';
        timeEl.textContent = '已下班 🎉';
        timeEl.style.fontSize = isMini ? '18px' : '30px';
        progEl.style.width = '100%';
      } else {
        statusEl.textContent = '距离今日下班还有';
        timeEl.textContent = fmtTime(snap.countdown);
        timeEl.style.fontSize = isMini ? '22px' : '40px';
        progEl.style.width = ((snap.progress || 0) * 100).toFixed(2) + '%';
      }

      // 更新收益
      const incomeBox = shadowRoot.getElementById('isl-income-box');
      if (currentCfg.showIncome && snap.cards && snap.cards.income) {
        incomeBox.style.display = 'flex';
        shadowRoot.getElementById('isl-income').textContent = '¥ ' + snap.cards.income.value;
      } else {
        incomeBox.style.display = 'none';
      }

      // 更新本周剩余工时
      const weekBox = shadowRoot.getElementById('isl-week-box');
      if (currentCfg.showWeek !== false && typeof snap.weekRemaining === 'number') {
        weekBox.style.display = 'flex';
        shadowRoot.getElementById('isl-week').textContent = snap.weekRemaining + ' 小时';
      } else {
        weekBox.style.display = 'none';
      }

      // 渲染小方块（发薪、周五、节假日、自定义纪念日）
      const grid = shadowRoot.getElementById('isl-grid');
      const cardList = [];
      const activeKeys = (currentCfg.cards || ['payday', 'friday', 'holiday']).filter(k => k !== 'income');
      activeKeys.forEach(k => {
        if (snap.cards && snap.cards[k]) {
          cardList.push({ label: snap.cards[k].label, value: snap.cards[k].value, unit: snap.cards[k].unit });
        }
      });
      if (snap.eventCard) {
        cardList.push({ label: snap.eventCard.label, value: snap.eventCard.value, unit: snap.eventCard.unit });
      }

      grid.innerHTML = '';
      cardList.slice(0, 4).forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'mini-tile';
        tile.innerHTML = `
          <div class="tile-label">${item.label}</div>
          <div class="tile-number">${item.value}<span class="tile-unit">${item.unit || ''}</span></div>
        `;
        grid.appendChild(tile);
      });

      // 底部工作时间
      shadowRoot.getElementById('isl-slot-tip').textContent = `工作日 ${currentCfg.start} – ${currentCfg.end}`;
    } catch (err) {
      console.error('Island tick error:', err);
    }
  }

  // 5. 展示与隐藏
  function showIsland() {
    if (!islandEl) setupDOM();
    isVisible = true;
    islandEl.classList.add('visible');
    tick();
    if (!timerId) timerId = setInterval(tick, 1000);
  }

  function hideIsland() {
    isVisible = false;
    if (islandEl) islandEl.classList.remove('visible');
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function toggleIsland() {
    if (isVisible) hideIsland();
    else showIsland();
  }

  // 6. 监听来自 Background / Popup 的消息
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'toggle-float-widget') {
      toggleIsland();
      sendResponse({ status: 'ok', isVisible });
    } else if (req.action === 'show-float-widget') {
      showIsland();
      sendResponse({ status: 'ok', isVisible: true });
    } else if (req.action === 'hide-float-widget') {
      hideIsland();
      sendResponse({ status: 'ok', isVisible: false });
    }
    return true;
  });

  // 监听配置变更实时换肤
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'sync') {
      currentCfg = await CORE.loadConfig();
      if (isVisible) tick();
    }
  });

})();

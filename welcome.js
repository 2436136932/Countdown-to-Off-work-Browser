/* 落地页逻辑（MV3 要求：脚本必须外部引用，内联会被 CSP 拦截） */
const $ = id => document.getElementById(id);

function fmt(sec) {
  return [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60]
    .map(n => String(n).padStart(2, '0')).join(':');
}

let activeSkin = 'pro';

async function tick() {
  const cfg = await CORE.loadConfig();
  if (typeof THEME !== 'undefined') {
    THEME.applyToDOM({ ...cfg, skin: activeSkin });
  }
  const now = new Date();
  const snap = CORE.snapshot(now, cfg);
  const el = $('demo-time');
  if (el) {
    if (snap.countdown !== null) el.textContent = fmt(snap.countdown);
    else { el.textContent = snap.status.label === '已下班' ? '00:00:00' : '休息中'; }
  }
}
tick();
setInterval(tick, 1000);

// 生成落地页 8 色试色圆点
function initColorBar() {
  const bar = $('color-bar');
  if (!bar || typeof THEME === 'undefined') return;
  bar.innerHTML = '';
  THEME.SKINS.forEach(s => {
    const dot = document.createElement('div');
    dot.className = 'color-dot' + (s.id === activeSkin ? ' on' : '');
    dot.style.background = s.light.accent;
    dot.title = `${s.name} (${s.en})`;
    dot.addEventListener('click', () => {
      activeSkin = s.id;
      document.querySelectorAll('.color-dot').forEach(el => el.classList.remove('on'));
      dot.classList.add('on');
      tick();
    });
    bar.appendChild(dot);
  });
}
initColorBar();

function openOptions() {
  try { chrome.runtime.openOptionsPage(); }
  catch { location.href = 'options.html'; }
}
['nav-open-options', 'foot-open-options'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('click', e => { e.preventDefault(); openOptions(); });
});

// 在扩展环境外（如直接双击预览）时，安装按钮降级跳转 Chrome Web Store 搜索
const inExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
['nav-install', 'hero-install', 'cta-install'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('click', () => {
    if (inExtension) openOptions();
    else window.open('https://chromewebstore.google.com/search/%E4%B8%8B%E7%8F%AD%E5%80%92%E8%AE%A1%E6%97%B6', '_blank');
  });
});

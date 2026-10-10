/* ============================================================
 * 打包脚本：生成可上架的 offwork-countdown.zip
 *
 * 修复历史问题：
 *  - 清单里写了并不存在的 options.html（实际是 settings.html）；
 *  - 漏掉 content.js / content_pet.js / 5 个游戏引擎，导致 manifest 引用了
 *    zip 中不存在的文件，装上去直接加载失败。
 * 现在改为「固定清单 + manifest 交叉校验」，缺文件就明确报错，不再产出坏包。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const dir = __dirname;                       // 不再硬编码绝对路径，clone 到哪都能跑
const zipPath = path.join(dir, 'offwork-countdown.zip');

/** 运行期必需文件（必须与 manifest.json 的声明保持一致） */
const REQUIRED = [
  'manifest.json',
  // content_scripts[0]
  'core.js', 'theme.js', 'content.js',
  // content_scripts[1]：游戏引擎 + 摸鱼窗
  'xiangqi.js', 'mahjong.js', 'minesweeper.js', 'g2048.js', 'lianliankan.js', 'content_pet.js',
  // service worker
  'background.js',
  // 扩展页面
  'popup.html', 'popup.js',
  'settings.html', 'options.js',
  'welcome.html', 'welcome.js',
  // 图标目录
  'icons',
];

function main() {
  // 1. 校验清单：缺文件就报错，而不是打出一个坏包
  const missing = REQUIRED.filter(f => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    console.error('打包中止，以下文件不存在：\n  - ' + missing.join('\n  - '));
    process.exit(1);
  }

  // 2. 交叉校验：manifest 引用的每个 js/html 都必须在清单内
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const referenced = new Set();
  (manifest.content_scripts || []).forEach(cs => (cs.js || []).forEach(f => referenced.add(f)));
  if (manifest.background && manifest.background.service_worker) referenced.add(manifest.background.service_worker);
  if (manifest.action && manifest.action.default_popup) referenced.add(manifest.action.default_popup);
  if (manifest.options_ui && manifest.options_ui.page) referenced.add(manifest.options_ui.page);
  const notPacked = [...referenced].filter(f => !REQUIRED.includes(f));
  if (notPacked.length) {
    console.error('打包中止，manifest 引用了未纳入清单的文件：\n  - ' + notPacked.join('\n  - '));
    process.exit(1);
  }

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const pathsStr = REQUIRED
    .map(f => "'" + path.join(dir, f).replace(/\\/g, '/') + "'")
    .join(',');
  const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path ${pathsStr} -DestinationPath '${zipPath.replace(/\\/g, '/')}' -Force"`;
  console.log(`Packaging ${REQUIRED.length} entries...`);
  cp.execSync(psCmd, { stdio: 'inherit' });

  if (fs.existsSync(zipPath)) {
    console.log('SUCCESS: offwork-countdown.zip created, size:', fs.statSync(zipPath).size, 'bytes');
  } else {
    console.error('FAILED: zip 未生成');
    process.exit(1);
  }
}

main();
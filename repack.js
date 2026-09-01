const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const dir = 'D:/workbuddystorage/2026-08-27-11-15-17/offwork-countdown';
const zipPath = path.join(dir, 'offwork-countdown.zip');

const files = [
  'manifest.json', 'core.js', 'theme.js',
  'popup.html', 'popup.js',
  'settings.html', 'options.js',
  'background.js', 'welcome.html', 'welcome.js',
  'content.js', 'content_pet.js', 'xiangqi.js',
  'icons'
];

const psCmd = `Compress-Archive -Path ${files.map(f => `'${path.join(dir, f)}'`).join(', ')} -DestinationPath '${zipPath}' -Force`;
cp.execSync(`powershell.exe -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' });

console.log('Packaging complete. File size:', fs.statSync(zipPath).size, 'bytes');

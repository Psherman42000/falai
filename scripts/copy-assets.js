const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const files = ['notch.html', 'settings.html'];

for (const file of files) {
  const src = path.join(root, file);
  const dest = path.join(dist, file);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log('copied', file);
  }
}

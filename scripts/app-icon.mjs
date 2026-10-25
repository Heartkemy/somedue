import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'src-tauri/icons');
const source = await readFile(path.join(root, 'assets/icon/app.svg'));
await mkdir(out, { recursive: true });
for (const size of [32, 128, 256, 512, 1024]) {
  await sharp(source).resize(size, size).png().toFile(path.join(out, `${size}x${size}.png`));
}
await sharp(source).resize(1024, 1024).png().toFile(path.join(out, 'icon.png'));
await sharp(source).resize(256, 256).png().toFile(path.join(out, '128x128@2x.png'));
if (process.platform === 'darwin') {
  const iconset = path.join(out, 'Somedue.iconset');
  await mkdir(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      await sharp(source).resize(size * scale, size * scale).png().toFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
    }
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(out, 'icon.icns')]);
}
console.log('Generated Somedue icon assets from assets/icon/app.svg.');

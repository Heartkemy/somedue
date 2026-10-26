import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'src-tauri/icons');
const content = await readFile(path.join(root, 'assets/icon/carved-check.svg'), 'utf8');
// Legacy flattened ICNS: keep canvas, background inset and foreground spacing separate.
const foreground = content.replace('<svg ', '<svg x="192" y="192" ').replace('width="1024" height="1024"', 'width="640" height="640"');
const source = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="100" y="100" width="824" height="824" rx="185.4" fill="#252018"/>${foreground.trim()}</svg>\n`);
await writeFile(path.join(root, 'assets/icon/app.svg'), source);
await mkdir(out, { recursive: true });
for (const size of [32, 128, 256, 512, 1024]) {
  await sharp(source).resize(size, size).png().toFile(path.join(out, `${size}x${size}.png`));
}
await sharp(source).resize(1024, 1024).png().toFile(path.join(out, 'icon.png'));
await sharp(source).resize(256, 256).png().toFile(path.join(out, '128x128@2x.png'));
const iconset = path.join(out, 'Somedue.iconset');
await mkdir(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    await sharp(source).resize(size * scale, size * scale).png().toFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
  }
}
if (process.platform === 'darwin') {
  const temp = await mkdtemp(path.join(tmpdir(), 'somedue-icon-'));
  try {
    const nativeIconset = path.join(temp, 'Somedue.iconset');
    await cp(iconset, nativeIconset, { recursive: true });
    // iconutil stores 16/32px 1x entries as ARGB, whose RGB must be premultiplied.
    for (const size of [16, 32]) {
      const file = path.join(nativeIconset, `icon_${size}x${size}.png`);
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.round(data[i + channel] * data[i + 3] / 255);
      }
      await sharp(data, { raw: info }).png().toFile(file);
    }
    execFileSync('iconutil', ['-c', 'icns', nativeIconset, '-o', path.join(out, 'icon.icns')]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
console.log('Generated assets/icon/app.svg and Somedue icon assets from assets/icon/carved-check.svg.');

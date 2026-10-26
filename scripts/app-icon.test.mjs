import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
test('bundle icons reproduce the supplied Somedue artwork at every required size', async () => {
  const { data, info } = await sharp(path.join(root, 'src-tauri/icons/icon.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1024);
  assert.equal(info.height, 1024);
  for (const [x, y] of [[0, 0], [512, 0], [0, 512], [1023, 1023]]) {
    assert.equal(data[(y * info.width + x) * 4 + 3], 0, 'macOS icon corners and outer inset must stay transparent');
  }
  const source = await sharp(path.join(root, 'assets/icon/app.svg')).resize(1024, 1024).ensureAlpha().raw().toBuffer();
  assert.deepEqual(data, source, 'generated artwork must match the supplied SVG');
  const verify = async (file, size) => {
    const asset = path.join(root, 'src-tauri/icons', file);
    const metadata = await sharp(asset).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert.deepEqual(await sharp(asset).ensureAlpha().raw().toBuffer(),
      await sharp(path.join(root, 'assets/icon/app.svg')).resize(size, size).ensureAlpha().raw().toBuffer(), file);
  };
  for (const size of [32, 128, 256, 512, 1024]) {
    await verify(`${size}x${size}.png`, size);
  }
  await verify('128x128@2x.png', 256);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      await verify(`Somedue.iconset/icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`, size * scale);
    }
  }
  assert.equal(readFileSync(path.join(root, 'src-tauri/icons/icon.icns')).subarray(0,4).toString(), 'icns');
  if (process.platform === 'darwin') {
    const temp = await mkdtemp(path.join(tmpdir(), 'somedue-icon-'));
    try {
      const decoded = path.join(temp, 'decoded.iconset');
      execFileSync('iconutil', ['-c', 'iconset', path.join(root, 'src-tauri/icons/icon.icns'), '-o', decoded]);
      for (const size of [16, 32, 128, 256, 512]) {
        for (const scale of [1, 2]) {
          const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
          const actual = await sharp(path.join(decoded, name)).ensureAlpha().raw().toBuffer();
          const expected = await sharp(path.join(root, 'src-tauri/icons/Somedue.iconset', name)).ensureAlpha().raw().toBuffer();
          assert.equal(actual.length, expected.length, name);
          for (let i = 0; i < actual.length; i += 4) {
            assert.equal(actual[i + 3], expected[i + 3], `${name}: alpha`);
            for (let channel = 0; channel < 3; channel++) {
              // Native ARGB rounds premultiplied color; allow at most 3/255 visible error.
              const alpha = expected[i + 3] / 255;
              assert.ok(Math.abs(actual[i + channel] * alpha - expected[i + channel] * alpha) <= 3, `${name}: visible RGB`);
            }
          }
        }
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
});

test('foreground has no intrinsic margin and composition owns its spacing', async () => {
  const content = await sharp(path.join(root, 'assets/icon/carved-check.svg')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => content.data[(y * content.info.width + x) * 4 + 3];
  // The refined source is tightly cropped to the shape's 33..223 bounds.
  for (const edge of [
    (i) => alpha(i, 0), (i) => alpha(i, 1023),
    (i) => alpha(0, i), (i) => alpha(1023, i),
  ]) assert.ok(Array.from({ length: 1024 }, (_, i) => edge(i)).some((a) => a > 0));
  const { data } = await sharp(path.join(root, 'src-tauri/icons/icon.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4)];
  assert.equal(pixel(99, 512)[3], 0);
  assert.equal(pixel(924, 512)[3], 0);
  assert.deepEqual(pixel(100, 512), [37, 32, 24, 255]);
  assert.deepEqual(pixel(923, 512), [37, 32, 24, 255]);
  assert.deepEqual(pixel(191, 512), [37, 32, 24, 255]);
  assert.deepEqual(pixel(192, 512), [246, 239, 223, 255]);
  assert.deepEqual(pixel(831, 550), [246, 239, 223, 255]);
  assert.deepEqual(pixel(832, 550), [37, 32, 24, 255]);
  assert.deepEqual(pixel(644, 489), [0, 255, 208, 255], 'preserve the refined turquoise inlay');
});

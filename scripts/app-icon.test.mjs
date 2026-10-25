import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
test('bundle icons reproduce the supplied Somedue artwork at every required size', async () => {
  const { data, info } = await sharp(path.join(root, 'src-tauri/icons/icon.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1024);
  assert.equal(info.height, 1024);
  const source = await sharp(path.join(root, 'assets/icon/app.svg')).resize(1024, 1024).ensureAlpha().raw().toBuffer();
  assert.deepEqual(data, source, 'generated artwork must match the supplied SVG');
  for (const size of [32, 128, 256, 512, 1024]) {
    const metadata = await sharp(path.join(root, `src-tauri/icons/${size}x${size}.png`)).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
  }
  assert.equal((await sharp(path.join(root, 'src-tauri/icons/128x128@2x.png')).metadata()).width, 256);
  assert.equal(readFileSync(path.join(root, 'src-tauri/icons/icon.icns')).subarray(0,4).toString(), 'icns');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { photoCropBounds } = require('./load-ts.cjs')('app/lib/scan-photo-crop.ts');

test('saved image bounds contain only recognized code boxes with a two-pixel border', () => {
  assert.deepEqual(photoCropBounds(1920, 1080, [{ x0: 100, y0: 200, x1: 240, y1: 230 }]), { x: 98, y: 198, width: 144, height: 34 });
  assert.deepEqual(photoCropBounds(1920, 1080, [{ x0: 100, y0: 200, x1: 140, y1: 230 }, { x0: 145, y0: 202, x1: 240, y1: 231 }]), { x: 98, y: 198, width: 144, height: 35 });
  assert.deepEqual(photoCropBounds(100, 50, [{ x0: 0, y0: 0, x1: 99, y1: 50 }]), { x: 0, y: 0, width: 100, height: 50 });
});

test('missing or invalid recognition boxes never fall back to retaining the whole image', () => {
  for (const boxes of [[], [{ x0: NaN, y0: 0, x1: 4, y1: 4 }], [{ x0: 4, y0: 4, x1: 3, y1: 8 }], [{ x0: 200, y0: 200, x1: 300, y1: 300 }]]) {
    assert.throws(() => photoCropBounds(100, 50, boxes));
  }
});

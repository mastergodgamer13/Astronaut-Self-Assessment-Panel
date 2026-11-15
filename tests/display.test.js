const test = require('node:test'), assert = require('node:assert');
const D = require('../js/display.js');
test('clean: unknown sizes and non-boolean contrast fall back to defaults', () => {
  assert.deepStrictEqual(D.clean(null), { size: 'normal', contrast: false, night: false, sound: false });
  assert.deepStrictEqual(D.clean({ size: 'huge', contrast: 'yes' }), { size: 'normal', contrast: false, night: false, sound: false });
  assert.deepStrictEqual(D.clean({ size: 'xlarge', contrast: true, night: false, sound: false }), { size: 'xlarge', contrast: true, night: false, sound: false });
  assert.deepStrictEqual(D.SIZES, ['normal', 'large', 'xlarge']);
});

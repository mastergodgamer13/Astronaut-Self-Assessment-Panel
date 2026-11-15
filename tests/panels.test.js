'use strict';
const assert = require('assert'); const P = require('../js/panels.js'); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok - ' + name); };
const D = { left: ['users', 'checkin', 'flight'], mid: ['body'], right: ['summary', 'detail'] };
test('arrange: no saved layout keeps the defaults', () => assert.deepStrictEqual(P.arrange(D, null), D));
test('arrange: saved zone and order win; unknown panels and zones are ignored', () => {
  const r = P.arrange(D, { detail: { z: 'left', o: 0 }, ghost: { z: 'left', o: 0 }, body: { z: 'nowhere', o: 0 } });
  assert.deepStrictEqual(r, { left: ['detail', 'users', 'checkin', 'flight'], mid: ['body'], right: ['summary'] });
});
test('arrange: a new panel without saved place keeps its default zone and lands after saved ones of the same order', () => {
  const r = P.arrange({ a: ['x', 'y', 'z'] }, { z: { z: 'a', o: 0 }, x: { z: 'a', o: 1 } }); // y is new (default order 1)
  assert.deepStrictEqual(r.a.sort(), ['x', 'y', 'z']); assert.strictEqual(r.a.length, 3);
});
test('move: up / down inside a zone, stops at the ends', () => {
  assert.deepStrictEqual(P.move(D, 'checkin', 'up').left, ['checkin', 'users', 'flight']);
  assert.deepStrictEqual(P.move(D, 'checkin', 'down').left, ['users', 'flight', 'checkin']);
  assert.deepStrictEqual(P.move(D, 'users', 'up').left, ['users', 'checkin', 'flight']);
});
test('move: left / right goes to the neighbouring zone (appended); no change at the edge; input is not mutated', () => {
  const r = P.move(D, 'flight', 'right', ['left', 'mid', 'right']);
  assert.deepStrictEqual(r.left, ['users', 'checkin']); assert.deepStrictEqual(r.mid, ['body', 'flight']); assert.deepStrictEqual(D.left, ['users', 'checkin', 'flight']);
  assert.deepStrictEqual(P.move(D, 'users', 'left', ['left', 'mid', 'right']), D);
});
test('drop: before another panel, at the end, into another zone; unknown zone changes nothing', () => {
  assert.deepStrictEqual(P.drop(D, 'detail', 'left', 'checkin').left, ['users', 'detail', 'checkin', 'flight']);
  assert.deepStrictEqual(P.drop(D, 'users', 'right', null).right, ['summary', 'detail', 'users']);
  assert.strictEqual(P.drop(D, 'users', 'nope', null), D);
});
test('serialize / arrange round trip, minimized list kept', () => {
  const s = P.serialize(P.move(D, 'detail', 'left', ['left', 'mid', 'right']), { detail: true, users: false });
  assert.deepStrictEqual(s.min, ['detail']); assert.deepStrictEqual(P.arrange(D, s.panels), P.move(D, 'detail', 'left', ['left', 'mid', 'right']));
});
console.log(n + ' panels tests passed');

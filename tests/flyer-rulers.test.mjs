import test from "node:test";
import assert from "node:assert/strict";
import { rulerInterval, rulerTicks, rulerBitmapSize } from "../interno/encartes/editor/rulers.js";

test("ruler zero tracks the document origin and pan in viewport coordinates", () => {
  const centered = rulerTicks({ length: 700, origin: 123, scale: 0.5 });
  assert.equal(centered.find((tick) => tick.value === 0).position, 123);
  const panned = rulerTicks({ length: 700, origin: -77, scale: 0.5 });
  assert.equal(panned.find((tick) => tick.value === 200).position, 23);
  assert(panned.every((tick) => tick.position >= 0 && tick.position <= 700));
  assert(centered.some((tick) => tick.value < 0));
});

test("document pixels remain correct under fractional zoom and negative pan", () => {
  for (const scale of [0.05, 0.3333, 0.75, 1, 2.5, 12]) {
    const origin = -185.25;
    const ticks = rulerTicks({ length: 1024, origin, scale });
    for (const tick of ticks) assert(Math.abs((tick.position - origin) / scale - tick.value) < 1e-7);
    const majors = ticks.filter((tick) => tick.major);
    assert(majors.length > 2);
    assert(majors[1].position - majors[0].position >= 72 - 1e-8);
    assert(majors[1].position - majors[0].position <= 180 + 1e-8);
  }
});

test("zoom selects readable round intervals, with five minor divisions", () => {
  assert.equal(rulerInterval(1), 100);
  assert.equal(rulerInterval(0.5), 200);
  assert.equal(rulerInterval(2), 50);
  const ticks = rulerTicks({ length: 100, origin: 0, scale: 1 });
  assert.deepEqual(
    ticks.map((tick) => tick.value),
    [0, 20, 40, 60, 80, 100],
  );
  assert.deepEqual(
    ticks.filter((tick) => tick.major).map((tick) => tick.value),
    [0, 100],
  );
  for (const scale of [0, -1, NaN, Infinity]) assert.deepEqual(rulerTicks({ length: 800, origin: 0, scale }), []);
});

test("DPR changes bitmap resolution without changing document positions", () => {
  assert.deepEqual(rulerBitmapSize(401.5, 22, 2), { width: 803, height: 44, ratio: 2 });
  assert.deepEqual(rulerBitmapSize(100, 22, 1.25), { width: 125, height: 28, ratio: 1.25 });
  assert.equal(rulerBitmapSize(100, 22, NaN).ratio, 1);
  const logical = rulerTicks({ length: 401.5, origin: 23.5, scale: 0.75 });
  assert.equal(logical.find((tick) => tick.value === 0).position, 23.5);
});

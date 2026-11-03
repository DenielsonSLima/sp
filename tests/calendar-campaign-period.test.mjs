import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignPeriod } from '../interno/calendario/queries.js';

test('campaign query covers the visible adjacent days and leap-year month, without the whole history', () => {
  assert.deepEqual(campaignPeriod('2026-11-01'), { start: '2026-10-26', end: '2026-12-06' });
  assert.deepEqual(campaignPeriod('2024-02-01'), { start: '2024-01-29', end: '2024-03-03' });
});

test('campaign range stays inside supported calendar dates at year boundaries', () => {
  assert.deepEqual(campaignPeriod('0001-01-01'), { start: '0001-01-01', end: '0001-02-04' });
  assert.deepEqual(campaignPeriod('9999-12-01'), { start: '9999-11-29', end: '9999-12-31' });
});

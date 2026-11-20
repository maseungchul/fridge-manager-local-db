/**
 * @file
 * 유통기한 알림의 현지 날짜 계산과 날짜별 묶음 예약을 검증한다.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./helpers/load-source.cjs');
const { getExpirationReminderGroups } = loadSource('src/features/ingredient/model/expirationReminder.ts');

test('유통기한 2일 전의 선택 시각에 같은 날짜 재료를 묶고 지난 시각과 날짜 미입력은 제외한다', () => {
  const now = new Date(2028, 1, 28, 16, 30).getTime();
  const ingredients = ['2028-03-02', '2028-03-01', null, '2028-03-01', '2028-02-29']
    .map(expirationDate => ({ expirationDate }));
  assert.deepEqual(getExpirationReminderGroups(ingredients, 2, 16 * 60 + 30, now), [
    { expirationDate: '2028-03-02', count: 1, scheduledAt: new Date(2028, 1, 29, 16, 30).getTime() },
  ]);
  assert.deepEqual(getExpirationReminderGroups(ingredients, 2, 17 * 60 + 20, now), [
    { expirationDate: '2028-03-01', count: 2, scheduledAt: new Date(2028, 1, 28, 17, 20).getTime() },
    { expirationDate: '2028-03-02', count: 1, scheduledAt: new Date(2028, 1, 29, 17, 20).getTime() },
  ]);
});

test('당일과 직접 설정한 날짜 모두 같은 선택 시각을 적용한다', () => {
  const ingredients = [{ expirationDate: '2028-03-03' }];
  const minutes = 17 * 60 + 20;
  const now = new Date(2028, 1, 28).getTime();
  assert.equal(getExpirationReminderGroups(ingredients, 0, minutes, now)[0].scheduledAt, new Date(2028, 2, 3, 17, 20).getTime());
  assert.equal(getExpirationReminderGroups(ingredients, 3, minutes, now)[0].scheduledAt, new Date(2028, 1, 29, 17, 20).getTime());
});

test('일광 절약 시간 전환이 있어도 48시간 대신 달력의 2일을 뺀다', () => {
  const groups = getExpirationReminderGroups([{ expirationDate: '2028-03-13' }], 2, 16 * 60 + 30, 0);
  assert.equal(groups[0].scheduledAt, new Date(2028, 2, 11, 16, 30).getTime());
});

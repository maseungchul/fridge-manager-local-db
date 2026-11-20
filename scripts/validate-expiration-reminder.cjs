/**
 * @file
 * 유통기한 알림의 현지 날짜 계산과 날짜별 묶음 예약을 검증한다.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./helpers/load-source.cjs');
const { getExpirationReminderGroups, getReminderCalendarDates, getReminderDaysBefore } = loadSource('src/features/ingredient/model/expirationReminder.ts');

test('알림 캘린더는 현지의 오늘을 기준으로 저장된 날짜 차이를 복원하고 계산한다', () => {
  const calendar = getReminderCalendarDates(3, new Date(2028, 2, 1, 0, 15));
  assert.deepEqual(calendar, { today: '2028-03-01', selected: '2028-02-27' });
  assert.equal(getReminderDaysBefore(calendar.selected, calendar.today), 3);
  assert.equal(getReminderDaysBefore(calendar.today, calendar.today), 0);
  assert.deepEqual(getReminderCalendarDates(2, new Date(2028, 2, 13, 0, 15)),
    { today: '2028-03-13', selected: '2028-03-11' });
});

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

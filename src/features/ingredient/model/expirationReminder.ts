/**
 * @file
 * 유통기한 알림 설정과 재료 목록을 현지 시각 기준의 날짜별 예약으로 변환한다.
 */
import type { Ingredient } from '@/features/ingredient/model/ingredient';

/** 현지의 오늘을 기준일로 잡고 달력 날짜끼리 계산해 시차의 영향을 피한다. */
export function getReminderCalendarDates(daysBefore: number, now = new Date()) {
  const date = new Date(0);
  date.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  const today = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return { today, selected: date.getUTCFullYear() >= 1 ? date.toISOString().slice(0, 10) : null };
}

export function getReminderDaysBefore(date: string, referenceDate: string) {
  return (Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
}

export function getExpirationReminderGroups(
  ingredients: readonly Pick<Ingredient, 'expirationDate'>[], daysBefore: number, minutes: number, now = Date.now(),
) {
  const counts = new Map<string, number>();
  for (const { expirationDate } of ingredients) {
    if (expirationDate) counts.set(expirationDate, (counts.get(expirationDate) ?? 0) + 1);
  }

  const groups = [];
  for (const [expirationDate, count] of counts) {
    // 날짜의 자정을 UTC로 해석하면 일부 시간대에서 예정일이 하루 당겨진다.
    const date = new Date(`${expirationDate}T12:00:00`);
    date.setDate(date.getDate() - daysBefore);
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    const scheduledAt = date.getTime();
    if (scheduledAt > now) groups.push({ expirationDate, count, scheduledAt });
  }
  return groups.sort((left, right) => left.scheduledAt - right.scheduledAt);
}

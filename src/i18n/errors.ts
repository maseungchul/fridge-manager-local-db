/**
 * @file
 * 저장·검증 오류의 번역 키와 치환값을 유지하고 표시할 때 현재 언어로 변환한다.
 * 기존 DB 트리거 문구만 식별하며 알 수 없는 오류는 화면의 공통 안내로 표시한다.
 */
import { defaultTranslate } from '@/i18n/translations';
import type { TranslationArgs, TranslationKey, Translator } from '@/i18n/translations';

export class AppError<Key extends TranslationKey = TranslationKey> extends Error {
  private readonly renderMessage: (t: Translator) => string;

  constructor(readonly key: Key, ...args: TranslationArgs<Key>) {
    super(defaultTranslate(key, ...args));
    this.name = 'AppError';
    this.renderMessage = t => t(key, ...args);
  }

  localize(t: Translator): string {
    return this.renderMessage(t);
  }
}

// 기존 기기의 트리거를 바꾸지 않고 동일한 오류를 선택한 언어로 안내한다.
const databaseErrorKeys = ['errors.protectedSplit', 'errors.protectedPocket', 'errors.invalidPosition'] as const;

export function getErrorMessage(error: unknown, t: Translator, fallback: string): string {
  if (error instanceof AppError) return error.localize(t);
  if (error instanceof Error) {
    const key = databaseErrorKeys.find(key => error.message.includes(defaultTranslate(key)));
    if (key) return t(key);
  }
  return fallback;
}

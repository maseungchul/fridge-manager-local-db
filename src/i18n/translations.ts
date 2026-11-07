/**
 * @file
 * 지원 언어와 번역 문구를 연결하고 저장된 언어 값을 검증한다.
 * 화면 문구만 번역하며 사용자가 입력한 이름·메모는 다루지 않는다.
 */
import { ko } from '@/i18n/locales/ko';
import { ja } from '@/i18n/locales/ja';

// 언어를 바꾼 뒤에도 원하는 언어를 찾을 수 있도록 각 언어의 고유 이름을 표시한다.
export const languageNames = { ko: '한국어', ja: '日本語' } as const;
export type AppLanguage = keyof typeof languageNames;
export type TranslationKey = keyof typeof ko;
export const DEFAULT_LANGUAGE: AppLanguage = 'ko';

const translations = { ko, ja };

/** 저장값이 없거나 지원하지 않는 언어이면 기본 언어로 시작한다. */
export function resolveLanguage(value: string | null): AppLanguage {
  return value === 'ko' || value === 'ja' ? value : DEFAULT_LANGUAGE;
}

export function translate(language: AppLanguage, key: TranslationKey): string {
  return translations[language][key];
}

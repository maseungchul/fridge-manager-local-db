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
type ParameterNames<Text extends string> = Text extends `${string}{${infer Name}}${infer Rest}` ? Name | ParameterNames<Rest> : never;
export type TranslationArgs<Key extends TranslationKey> = [ParameterNames<typeof ko[Key]>] extends [never]
  ? [] : [parameters: Record<ParameterNames<typeof ko[Key]>, string | number>];
export type Translator = <Key extends TranslationKey>(key: Key, ...args: TranslationArgs<Key>) => string;
export const DEFAULT_LANGUAGE: AppLanguage = 'ko';

const translations = { ko, ja };

/** 저장값이 없거나 지원하지 않는 언어이면 기본 언어로 시작한다. */
export function resolveLanguage(value: string | null): AppLanguage {
  return value === 'ko' || value === 'ja' ? value : DEFAULT_LANGUAGE;
}

/** 문장 전체를 번역한 뒤 이름·개수만 끼워 넣어 언어별 어순을 유지한다. */
export function translate<Key extends TranslationKey>(language: AppLanguage, key: Key, ...args: TranslationArgs<Key>): string {
  const parameters: Record<string, string | number> = args[0] ?? {};
  return translations[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(parameters[name] ?? placeholder));
}

export function defaultTranslate<Key extends TranslationKey>(key: Key, ...args: TranslationArgs<Key>): string {
  return translate(DEFAULT_LANGUAGE, key, ...args);
}

/** 날짜만 저장한 문자열을 시간대 변환 없이 표시 형식으로 바꾼다. */
export function formatDate(date: string, t: Translator): string {
  const [year, month, day] = date.split('-');
  return t('date.value', { year, month, day });
}

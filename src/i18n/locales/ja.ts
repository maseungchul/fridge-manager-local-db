/**
 * @file
 * 한국어 번역 키에 대응하는 일본어 문구를 정의한다.
 * 번역 키가 빠지거나 잘못 추가되면 타입 검사에서 확인한다.
 */
import type { ko } from '@/i18n/locales/ko';

export const ja: Record<keyof typeof ko, string> = {
  'common.loading': '読み込み中',
  'common.error': 'エラー',
  'common.ok': '確認',
  'tabs.fridge': '冷蔵庫',
  'tabs.shopping': '買い物',
  'tabs.settings': '設定',
  'settings.language': '言語',
  'settings.languageDescription': 'アプリで使用する言語を選択してください。',
  'settings.languageSaveError': '言語設定を保存できませんでした。もう一度お試しください。',
};

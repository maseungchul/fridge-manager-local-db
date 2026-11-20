/**
 * @file
 * 유통기한 알림 설정을 기기에 저장하고 재료 목록과 OS의 예약 알림을 맞춘다.
 * 재료 저장과 알림 예약은 독립적으로 처리해 알림 실패가 재료 저장을 막지 않게 한다.
 */
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { getIngredients, subscribeToIngredientChanges } from '@/db/ingredientRepository';
import { getExpirationReminderGroups } from '@/features/ingredient/model/expirationReminder';
import { useTranslation } from '@/i18n/LanguageProvider';
import { formatDate } from '@/i18n/translations';
import type { Translator } from '@/i18n/translations';

interface ReminderSettings {
  enabled: boolean;
  daysBefore: number;
  minutes: number;
}

type ReminderStatus = 'ready' | 'permissionRequired' | 'scheduleError';

interface ReminderContextValue {
  settings: ReminderSettings | null;
  status: ReminderStatus;
  saving: boolean;
  saveSettings: (next: ReminderSettings) => Promise<void>;
  refresh: () => void;
}

export const supportsExpirationReminders = Platform.OS === 'ios' || Platform.OS === 'android';
const DEFAULT_SETTINGS = { enabled: false, daysBefore: 2, minutes: 16 * 60 + 30 };
const STORAGE_KEY = 'settings.expirationReminder';
const CHANNEL_ID = 'ingredient-expiration';
const IDENTIFIER_PREFIX = 'ingredient-expiration:';
const ReminderContext = createContext<ReminderContextValue | null>(null);

function readSettings(saved: string | null): ReminderSettings {
  if (!saved) return DEFAULT_SETTINGS;
  const value = JSON.parse(saved) as Partial<ReminderSettings> | null;
  if (!value || typeof value.enabled !== 'boolean' || typeof value.minutes !== 'number'
    || !Number.isInteger(value.minutes) || value.minutes < 0 || value.minutes >= 24 * 60) return DEFAULT_SETTINGS;
  const { daysBefore } = value;
  return {
    enabled: value.enabled,
    daysBefore: typeof daysBefore === 'number' && Number.isSafeInteger(daysBefore) && daysBefore >= 0
      ? daysBefore : DEFAULT_SETTINGS.daysBefore,
    minutes: value.minutes,
  };
}

function canNotify(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

async function prepareChannel(t: Translator) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t('settings.expirationReminder'),
      importance: AndroidImportance.DEFAULT,
    });
  }
}

async function syncNotifications(db: SQLiteDatabase, settings: ReminderSettings | null, t: Translator) {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const existing = pending.filter(item => item.identifier.startsWith(IDENTIFIER_PREFIX));
  const groups = settings ? getExpirationReminderGroups(await getIngredients(db), settings.daysBefore, settings.minutes) : [];
  // iOS의 대기 예약 한도 안에서 임박한 날짜부터 예약하고 다른 기능의 예약은 보존한다.
  const limit = Platform.OS === 'ios' ? Math.max(0, 64 - (pending.length - existing.length)) : groups.length;
  const title = t('settings.expirationReminder');
  const desired = new Map(groups.slice(0, limit).map(({ expirationDate, count, scheduledAt }) => [
    IDENTIFIER_PREFIX + expirationDate,
    { scheduledAt, body: t('reminder.body', { date: formatDate(expirationDate, t), count }) },
  ]));

  for (const item of existing) {
    const next = desired.get(item.identifier);
    if (next && item.content.data?.scheduledAt === next.scheduledAt
      && item.content.title === title && item.content.body === next.body) {
      desired.delete(item.identifier);
    } else {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }

  for (const [identifier, { scheduledAt, body }] of desired) {
    if (scheduledAt <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: 'default', data: { scheduledAt } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: scheduledAt, channelId: CHANNEL_ID },
    });
  }
}

export function ExpirationReminderProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [status, setStatus] = useState<ReminderStatus>('ready');
  const [saving, setSaving] = useState(false);
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const changing = useRef(false);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (!supportsExpirationReminders) return;
    let active = true;
    Storage.getItemAsync(STORAGE_KEY).then(readSettings).catch(() => DEFAULT_SETTINGS).then(saved => {
      if (active) setSettings(saved);
    });
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
      }),
    });
    return () => {
      active = false;
      Notifications.setNotificationHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!settings?.enabled) return;
    const unsubscribe = subscribeToIngredientChanges(changedDb => {
      if (changedDb === db) refresh();
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [db, settings?.enabled]);

  useEffect(() => {
    if (!settings) return;
    let current = true;
    // 설정과 재료 변경이 겹쳐도 이전 요청이 최신 예약을 지우지 않게 순서대로 처리한다.
    queue.current = queue.current.then(async () => {
      if (!current) return;
      try {
        const permitted = settings.enabled && canNotify(await Notifications.getPermissionsAsync());
        if (permitted) await prepareChannel(t);
        if (!current) return;
        await syncNotifications(db, permitted ? settings : null, t);
        if (current) setStatus(settings.enabled && !permitted ? 'permissionRequired' : 'ready');
      } catch {
        if (current) setStatus('scheduleError');
      }
    });
    return () => { current = false; };
  }, [db, revision, settings, t]);

  const saveSettings = useCallback(async (next: ReminderSettings) => {
    if (!supportsExpirationReminders || !settings || changing.current) return;
    changing.current = true;
    setSaving(true);
    try {
      if (next.enabled && !settings.enabled) {
        await prepareChannel(t);
        const permission = await Notifications.getPermissionsAsync();
        if (!canNotify(permission) && permission.canAskAgain) {
          await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } });
        }
      }
      await Storage.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      setSettings(next);
    } finally {
      changing.current = false;
      setSaving(false);
    }
  }, [settings, t]);

  return (
    <ReminderContext.Provider value={{ settings, status, saving, saveSettings, refresh }}>
      {children}
    </ReminderContext.Provider>
  );
}

export function useExpirationReminder() {
  const context = useContext(ReminderContext);
  if (!context) throw new Error('ExpirationReminderProvider is missing.');
  return context;
}

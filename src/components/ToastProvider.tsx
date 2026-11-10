/**
 * @file
 * 화면 이동 중에도 유지되는 공통 성공 안내를 표시한다.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toast } from '@/components/Toast';
import { useTranslation } from '@/i18n/LanguageProvider';

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const showToast = useCallback((message: string) => {
    setNotice(previous => ({ id: (previous?.id ?? 0) + 1, message }));
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {notice && <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 12 }]}>
        <Toast key={notice.id} message={notice.message} icon="check-circle-outline" variant="success" duration={5400} closeLabel={t('common.close')} onDismiss={() => setNotice(null)} />
      </View>}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
});


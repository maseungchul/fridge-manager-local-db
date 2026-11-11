/**
 * @file
 * 앱 전체에 테마·표시 언어·안전 영역·로컬 DB와 시트 표시 환경을 제공한다.
 */
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { RootNavigator } from '@/navigation/RootNavigator';
import { IngredientMoveQueueProvider } from '@/features/ingredient/IngredientMoveQueueProvider';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { useEffect } from 'react';
import { Appearance } from 'react-native';

export default function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>;
}

function AppContent() {
  const { colors, mode } = useAppTheme();
  const navigationTheme = mode === 'dark' ? DarkTheme : DefaultTheme;
  useEffect(() => {
    Appearance.setColorScheme(mode);
  }, [mode]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <DatabaseProvider>
            <ToastProvider>
              <NavigationContainer theme={{
                ...navigationTheme,
                colors: {
                  ...navigationTheme.colors, background: colors.background, card: colors.surface,
                  text: colors.text, border: colors.border, primary: colors.chilled, notification: colors.error,
                },
              }}>
                <IngredientMoveQueueProvider>
                  <BottomSheetModalProvider>
                    <RootNavigator />
                  </BottomSheetModalProvider>
                </IngredientMoveQueueProvider>
              </NavigationContainer>
            </ToastProvider>
          </DatabaseProvider>
        </LanguageProvider>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

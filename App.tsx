/**
 * @file
 * 앱 전체에 제스처·안전 영역·표시 언어·로컬 DB와 시트 표시 환경을 제공한다.
 */
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { RootNavigator } from '@/navigation/RootNavigator';
import { IngredientMoveQueueProvider } from '@/features/ingredient/IngredientMoveQueueProvider';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import { ButtonTooltipProvider } from '@/components/ButtonTooltip';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <DatabaseProvider>
            <NavigationContainer>
              <IngredientMoveQueueProvider>
                <ButtonTooltipProvider>
                  <BottomSheetModalProvider>
                    <RootNavigator />
                  </BottomSheetModalProvider>
                </ButtonTooltipProvider>
              </IngredientMoveQueueProvider>
            </NavigationContainer>
          </DatabaseProvider>
        </LanguageProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

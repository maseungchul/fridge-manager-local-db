/**
 * @file
 * 앱 전체에 안전 영역·표시 언어·로컬 DB 환경을 제공하고 화면 이동의 공통 환경을 구성한다.
 */
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase } from '@/db/initializeDatabase';
import { RootNavigator } from '@/navigation/RootNavigator';
import { IngredientMoveQueueProvider } from '@/features/ingredient/IngredientMoveQueueProvider';
import { LanguageProvider } from '@/i18n/LanguageProvider';

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <SQLiteProvider
          databaseName="fridge-manager.db"
          onInit={initializeDatabase}
        >
          <NavigationContainer>
            <IngredientMoveQueueProvider>
              <RootNavigator />
            </IngredientMoveQueueProvider>
          </NavigationContainer>
        </SQLiteProvider>
      </LanguageProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

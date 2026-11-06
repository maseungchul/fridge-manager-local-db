/**
 * @file
 * 앱 전체에 안전 영역과 로컬 DB 환경을 제공하고 화면 이동의 공통 환경을 구성한다.
 */
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase } from '@/db/initializeDatabase';
import { RootNavigator } from '@/navigation/RootNavigator';
import { IngredientMoveQueueProvider } from '@/features/ingredient/IngredientMoveQueueProvider';

export default function App() {
  return (
    <SafeAreaProvider>
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
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

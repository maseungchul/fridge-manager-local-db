/**
 * @file
 * 앱 전체에 안전 영역과 로컬 DB 환경을 제공하고 시작 화면을 구성한다.
 */
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase } from './src/db/initializeDatabase';
import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider
        databaseName="fridge-manager.db"
        onInit={initializeDatabase}
      >
        <HomeScreen />
      </SQLiteProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
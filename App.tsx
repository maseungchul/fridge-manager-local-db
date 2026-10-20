/**
 * @file
 * 앱 전체에 안전 영역 정보를 제공하고 시작 화면과 상태 표시줄을 구성한다.
 */
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <HomeScreen />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
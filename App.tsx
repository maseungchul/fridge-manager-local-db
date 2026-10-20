/**
 * @file
 * 앱의 시작 화면과 상태 표시줄을 구성한다.
 */
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
  return (
    <>
      <HomeScreen />
      <StatusBar style="auto" />
    </>
  );
}
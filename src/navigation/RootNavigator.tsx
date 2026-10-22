/**
 * @file
 * RootNavigator는 앱에서 사용할 화면과 화면 전환 방식을 구성한다.
 * 로그인 분기 없이 홈 화면을 시작 화면으로 표시한다.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '@/screens/HomeScreen';

// 화면 이름과 전달할 매개변수의 타입을 정의한다. Home은 별도 매개변수가 없다.
export type RootStackParamList = {
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** 화면을 Navigator에 등록하고 공통 전환 효과와 헤더 표시를 설정한다. */
export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        animation: 'slide_from_right',
        headerShown: false,
      }}
    >
      <Stack.Screen component={HomeScreen} name="Home" />
    </Stack.Navigator>
  );
}

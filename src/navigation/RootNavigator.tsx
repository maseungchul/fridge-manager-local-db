/**
 * @file
 * RootNavigator는 앱에서 사용할 화면과 화면 전환 방식을 구성한다.
 * 기본 하단 탭을 시작 화면으로 표시하고 냉장고 등록을 별도 화면으로 연다.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabNavigator } from '@/navigation/MainTabNavigator';
import { RefrigeratorRegistrationScreen } from '@/screens/RefrigeratorRegistrationScreen';

// 탭 전체와 냉장고 등록의 이동 경로를 정의한다. 두 화면 모두 별도 매개변수가 없다.
export type RootStackParamList = {
  MainTabs: undefined;
  RefrigeratorRegistration: undefined;
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
      <Stack.Screen component={MainTabNavigator} name="MainTabs" />
      <Stack.Screen
        component={RefrigeratorRegistrationScreen}
        name="RefrigeratorRegistration"
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}

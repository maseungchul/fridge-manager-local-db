/**
 * @file
 * 더보기의 카테고리 메뉴와 하위 화면을 같은 탭 안에서 전환한다.
 * 하단 탭을 유지하고 뒤로가기·스와이프로 더보기 목록에 돌아갈 수 있게 한다.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MoreScreen } from '@/screens/MoreScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { colors } from '@/theme/tokens';

export type MoreStackParamList = {
  MoreHome: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStackNavigator() {
  return (
    <Stack.Navigator initialRouteName="MoreHome" screenOptions={{
      headerShown: false,
      animation: 'slide_from_right',
      contentStyle: { backgroundColor: colors.background },
    }}>
      <Stack.Screen name="MoreHome" component={MoreScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

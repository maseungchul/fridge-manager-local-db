/**
 * @file
 * 냉장고·장보기·설정을 iOS·Android의 기본 하단 탭으로 전환한다.
 * 냉장고 등록은 상위 Stack에서 열어 등록 중에는 탭을 표시하지 않는다.
 */
import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { HomeScreen } from '@/screens/HomeScreen';
import { ShoppingScreen } from '@/screens/ShoppingScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { colors } from '@/theme/tokens';

export type MainTabParamList = {
  Home: undefined;
  Shopping: undefined;
  Settings: undefined;
};

const Tab = createNativeBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  const [icons, setIcons] = useState<ImageSourcePropType[]>([]);

  useEffect(() => {
    let mounted = true;
    // 네이티브 탭은 React 아이콘 대신 이미지 소스를 받아 기존 아이콘 폰트를 변환한다.
    Promise.all([
      MaterialDesignIcons.getImageSource('fridge-outline', 24),
      MaterialDesignIcons.getImageSource('cart-outline', 24),
      MaterialDesignIcons.getImageSource('cog-outline', 24),
    ]).then(sources => {
      if (mounted) setIcons(sources);
    }).catch(error => console.error('하단 탭 아이콘을 불러오지 못했습니다.', error));
    return () => { mounted = false; };
  }, []);

  return (
    <Tab.Navigator initialRouteName="Home" screenOptions={{
      headerShown: false,
      tabBarControllerMode: 'tabBar',
      tabBarLabelVisibilityMode: 'labeled',
      tabBarActiveTintColor: colors.chilled,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: { backgroundColor: colors.toolbar },
    }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{
        title: '냉장고',
        tabBarIcon: icons[0] ? { type: 'image', source: icons[0] } : undefined,
      }} />
      <Tab.Screen name="Shopping" component={ShoppingScreen} options={{
        title: '장보기',
        tabBarIcon: icons[1] ? { type: 'image', source: icons[1] } : undefined,
      }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{
        title: '설정',
        tabBarIcon: icons[2] ? { type: 'image', source: icons[2] } : undefined,
      }} />
    </Tab.Navigator>
  );
}

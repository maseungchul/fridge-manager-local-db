/**
 * @file
 * 냉장고·장보기·더보기를 크림·민트 색상의 공통 하단 탭으로 전환한다.
 * 냉장고 등록은 상위 Stack에서 열어 등록 중에는 탭을 표시하지 않는다.
 * 탭바에서 하단 안전 영역을 확보하고, 재료 패널이 열린 동안 탭 입력을 막는다.
 */
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { HomeScreen } from '@/screens/HomeScreen';
import { ShoppingScreen } from '@/screens/ShoppingScreen';
import { MoreStackNavigator } from '@/navigation/MoreStackNavigator';
import { colors, spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n/LanguageProvider';

export type MainTabParamList = {
  Home: undefined;
  Shopping: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [isTabInteractionBlocked, setIsTabInteractionBlocked] = useState(false);

  return (
    <Tab.Navigator initialRouteName="Home" screenOptions={{
      headerShown: false,
      tabBarLabelVisibilityMode: 'labeled',
      tabBarLabelPosition: 'below-icon',
      tabBarIconSize: 24,
      tabBarIconStyle: styles.icon,
      tabBarActiveTintColor: colors.chilled,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarActiveBackgroundColor: 'transparent',
      tabBarLabelStyle: styles.label,
      tabBarItemStyle: styles.item,
      sceneStyle: styles.scene,
      tabBarStyle: [styles.tabBar, {
        height: 50 + insets.bottom,
        paddingBottom: insets.bottom,
        paddingLeft: spacing.sm + insets.left,
        paddingRight: spacing.sm + insets.right,
      }],
      tabBarButton: props => (
        <Pressable {...props} disabled={isTabInteractionBlocked} android_ripple={undefined}
          accessibilityState={{ ...props.accessibilityState, selected: props['aria-selected'], disabled: isTabInteractionBlocked }}
          accessibilityElementsHidden={isTabInteractionBlocked}
          importantForAccessibility={isTabInteractionBlocked ? 'no-hide-descendants' : 'auto'}
          style={[props.style, styles.button]} />
      ),
    }}>
      <Tab.Screen name="Home" options={{
        title: t('tabs.fridge'),
        tabBarIcon: ({ focused, color, size }) => (
          <MaterialDesignIcons name={focused ? 'fridge' : 'fridge-outline'} size={size} color={color} accessible={false} />
        ),
      }}>
        {props => <HomeScreen {...props} onTabInteractionBlockedChange={setIsTabInteractionBlocked} />}
      </Tab.Screen>
      <Tab.Screen name="Shopping" component={ShoppingScreen} options={{
        title: t('tabs.shopping'),
        tabBarIcon: ({ focused, color, size }) => (
          <MaterialDesignIcons name={focused ? 'cart' : 'cart-outline'} size={size} color={color} accessible={false} />
        ),
      }} />
      <Tab.Screen name="More" component={MoreStackNavigator} options={{
        title: t('tabs.more'),
        tabBarIcon: ({ focused, color, size }) => (
          <MaterialDesignIcons name={focused ? 'dots-horizontal-circle' : 'dots-horizontal-circle-outline'} size={size} color={color} accessible={false} />
        ),
      }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scene: { backgroundColor: colors.background },
  tabBar: {
    backgroundColor: colors.toolbar, paddingTop: 0,
    borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0, shadowOpacity: 0,
  },
  item: { marginHorizontal: spacing.xs },
  button: { minHeight: 48, borderRadius: 18, paddingTop: spacing.xs, paddingBottom: 0, justifyContent: 'center' },
  // 아이콘 슬롯을 실제 크기로 맞춰 탭바 높이를 늘리지 않고 상단 여백을 확보한다.
  icon: { height: 24 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginBottom: 0 },
});

/**
 * @file
 * 냉장고·장보기·더보기를 회색 배경과 녹색 강조를 사용하는 공통 하단 탭으로 전환한다.
 * 냉장고·재료·장보기 입력은 상위 Stack에서 열어 입력 중에는 탭을 표시하지 않는다.
 * 탭바에서 하단 안전 영역을 확보하고, 재료 패널·소비 기록 처리 중에는 탭 입력을 막는다.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import * as Haptics from 'expo-haptics';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { HomeScreen } from '@/screens/HomeScreen';
import { ShoppingScreen, type ShoppingSelectionActions } from '@/screens/ShoppingScreen';
import { ConsumedIngredientsScreen, type ConsumedActions } from '@/screens/ConsumedIngredientsScreen';
import { MoreStackNavigator } from '@/navigation/MoreStackNavigator';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useTranslation } from '@/i18n/LanguageProvider';
import type { IngredientFormResult } from '@/screens/IngredientFormScreen';

export type MainTabParamList = {
  Home: undefined;
  Shopping: undefined;
  More: undefined;
};

export type HomeStackParamList = {
  FridgeHome: undefined;
  ConsumedIngredients: undefined;
};

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator({ takeIngredientFormResult }: {
  takeIngredientFormResult: () => IngredientFormResult | null;
}) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [isTabInteractionBlocked, setIsTabInteractionBlocked] = useState(false);
  const [shoppingAction, setShoppingAction] = useState<ShoppingSelectionActions | null>(null);

  const [consumedAction, setConsumedAction] = useState<ConsumedActions | null>(null);

  return (
    <Tab.Navigator initialRouteName="Home" tabBar={props => shoppingAction || consumedAction ? (
      <View style={[styles.selectionToolbar, { height: 50 + insets.bottom, paddingBottom: insets.bottom,
        paddingLeft: spacing.sm + insets.left, paddingRight: spacing.sm + insets.right }]}>
        {consumedAction ? [
          { icon: 'restore' as const, label: t('consumed.restore'), onPress: consumedAction.onRestore, destructive: false },
          { icon: 'trash-can-outline' as const, label: t('consumed.delete'), onPress: consumedAction.onDelete, destructive: true },
        ].map(({ icon, label, onPress, destructive }) => (
          <FeedbackPressable key={icon} accessibilityRole="button" accessibilityLabel={label}
            disabled={consumedAction.disabled} accessibilityState={{ disabled: consumedAction.disabled }}
            feedback="none" onPress={onPress} style={styles.selectionAction}>
            {({ pressed }) => {
              const color = destructive ? (pressed ? colors.errorPressed : colors.error) : (pressed ? colors.iconPressed : colors.text);
              return <><MaterialDesignIcons name={icon} size={24} color={color} accessible={false} pointerEvents="none" />
                <Text style={[destructive ? styles.deleteLabel : styles.purchaseLabel, { color }]}>{label}</Text></>;
            }}
          </FeedbackPressable>
        )) : shoppingAction && <>
        <FeedbackPressable accessibilityRole="button" accessibilityLabel={t(shoppingAction.isUndo ? 'shopping.undoPurchase' : 'shopping.purchasedTab')}
          disabled={shoppingAction.disabled} accessibilityState={{ disabled: shoppingAction.disabled }}
          feedback="none" onPress={shoppingAction.onPurchase} style={styles.selectionAction}>
          {({ pressed }) => <><MaterialDesignIcons name={shoppingAction.isUndo ? 'undo-variant' : 'check-circle-outline'} size={24}
            color={pressed ? colors.iconPressed : colors.text} accessible={false} pointerEvents="none" />
            <Text style={[styles.purchaseLabel, pressed && { color: colors.iconPressed }]}>{t(shoppingAction.isUndo ? 'shopping.undoPurchase' : 'shopping.purchasedTab')}</Text></>}
        </FeedbackPressable>
        {shoppingAction.onRegister ? (
          <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('shopping.registerAsIngredient')}
            disabled={shoppingAction.disabled} accessibilityState={{ disabled: shoppingAction.disabled }}
            feedback="none" onPress={shoppingAction.onRegister} style={styles.selectionAction}>
            {({ pressed }) => <>
              <MaterialDesignIcons name="checkbox-marked-circle-plus-outline" size={24}
                color={pressed ? colors.iconPressed : colors.text} accessible={false} pointerEvents="none" />
              <Text style={[styles.purchaseLabel, pressed && { color: colors.iconPressed }]}>{t('shopping.registerAsIngredient')}</Text>
            </>}
          </FeedbackPressable>
        ) : null}
        {shoppingAction.onDelete ? <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('shopping.deleteSelected')}
          disabled={shoppingAction.disabled} accessibilityState={{ disabled: shoppingAction.disabled }}
          feedback="none" onPress={shoppingAction.onDelete} style={styles.selectionAction}>
          {({ pressed }) => <><MaterialDesignIcons name="trash-can-outline" size={24}
            color={pressed ? colors.errorPressed : colors.error} accessible={false} pointerEvents="none" />
            <Text style={[styles.deleteLabel, pressed && { color: colors.errorPressed }]}>{t('common.delete')}</Text></>}
        </FeedbackPressable> : null}
        </>}
      </View>
    ) : <BottomTabBar {...props} />} screenOptions={{
      headerShown: false,
      tabBarLabelVisibilityMode: 'labeled',
      tabBarLabelPosition: 'below-icon',
      tabBarIconSize: 28,
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
          onPressIn={event => {
            Haptics.selectionAsync().catch(() => {});
            props.onPressIn?.(event);
          }}
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
        {() => (
          <HomeStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <HomeStack.Screen name="FridgeHome">
              {props => <HomeScreen {...props} onTabInteractionBlockedChange={setIsTabInteractionBlocked}
                takeIngredientFormResult={takeIngredientFormResult} />}
            </HomeStack.Screen>
            <HomeStack.Screen name="ConsumedIngredients">
              {props => <ConsumedIngredientsScreen {...props} onInteractionBlockedChange={setIsTabInteractionBlocked}
                onSelectionModeChange={setConsumedAction} />}
            </HomeStack.Screen>
          </HomeStack.Navigator>
        )}
      </Tab.Screen>
      <Tab.Screen name="Shopping" options={{
        title: t('tabs.shopping'),
        tabBarIcon: ({ focused, color, size }) => (
          <MaterialDesignIcons name={focused ? 'cart' : 'cart-outline'} size={size} color={color} accessible={false} />
        ),
      }}>
        {props => <ShoppingScreen {...props} onSelectionModeChange={setShoppingAction} />}
      </Tab.Screen>
      <Tab.Screen name="More" options={{
        title: t('tabs.more'),
        tabBarIcon: ({ focused, color, size }) => (
          <MaterialDesignIcons name={focused ? 'dots-horizontal-circle' : 'dots-horizontal-circle-outline'} size={size} color={color} accessible={false} />
        ),
      }}>
        {() => <MoreStackNavigator />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  scene: { backgroundColor: colors.background },
  tabBar: {
    backgroundColor: colors.navigationBackground, paddingTop: 0,
    borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0, shadowOpacity: 0,
  },
  selectionToolbar: { flexDirection: 'row', flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background },
  selectionAction: { flex: 1, minHeight: 48, marginHorizontal: spacing.xs, paddingTop: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  purchaseLabel: { color: colors.text, fontSize: 12, lineHeight: 16, textAlign: 'center', fontWeight: '600' },
  deleteLabel: { color: colors.error, fontSize: 12, lineHeight: 16, textAlign: 'center', fontWeight: '600' },
  item: { marginHorizontal: spacing.xs },
  button: { minHeight: 48, borderRadius: 18, paddingTop: spacing.xs, paddingBottom: 0, justifyContent: 'center' },
  // 아이콘 슬롯을 실제 크기로 맞춰 탭바 높이를 늘리지 않고 상단 여백을 확보한다.
  icon: { height: 28 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginBottom: 0 },
}));

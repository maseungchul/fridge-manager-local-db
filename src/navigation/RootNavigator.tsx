/**
 * @file
 * RootNavigator는 앱에서 사용할 화면과 화면 전환 방식을 구성한다.
 * 기본 하단 탭을 시작 화면으로 표시하고 냉장고·재료·장보기 입력과 복구 위치 선택을 별도 화면으로 연다.
 */
import { useCallback, useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabNavigator } from '@/navigation/MainTabNavigator';
import { RefrigeratorRegistrationScreen } from '@/screens/RefrigeratorRegistrationScreen';
import { IngredientFormScreen, type IngredientFormResult } from '@/screens/IngredientFormScreen';
import { IngredientRestoreScreen } from '@/screens/IngredientRestoreScreen';
import { ShoppingFormScreen } from '@/screens/ShoppingFormScreen';
import type { Ingredient, IngredientDraft } from '@/features/ingredient/model/ingredient';
import { useAppTheme } from '@/theme/ThemeProvider';

// 냉장고 ID가 있으면 저장된 구성을 편집하고, 매개변수가 없으면 신규 등록한다.
export type RootStackParamList = {
  MainTabs: undefined;
  RefrigeratorRegistration: { refrigeratorId: string } | undefined;
  IngredientForm: {
    position: Pick<Ingredient, 'slotId' | 'drawerNumber'>;
    ingredient?: Ingredient;
    draft: IngredientDraft;
  };
  IngredientRestore: { id: string; consumedAt: string };
  ShoppingForm: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** 화면을 Navigator에 등록하고 공통 전환 효과와 헤더 표시를 설정한다. */
export function RootNavigator() {
  const { colors } = useAppTheme();
  // 화면을 닫기 전에 전달한 초안·저장 결과를 홈 복귀 시 한 번만 가져간다.
  const ingredientFormResult = useRef<IngredientFormResult | null>(null);
  const updateIngredientFormResult = useCallback((result: IngredientFormResult) => {
    ingredientFormResult.current = result;
  }, []);
  const takeIngredientFormResult = useCallback(() => {
    const result = ingredientFormResult.current;
    ingredientFormResult.current = null;
    return result;
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        animation: 'slide_from_right',
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MainTabs">
        {props => <MainTabNavigator {...props} takeIngredientFormResult={takeIngredientFormResult} />}
      </Stack.Screen>
      <Stack.Screen
        component={RefrigeratorRegistrationScreen}
        name="RefrigeratorRegistration"
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="IngredientForm" options={{
        presentation: 'transparentModal', animation: 'none', gestureEnabled: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}>
        {props => <IngredientFormScreen {...props} onResultChange={updateIngredientFormResult} />}
      </Stack.Screen>
      <Stack.Screen name="IngredientRestore" component={IngredientRestoreScreen} />
      <Stack.Screen name="ShoppingForm" component={ShoppingFormScreen} options={{
        presentation: 'transparentModal', animation: 'none', gestureEnabled: false,
        contentStyle: { backgroundColor: 'transparent' },
      }} />
    </Stack.Navigator>
  );
}

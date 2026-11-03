/**
 * @file
 * 저장된 냉장고를 등록 화면과 같은 도면·문 열림·중앙 보기 컴포넌트로 표시한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeBottomTabScreenProps } from '@react-navigation/bottom-tabs/unstable';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, spacing } from '@/theme/tokens';
import { SafeAreaView } from 'react-native-screens/experimental';
import { PrimaryButton } from '@/components/PrimaryButton';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { getRefrigerator } from '@/db/refrigeratorRepository';
import { FridgeFocusView, FridgeInteriorMap, useFridgeFocus } from '@/features/fridge/components/FridgeInteriorMap';
import type { Refrigerator } from '@/features/fridge/model/fridgeLayout';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';

type HomeScreenProps = CompositeScreenProps<
  NativeBottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const db = useSQLiteContext();
  const [refrigerator, setRefrigerator] = useState<Refrigerator | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const {
    selectedAreaId, setSelectedAreaId, focusPhase, focusBounds, focusViewport, activeFocus,
    hasSeenScrollHint, markScrollHintSeen, finishFocusTransition, resetFocus,
    layoutFocusViewport, openFocusedArea, closeFocusedArea,
  } = useFridgeFocus();

  // 홈 재진입·재시도 이전에 시작한 조회가 늦게 끝나도 최신 결과만 반영한다.
  const loadRefrigerator = useCallback(async () => {
    const request = ++loadRequest.current;
    resetFocus();
    setIsLoading(true);
    setError(null);
    try {
      const result = await getRefrigerator(db);
      if (request === loadRequest.current) {
        setRefrigerator(result);
      }
    } catch {
      if (request === loadRequest.current) setError('냉장고 정보를 불러오지 못했습니다.');
    } finally {
      if (request === loadRequest.current) setIsLoading(false);
    }
  }, [db, resetFocus]);

  useFocusEffect(useCallback(() => {
    void loadRefrigerator();
    return () => { loadRequest.current++; resetFocus(); };
  }, [loadRefrigerator, resetFocus]));

  useEffect(() => {
    if (!activeFocus) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFocusedArea();
      return true;
    });
    return () => subscription.remove();
  }, [activeFocus, closeFocusedArea]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={[styles.container, (isLoading || error !== null || !refrigerator) && styles.feedback]}
        edges={{ top: true, bottom: true, left: true, right: true }}
        pointerEvents={activeFocus ? 'none' : 'auto'} accessibilityElementsHidden={!!activeFocus}
        importantForAccessibility={activeFocus ? 'no-hide-descendants' : 'auto'}>
        {isLoading ? <ActivityIndicator color={colors.text} accessibilityLabel="냉장고 정보 불러오는 중" />
          : error ? <>
            <Text accessibilityRole="alert">{error}</Text>
            <PrimaryButton label="다시 불러오기" onPress={loadRefrigerator} />
          </> : refrigerator ? <>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>{refrigerator.name}</Text>
              <FeedbackPressable accessibilityRole="button" accessibilityLabel="냉장고 편집" style={styles.headerIconButton}
                onPress={() => navigation.navigate('RefrigeratorRegistration', { refrigeratorId: refrigerator.id })}>
                <MaterialDesignIcons name="note-edit-outline" size={24} color={colors.text} accessible={false} />
              </FeedbackPressable>
            </View>
            <View style={styles.diagram}>
              <View style={[StyleSheet.absoluteFill, styles.content]}>
                <FridgeInteriorMap draft={refrigerator} selectedAreaId={selectedAreaId ?? undefined}
                  onSelectArea={setSelectedAreaId} focus={activeFocus} onFocus={openFocusedArea} fitHeight />
              </View>
            </View>
          </> : <>
            <Text>우리 집 냉장고를 등록해 주세요</Text>
            <PrimaryButton label="냉장고 등록하기" onPress={() => navigation.navigate('RefrigeratorRegistration')} />
          </>}
      </SafeAreaView>
      {/* 이름과 안전 영역의 여백을 제외하지 않은 화면 전체를 중앙 보기의 기준으로 사용한다. */}
      <View ref={focusViewport} collapsable={false} pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={layoutFocusViewport}>
        {refrigerator && activeFocus && focusBounds ? (
          <FridgeFocusView draft={refrigerator} target={activeFocus} viewport={focusBounds} phase={focusPhase}
            selectedAreaId={selectedAreaId ?? undefined} scrollHintEnabled={!hasSeenScrollHint}
            onScrollHintSeen={markScrollHintSeen} onPhaseChange={finishFocusTransition}
            onClose={closeFocusedArea} onSelectArea={setSelectedAreaId} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  feedback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  diagram: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
});

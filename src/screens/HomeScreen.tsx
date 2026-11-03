/**
 * @file
 * 홈에 진입할 때 DB의 등록 여부를 확인하고 냉장고 이름 또는 등록 안내를 표시한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, spacing } from '@/theme/tokens';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getRefrigeratorSummary } from '@/db/refrigeratorRepository';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const db = useSQLiteContext();
  const [refrigerator, setRefrigerator] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  // 홈 재진입·재시도 이전에 시작한 조회가 늦게 끝나도 최신 결과만 반영한다.
  const loadRefrigerator = useCallback(async () => {
    const request = ++loadRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getRefrigeratorSummary(db);
      if (request === loadRequest.current) setRefrigerator(result);
    } catch {
      if (request === loadRequest.current) setError('냉장고 정보를 불러오지 못했습니다.');
    } finally {
      if (request === loadRequest.current) setIsLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => {
    void loadRefrigerator();
    return () => { loadRequest.current++; };
  }, [loadRefrigerator]));

  return (
    <SafeAreaView style={styles.container}>
      {isLoading ? <ActivityIndicator color={colors.text} accessibilityLabel="냉장고 정보 불러오는 중" />
        : error ? <>
          <Text accessibilityRole="alert">{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadRefrigerator} />
        </> : refrigerator ? <>
          <Text accessibilityRole="header">{refrigerator.name}</Text>
          <Text>냉장고가 등록되었습니다.</Text>
        </> : <>
          <Text>우리 집 냉장고를 등록해 주세요</Text>
          <PrimaryButton label="냉장고 등록하기" onPress={() => navigation.navigate('RefrigeratorRegistration')} />
        </>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
});

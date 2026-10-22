/**
 * @file
 * 냉장고 앱의 홈 화면과 화면 스타일을 구성한다.
 */
import { StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/tokens';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text>우리 집 냉장고를 등록해 주세요</Text>
      <PrimaryButton
        label="냉장고 등록하기"
        onPress={() => console.log('냉장고 등록 버튼 클릭')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

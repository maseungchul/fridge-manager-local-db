/**
 * @file
 * 냉장고 앱의 홈 화면과 화면 스타일을 구성한다.
 */
import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme/tokens';
import { SafeAreaView } from 'react-native-safe-area-context';

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text>내 냉장고</Text>
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
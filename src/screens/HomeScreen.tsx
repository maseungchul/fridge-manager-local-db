/**
 * @file
 * 냉장고 앱의 홈 화면과 화면 스타일을 구성한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text>내 냉장고</Text>
    </View>
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
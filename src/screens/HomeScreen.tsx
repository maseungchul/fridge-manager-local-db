/**
 * @file
 * 냉장고 앱의 홈 화면과 화면 스타일을 구성한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/tokens';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: HomeScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <Text>우리 집 냉장고를 등록해 주세요</Text>
      <PrimaryButton
        label="냉장고 등록하기"
        onPress={() => navigation.navigate('RefrigeratorRegistration')}
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

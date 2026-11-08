/**
 * @file
 * 설정 등 부가 기능의 진입 메뉴를 카테고리별로 모아 표시한다.
 * 카테고리는 화면 너비의 구분 영역에, 메뉴는 아이콘·이름으로 표시한다.
 * 메뉴 구성은 한곳에서 관리하고 실제 기능은 각 하위 화면에서 제공한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { useTranslation } from '@/i18n/LanguageProvider';
import type { MoreStackParamList } from '@/navigation/MoreStackNavigator';
import { headerStyles } from '@/theme/headerStyles';
import { colors, spacing } from '@/theme/tokens';

type MoreScreenProps = NativeStackScreenProps<MoreStackParamList, 'MoreHome'>;

const menuSections = [
  {
    title: 'settings.title',
    items: [
      { screen: 'Settings', label: 'settings.language', icon: 'translate' },
    ],
  },
] as const;

export function MoreScreen({ navigation }: MoreScreenProps) {
  const { t } = useTranslation();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('tabs.more')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} alwaysBounceVertical={false}>
        {menuSections.map(section => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>{t(section.title)}</Text>
            </View>
            <View style={styles.menu}>
              {section.items.map(item => (
                <FeedbackPressable key={item.screen} accessibilityRole="button" accessibilityLabel={t(item.label)}
                  onPress={() => navigation.navigate(item.screen)} style={styles.item}>
                  <MaterialDesignIcons name={item.icon} size={24} color={colors.textMuted} accessible={false} />
                  <Text style={styles.itemLabel}>{t(item.label)}</Text>
                </FeedbackPressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  ...headerStyles,
  title: { ...headerStyles.title, flex: 1, textAlign: 'center' },
  content: { paddingBottom: spacing.lg },
  section: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionHeader: {
    minHeight: 44, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, justifyContent: 'center',
    backgroundColor: colors.toolbar,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  sectionTitle: { color: colors.text, opacity: 0.7, fontSize: 14, lineHeight: 22 },
  menu: { paddingVertical: spacing.xs, backgroundColor: colors.surface },
  item: { minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemLabel: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 24 },
});

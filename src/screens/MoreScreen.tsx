/**
 * @file
 * 설정 등 부가 기능의 진입 메뉴를 카테고리별로 모아 표시한다.
 * 카테고리와 메뉴를 그룹으로 묶고 메뉴는 아이콘·이름으로 표시한다.
 * 메뉴 구성은 한곳에서 관리하고 실제 기능은 각 하위 화면에서 제공한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { useTranslation } from '@/i18n/LanguageProvider';
import type { MoreStackParamList } from '@/navigation/MoreStackNavigator';
import { getHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

type MoreScreenProps = NativeStackScreenProps<MoreStackParamList, 'MoreHome'>;

const menuSections = [
  {
    title: 'consumed.section',
    items: [
      { screen: 'ConsumedIngredients', label: 'consumed.title', icon: 'check-circle-outline' },
    ],
  },
  {
    title: 'settings.title',
    items: [
      { screen: 'Settings', label: 'settings.language', icon: 'translate', section: 'language' },
      { screen: 'Settings', label: 'settings.theme', icon: 'theme-light-dark', section: 'theme' },
    ],
  },
] as const;

export function MoreScreen({ navigation }: MoreScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('tabs.more')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} alwaysBounceVertical={false}>
        {menuSections.map((section, index) => (
          <View key={section.title} style={index > 0 && styles.sectionSeparator}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>{t(section.title)}</Text>
            </View>
            <View style={styles.menu}>
              {section.items.map(item => (
                <FeedbackPressable key={item.label} accessibilityRole="button" accessibilityLabel={t(item.label)}
                  onPress={() => item.screen === 'Settings'
                    ? navigation.navigate('Settings', { section: item.section })
                    : navigation.navigate(item.screen)} style={styles.item}>
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

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  ...getHeaderStyles(mode),
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  sectionSeparator: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sectionHeader: {
    minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center',
  },
  sectionTitle: { color: colors.text, opacity: 0.7, fontSize: 14, lineHeight: 22 },
  menu: { paddingVertical: spacing.xs },
  item: { minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemLabel: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 24 },
}));

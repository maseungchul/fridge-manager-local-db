/**
 * @file
 * 설정 등 부가 기능의 진입 메뉴를 카테고리별로 모아 표시한다.
 * 카테고리와 메뉴를 그룹으로 묶고 메뉴는 아이콘·이름으로 표시한다.
 * 설정은 하위 화면에서 제공하고 냉장고 삭제는 확인창에서 바로 처리한다.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { Alert, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { useToast } from '@/components/ToastProvider';
import { alertTitles } from '@/constants/alertTitles';
import { deleteRefrigerator, getRefrigeratorSummary } from '@/db/refrigeratorRepository';
import { supportsExpirationReminders } from '@/features/ingredient/ExpirationReminderProvider';
import { useIngredientMoveQueue } from '@/features/ingredient/IngredientMoveQueueProvider';
import { getErrorMessage } from '@/i18n/errors';
import { useTranslation } from '@/i18n/LanguageProvider';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import type { MoreStackParamList } from '@/navigation/MoreStackNavigator';
import { getHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

type MoreScreenProps = CompositeScreenProps<
  NativeStackScreenProps<MoreStackParamList, 'MoreHome'>,
  BottomTabScreenProps<MainTabParamList, 'More'>
> & { onTabInteractionBlockedChange: (blocked: boolean) => void; onRefrigeratorDeleted: (navigate: () => void) => void };

const menuSections = [
  {
    title: 'settings.title',
    items: [
      { screen: 'Settings', label: 'settings.language', icon: 'translate', section: 'language' },
      { screen: 'Settings', label: 'settings.theme', icon: 'theme-light-dark', section: 'theme' },
      { screen: 'Settings', label: 'settings.expirationReminder', icon: 'bell-outline', section: 'expirationReminder' },
    ],
  },
] as const;

export function MoreScreen({ navigation, onTabInteractionBlockedChange, onRefrigeratorDeleted }: MoreScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const showToast = useToast();
  const { clear: clearMoveQueue } = useIngredientMoveQueue();
  const [refrigerator, setRefrigerator] = useState<Awaited<ReturnType<typeof getRefrigeratorSummary>>>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleting = useRef(false);

  // 등록·편집 후 더보기에 돌아오면 현재 냉장고를 삭제 대상으로 표시한다.
  useFocusEffect(useCallback(() => {
    let active = true;
    setRefrigerator(null);
    void getRefrigeratorSummary(db).catch(() => null).then(result => {
      if (active) setRefrigerator(result);
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => deleting.current);
    return () => { active = false; back.remove(); };
  }, [db]));

  function requestDelete() {
    if (!refrigerator || deleting.current) return;
    const { id, name } = refrigerator;
    deleting.current = true;
    setIsDeleting(true);
    onTabInteractionBlockedChange(true);
    const unlock = () => {
      deleting.current = false;
      setIsDeleting(false);
      onTabInteractionBlockedChange(false);
    };
    Alert.alert(t(alertTitles.warning), t('fridge.deleteConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel', onPress: unlock },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        try {
          await deleteRefrigerator(db, id);
          clearMoveQueue();
          showToast(t('fridge.deleteSuccess'));
          onRefrigeratorDeleted(() => navigation.navigate('Home'));
        } catch (error) {
          Alert.alert(t(alertTitles.error), getErrorMessage(error, t, t('fridge.deleteError')));
        } finally { unlock(); }
      } },
    ], { cancelable: false });
  }

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
              {section.items.filter(item => supportsExpirationReminders || item.label !== 'settings.expirationReminder').map(item => (
                <FeedbackPressable key={item.label} accessibilityRole="button" accessibilityLabel={t(item.label)}
                  interactionBlocked={isDeleting} onPress={() => navigation.navigate('Settings', { section: item.section })} style={styles.item}>
                  <MaterialDesignIcons name={item.icon} size={24} color={colors.textMuted} accessible={false} />
                  <Text style={styles.itemLabel}>{t(item.label)}</Text>
                </FeedbackPressable>
              ))}
            </View>
          </View>
        ))}
          <View style={styles.sectionSeparator}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>{t('more.fridgeManagement')}</Text>
            </View>
            <View style={styles.menu}>
              <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('fridge.delete')}
                disabled={!refrigerator} interactionBlocked={isDeleting} accessibilityState={{ disabled: !refrigerator || isDeleting }} feedback="danger"
                onPress={requestDelete} style={styles.item}>
                <MaterialDesignIcons name="fridge-off-outline" size={24} color={colors.error} accessible={false} />
                <Text style={[styles.itemLabel, { color: colors.error }]}>{t('fridge.delete')}</Text>
              </FeedbackPressable>
            </View>
          </View>
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

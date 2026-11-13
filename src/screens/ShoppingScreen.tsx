/**
 * @file
 * 장보기 목록을 표시하고 상단 추가 버튼으로 품목 입력 화면을 연다.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getShoppingItems } from '@/db/shoppingRepository';
import type { ShoppingItem } from '@/db/shoppingRepository';
import type { MainTabParamList } from '@/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_INSET, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { useTranslation } from '@/i18n/LanguageProvider';

type ShoppingScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Shopping'>,
  NativeStackScreenProps<RootStackParamList>
>;

const LOADING_DELAY_MS = 200;
const MIN_LOADING_VISIBLE_MS = 300;

export function ShoppingScreen({ navigation }: ShoppingScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const loadRequest = useRef(0);

  // 등록 화면에서 돌아오면 저장된 순서대로 목록을 다시 읽는다.
  const loadItems = useCallback(async () => {
    const request = ++loadRequest.current;
    setIsLoading(true);
    setShowLoading(false);
    setHasLoadError(false);
    let loadingShownAt: number | null = null;
    const loadingTimer = setTimeout(() => {
      if (request !== loadRequest.current) return;
      loadingShownAt = Date.now();
      setShowLoading(true);
    }, LOADING_DELAY_MS);

    try {
      const result = await getShoppingItems(db);
      if (request === loadRequest.current) setItems(result);
    } catch {
      if (request === loadRequest.current) setHasLoadError(true);
    } finally {
      clearTimeout(loadingTimer);
      if (loadingShownAt !== null) {
        const remaining = MIN_LOADING_VISIBLE_MS - (Date.now() - loadingShownAt);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      }
      if (request === loadRequest.current) {
        setHasLoaded(true);
        setIsLoading(false);
        setShowLoading(false);
      }
    }
  }, [db]);

  useFocusEffect(useCallback(() => {
    void loadItems();
    return () => { loadRequest.current++; };
  }, [loadItems]));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('tabs.shopping')}</Text>
        <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('shopping.add')}
          accessibilityState={{ disabled: isLoading || hasLoadError }} disabled={isLoading || hasLoadError}
          onPress={() => navigation.navigate('ShoppingForm')} style={styles.addButton}>
          <MaterialDesignIcons name="plus" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
        </FeedbackPressable>
      </View>
      {isLoading && (!hasLoaded || showLoading) ? (
        <View style={styles.feedback}>
          {showLoading ? <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} /> : null}
        </View>
      ) : hasLoadError ? (
        <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={styles.error}>{t('shopping.loadError')}</Text>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={loadItems} />
        </View>
      ) : (
        <FlatList
          data={items} keyExtractor={item => item.id} indicatorStyle={mode === 'dark' ? 'white' : 'black'}
          contentContainerStyle={items.length === 0 ? styles.emptyList : styles.listContent}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <MaterialDesignIcons name="tray-plus" size={40} color={colors.textMuted} accessible={false} />
              <Text style={styles.emptyTitle}>{t('shopping.empty')}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.name}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  ...getHeaderStyles(mode),
  title: { ...getHeaderStyles(mode).title, flex: 1 },
  addButton: {
    width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, marginRight: -HEADER_ICON_INSET,
    alignItems: 'center', justifyContent: 'center', borderRadius: 24,
  },
  listContent: { paddingBottom: spacing.lg },
  feedback: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md, gap: spacing.md },
  error: { color: colors.error, marginTop: spacing.xs },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  item: {
    padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  quantity: { color: colors.textMuted, fontWeight: '400' },
}));

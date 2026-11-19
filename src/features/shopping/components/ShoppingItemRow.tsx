/**
 * @file
 * 장보기 품목의 표시와 선택 상태를 장보기 목록과 구매 완료 품목 선택 화면에서 공유한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import type { ShoppingItem } from '@/db/shoppingRepository';
import { useTranslation } from '@/i18n/LanguageProvider';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

interface ShoppingItemRowProps {
  item: ShoppingItem;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export function ShoppingItemRow({ item, selected, disabled = false, onPress }: ShoppingItemRowProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const isSelectable = selected !== undefined;

  return (
    <FeedbackPressable accessibilityRole={isSelectable ? 'checkbox' : onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? t(isSelectable ? 'shopping.selectItem' : 'shopping.editItem', { name: item.name }) : undefined}
      accessibilityValue={{ text: item.memo ? `${item.quantity}, ${item.memo}` : item.quantity }}
      accessibilityState={{ disabled, ...(isSelectable ? { checked: selected } : {}) }}
      interactionBlocked={disabled || !onPress} feedback={isSelectable ? 'none' : 'default'}
      onPress={onPress} style={[styles.item, isSelectable && styles.selectableItem, selected && styles.selectedItem]}>
      {isSelectable ? selected ? (
        <MaterialDesignIcons name="checkbox-marked-circle" size={24} color={colors.chilled} accessible={false} />
      ) : <View style={styles.selectionCircleContainer}><View style={styles.selectionCircle} /></View> : null}
      <View style={styles.itemDetails}>
        <Text style={styles.name}>{item.name}<Text style={styles.quantity}>  {item.quantity}</Text></Text>
        {item.memo ? <Text style={styles.memo}>{item.memo}</Text> : null}
      </View>
    </FeedbackPressable>
  );
}

const getStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  item: {
    padding: spacing.md, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  selectableItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectedItem: { backgroundColor: colors.chilledBackground },
  itemDetails: { flex: 1, gap: spacing.xs },
  selectionCircleContainer: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  selectionCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.textMuted },
  name: { color: colors.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  quantity: { fontSize: 17, fontWeight: '400' },
  memo: { color: colors.textMuted, fontSize: 15 },
}));

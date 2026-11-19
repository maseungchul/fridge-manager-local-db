/**
 * @file
 * 구매 완료 품목을 재료 입력으로 미리 채우고 일괄 등록 전에 확인한다.
 * 저장에 실패하면 입력을 유지하고 다시 시도할 수 있게 한다.
 */
import { useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FormTextInput } from '@/components/FormTextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { PurchasedIngredientRegistration, PurchasedShoppingItem } from '@/db/shoppingRepository';
import { IngredientExpirationCalendar } from '@/features/ingredient/components/IngredientExpirationCalendar';
import { INGREDIENT_MEMO_MAX_LENGTH, INGREDIENT_NAME_MAX_LENGTH, INGREDIENT_QUANTITY_MAX_LENGTH } from '@/features/ingredient/model/ingredient';
import type { IngredientDraft } from '@/features/ingredient/model/ingredient';
import { getErrorMessage } from '@/i18n/errors';
import { useTranslation } from '@/i18n/LanguageProvider';
import { formatDate } from '@/i18n/translations';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_INSET, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

interface PurchasedIngredientReviewProps {
  items: readonly PurchasedShoppingItem[];
  onClose: () => void;
  onRegister: (registrations: readonly PurchasedIngredientRegistration[]) => Promise<void>;
}

export function getFieldErrors(draft: IngredientDraft) {
  const nameLength = draft.name.trim().length;
  const quantityLength = draft.quantity.trim().length;
  return {
    name: nameLength === 0 || nameLength > INGREDIENT_NAME_MAX_LENGTH,
    quantity: quantityLength === 0 || quantityLength > INGREDIENT_QUANTITY_MAX_LENGTH,
    memo: (draft.memo?.trim().length ?? 0) > INGREDIENT_MEMO_MAX_LENGTH,
  };
}

export function PurchasedIngredientReview({ items, onClose, onRegister }: PurchasedIngredientReviewProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const [registrations, setRegistrations] = useState<PurchasedIngredientRegistration[]>(() =>
    items.map(item => ({ item, draft: { name: item.name, quantity: item.quantity, memo: item.memo, expirationDate: null } })));
  const [dateItemId, setDateItemId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ cause: unknown } | null>(null);
  const saving = useRef(false);
  const dateItem = registrations.find(({ item }) => item.id === dateItemId);
  const canSave = registrations.length > 0 && !dateItem && registrations.every(({ draft }) => {
    const errors = getFieldErrors(draft);
    return !errors.name && !errors.quantity && !errors.memo;
  });

  function updateDraft(id: string, changes: Partial<IngredientDraft>) {
    if (saving.current) return;
    setSaveError(null);
    setRegistrations(current => current.map(registration => registration.item.id === id
      ? { ...registration, draft: { ...registration.draft, ...changes } } : registration));
  }

  function close() {
    if (saving.current) return;
    Keyboard.dismiss();
    onClose();
  }

  async function save() {
    if (saving.current || !canSave) return;
    saving.current = true;
    setIsSaving(true);
    setSaveError(null);
    Keyboard.dismiss();
    try {
      await onRegister(registrations);
    } catch (cause) {
      setSaveError({ cause });
      saving.current = false;
      setIsSaving(false);
      return;
    }
    onClose();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaProvider>
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.screen} onAccessibilityEscape={close}>
            <View style={styles.header}>
              <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                disabled={isSaving} onPress={close} style={styles.closeButton}>
                <MaterialDesignIcons name="close" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
              </FeedbackPressable>
              <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                style={styles.title}>{t('shopping.reviewPurchased')}</Text>
              <View style={styles.headerSpacer} />
            </View>
            <FlatList data={registrations} keyExtractor={({ item }) => item.id}
              keyboardShouldPersistTaps="handled" keyboardDismissMode="none" contentContainerStyle={styles.listContent}
              renderItem={({ item: { item, draft } }) => {
                const errors = getFieldErrors(draft);
                return (
                  <View style={styles.item}>
                    <FormTextInput label={t('ingredient.name')} required value={draft.name} editable={!isSaving}
                      maxLength={Math.max(INGREDIENT_NAME_MAX_LENGTH, draft.name.length)}
                      errorMessage={errors.name ? t('errors.ingredientName') : undefined}
                      onChangeText={name => updateDraft(item.id, { name })} />
                    <FormTextInput label={t('ingredient.quantity')} required value={draft.quantity} editable={!isSaving}
                      maxLength={Math.max(INGREDIENT_QUANTITY_MAX_LENGTH, draft.quantity.length)}
                      errorMessage={errors.quantity ? t('errors.ingredientQuantity') : undefined}
                      onChangeText={quantity => updateDraft(item.id, { quantity })} />
                    <FormTextInput label={t('ingredient.memo')} value={draft.memo ?? ''} editable={!isSaving} multiline
                      maxLength={Math.max(INGREDIENT_MEMO_MAX_LENGTH, draft.memo?.length ?? 0)}
                      errorMessage={errors.memo ? t('shopping.importMemoLength') : undefined}
                      onChangeText={memo => updateDraft(item.id, { memo })} />
                    <Text style={styles.fieldLabel}>{t('ingredient.expiration')}</Text>
                    <View style={styles.dateRow}>
                      <PrimaryButton label={draft.expirationDate ? formatDate(draft.expirationDate, t) : t('ingredient.datePlaceholder')}
                        icon="calendar-month" variant="secondary" disabled={isSaving} style={styles.dateButton}
                        onPress={() => { Keyboard.dismiss(); setDateItemId(item.id); }} />
                      {draft.expirationDate ? (
                        <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('ingredient.clearDate')}
                          disabled={isSaving} style={styles.dateClear} onPress={() => updateDraft(item.id, { expirationDate: null })}>
                          <MaterialDesignIcons name="calendar-remove" size={24} color={colors.text} accessible={false} />
                        </FeedbackPressable>
                      ) : null}
                    </View>
                  </View>
                );
              }} />
            <View style={styles.footer}>
              {saveError ? (
                <Text accessibilityRole="alert" style={styles.error}>{getErrorMessage(saveError.cause, t, t('ingredient.saveError'))}</Text>
              ) : null}
              <PrimaryButton label={t('ingredient.register')} icon="checkbox-marked-circle-plus-outline"
                disabled={!canSave} loading={isSaving} onPress={save} />
            </View>
            {dateItem ? (
              <IngredientExpirationCalendar value={dateItem.draft.expirationDate}
                onSelect={expirationDate => updateDraft(dateItem.item.id, { expirationDate })}
                onDismiss={() => setDateItemId(null)} />
            ) : null}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  ...getHeaderStyles(mode),
  title: { ...getHeaderStyles(mode).title, flex: 1, textAlign: 'center' },
  closeButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, alignItems: 'center', justifyContent: 'center',
    borderRadius: 24, marginLeft: -HEADER_ICON_INSET },
  headerSpacer: { width: HEADER_CONTENT_HEIGHT, marginRight: -HEADER_ICON_INSET },
  listContent: { paddingBottom: spacing.md },
  item: { padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dateButton: { flex: 1 },
  dateClear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  footer: { gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  error: { color: colors.error },
}));

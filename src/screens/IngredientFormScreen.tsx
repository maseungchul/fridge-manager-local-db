/**
 * @file
 * 재료 등록·편집을 독립 화면에서 처리하고 키보드에 맞춰 입력 영역만 스크롤한다.
 * 입력 초안·저장 결과는 홈 복귀에 사용하며, 저장 성공 시 안내를 표시하고 이전 화면으로 돌아간다.
 */
import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FormTextInput } from '@/components/FormTextInput';
import { useToast } from '@/components/ToastProvider';
import { registerIngredient, updateIngredient } from '@/db/ingredientRepository';
import { IngredientExpirationCalendar } from '@/features/ingredient/components/IngredientExpirationCalendar';
import type { Ingredient, IngredientDraft } from '@/features/ingredient/model/ingredient';
import { useTranslation } from '@/i18n/LanguageProvider';
import { getErrorMessage } from '@/i18n/errors';
import { formatDate } from '@/i18n/translations';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { spacing, createThemedStyles } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

export interface IngredientFormResult {
  draft: IngredientDraft;
  isEditing: boolean;
  savedIngredient: Ingredient | null;
}

type IngredientFormScreenProps = NativeStackScreenProps<RootStackParamList, 'IngredientForm'> & {
  onResultChange: (result: IngredientFormResult) => void;
};

export function IngredientFormScreen({ navigation, route, onResultChange }: IngredientFormScreenProps) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const { t } = useTranslation();
  const showToast = useToast();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { position, ingredient: editingIngredient } = route.params;
  const isEditing = editingIngredient !== undefined;
  const [draft, setDraft] = useState(route.params.draft);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ cause: unknown } | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const quantityInput = useRef<ComponentRef<typeof FormTextInput>>(null);
  const memoInput = useRef<ComponentRef<typeof FormTextInput>>(null);
  const saving = useRef(false);
  const leaving = useRef(false);
  const savedIngredient = useRef<Ingredient | null>(null);
  const canSave = !!draft.name.trim() && !!draft.quantity.trim()
    && (draft.name.trim().length <= 20 || draft.name === editingIngredient?.name)
    && (draft.quantity.trim().length <= 10 || draft.quantity === editingIngredient?.quantity)
    && ((draft.memo ?? '').trim().length <= 100 || draft.memo === editingIngredient?.memo) && !isDatePickerOpen;

  useEffect(() => {
    onResultChange({ draft, isEditing, savedIngredient: savedIngredient.current });
  }, [draft, isEditing, onResultChange]);

  usePreventRemove(isSaving, ({ data }) => {
    if (leaving.current) navigation.dispatch(data.action);
  });

  function returnToList() {
    if (saving.current || leaving.current) return;
    leaving.current = true;
    setIsDatePickerOpen(false);
    Keyboard.dismiss();
    navigation.goBack();
  }

  function toggleDatePicker() {
    if (saving.current || leaving.current) return;
    Keyboard.dismiss();
    setIsDatePickerOpen(current => !current);
  }

  async function saveIngredient() {
    if (saving.current || leaving.current || !canSave) return;
    saving.current = true;
    setIsSaving(true);
    setIsDatePickerOpen(false);
    setSaveError(null);
    Keyboard.dismiss();
    let ingredient: Ingredient;
    try {
      ingredient = editingIngredient
        ? await updateIngredient(db, { ...editingIngredient, ...draft })
        : await registerIngredient(db, { ...draft, ...position });
    } catch (cause) {
      setSaveError({ cause });
      saving.current = false;
      setIsSaving(false);
      return;
    }
    savedIngredient.current = ingredient;
    onResultChange({ draft, isEditing, savedIngredient: ingredient });
    leaving.current = true;
    navigation.goBack();
    showToast(isEditing ? t('ingredient.updated') : t('ingredient.registered'));
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.content} edges={['top', 'left', 'right']} onAccessibilityEscape={returnToList}>
        {/* 헤더와 입력 영역 모두 첫 터치를 전달하고, 키보드는 각 버튼의 동작에서 닫는다. */}
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} stickyHeaderIndices={[0]}
          bounces={false} overScrollMode="never"
          keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={false}>
          {/* 고정 헤더는 직접 자식의 스타일을 옮기므로 가로 배치는 내부 View에 둔다. */}
          <View>
            <Pressable style={styles.header} onPress={Keyboard.dismiss} accessible={false}>
              <FeedbackPressable tooltip accessibilityRole="button" accessibilityLabel={t('ingredient.back')}
                disabled={isSaving} accessibilityState={{ disabled: isSaving }} onPress={returnToList} style={styles.headerIconButton}>
                <MaterialDesignIcons name="arrow-left" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
              </FeedbackPressable>
              <View style={styles.heading}>
                <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                  style={styles.title}>{isEditing ? t('ingredient.edit') : t('ingredient.add')}</Text>
              </View>
              <FeedbackPressable tooltip accessibilityRole="button" accessibilityLabel={isEditing ? t('ingredient.saveEdit') : t('ingredient.register')}
                accessibilityState={{ disabled: !canSave || isSaving, busy: isSaving }} disabled={!canSave || isSaving}
                onPress={saveIngredient} style={styles.headerIconButton}>
                {isSaving ? <ActivityIndicator color={colors.text} accessibilityLabel={isEditing ? t('ingredient.updating') : t('ingredient.registering')} />
                  : <MaterialDesignIcons name={isEditing ? 'checkbox-marked-circle-outline' : 'checkbox-marked-circle-plus-outline'} size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />}
              </FeedbackPressable>
            </Pressable>
          </View>
          <Pressable style={[styles.form, { paddingBottom: spacing.lg + insets.bottom }]} onPress={Keyboard.dismiss} accessible={false}>
            <FormTextInput label={t('ingredient.name')} accessibilityLabel={t('ingredient.name')} placeholder={t('ingredient.namePlaceholder')} required
              value={draft.name} maxLength={Math.max(20, editingIngredient?.name.length ?? 0)} editable={!isSaving} returnKeyType="next"
              onSubmitEditing={() => { if (!saving.current && !leaving.current) quantityInput.current?.focus(); }}
              onChangeText={name => { if (!saving.current && !leaving.current) setDraft(current => ({ ...current, name })); }} />
            <FormTextInput ref={quantityInput} label={t('ingredient.quantity')} accessibilityLabel={t('ingredient.quantityLabel')} placeholder={t('ingredient.quantityPlaceholder')} required
              value={draft.quantity} maxLength={Math.max(10, editingIngredient?.quantity.length ?? 0)} editable={!isSaving} returnKeyType="next"
              onSubmitEditing={() => { if (!saving.current && !leaving.current) memoInput.current?.focus(); }}
              onChangeText={quantity => { if (!saving.current && !leaving.current) setDraft(current => ({ ...current, quantity })); }} />
            <FormTextInput ref={memoInput} label={t('ingredient.memo')} accessibilityLabel={t('ingredient.memoLabel')} placeholder={t('ingredient.memoPlaceholder')}
              value={draft.memo ?? ''} maxLength={Math.max(100, editingIngredient?.memo?.length ?? 0)} editable={!isSaving} multiline
              onChangeText={memo => { if (!saving.current && !leaving.current) setDraft(current => ({ ...current, memo })); }} />
            <Text style={styles.fieldLabel}>{t('ingredient.expiration')}</Text>
            <View style={styles.dateRow}>
              <FeedbackPressable accessibilityRole="button" accessibilityLabel={t('ingredient.selectDate')}
                accessibilityState={{ disabled: isSaving, expanded: isDatePickerOpen }} disabled={isSaving}
                onPress={toggleDatePicker} style={styles.dateButton}>
                <MaterialDesignIcons name="calendar-month" size={22} color={colors.text} accessible={false} />
                <Text style={styles.date}>{draft.expirationDate ? formatDate(draft.expirationDate, t) : t('ingredient.datePlaceholder')}</Text>
              </FeedbackPressable>
              {draft.expirationDate ? (
                <FeedbackPressable tooltip accessibilityRole="button" accessibilityLabel={t('ingredient.clearDate')}
                  disabled={isSaving} accessibilityState={{ disabled: isSaving }} style={styles.clearDateButton}
                  onPress={() => {
                    if (saving.current || leaving.current) return;
                    Keyboard.dismiss();
                    setDraft(current => ({ ...current, expirationDate: null }));
                    setIsDatePickerOpen(false);
                  }}>
                  <MaterialDesignIcons name="calendar-remove" size={24} color={colors.text} accessible={false} />
                </FeedbackPressable>
              ) : null}
            </View>
            {saveError ? <Text accessibilityRole="alert" style={styles.error}>{getErrorMessage(saveError.cause, t, t('ingredient.saveError'))}</Text> : null}
          </Pressable>
        </ScrollView>
        {isDatePickerOpen ? (
          <IngredientExpirationCalendar value={draft.expirationDate} disabled={isSaving}
            onSelect={expirationDate => { if (!saving.current && !leaving.current) setDraft(current => ({ ...current, expirationDate })); }}
            onDismiss={() => setIsDatePickerOpen(false)} />
        ) : null}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  header: { ...getHeaderStyles(mode).header, backgroundColor: colors.surface },
  heading: { flex: 1, minHeight: HEADER_CONTENT_HEIGHT, justifyContent: 'center' },
  title: { ...getHeaderStyles(mode).title, textAlign: 'center' },
  headerIconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  form: { flexGrow: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  date: { color: colors.text, fontSize: 16, flexShrink: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dateButton: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 52, padding: spacing.md,
    gap: spacing.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  clearDateButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  error: { color: colors.error, fontSize: 16, textAlign: 'center', marginTop: spacing.md },
}));

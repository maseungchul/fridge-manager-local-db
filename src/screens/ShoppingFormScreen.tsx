/**
 * @file
 * 장보기 품목의 이름과 수량을 입력받고, 저장한 뒤 목록으로 돌아간다.
 */
import { useRef, useState, type ComponentRef } from 'react';
import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FormTextInput } from '@/components/FormTextInput';
import { useToast } from '@/components/ToastProvider';
import { addShoppingItem, SHOPPING_INPUT_MAX_LENGTH } from '@/db/shoppingRepository';
import { getErrorMessage } from '@/i18n/errors';
import { useTranslation } from '@/i18n/LanguageProvider';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { HEADER_CONTENT_HEIGHT, HEADER_ICON_INSET, HEADER_ICON_SIZE, getHeaderStyles } from '@/theme/headerStyles';
import { useAppTheme } from '@/theme/ThemeProvider';
import { createThemedStyles, spacing } from '@/theme/tokens';

export function ShoppingFormScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'ShoppingForm'>) {
  const { mode, colors } = useAppTheme();
  const styles = getStyles(mode);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const showToast = useToast();
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ cause: unknown } | null>(null);
  const quantityInput = useRef<ComponentRef<typeof FormTextInput>>(null);
  const saving = useRef(false);
  const leaving = useRef(false);
  const canSave = !!name.trim() && !!quantity.trim();

  usePreventRemove(isSaving, ({ data }) => {
    if (leaving.current) navigation.dispatch(data.action);
  });

  function returnToList() {
    if (saving.current || leaving.current) return;
    leaving.current = true;
    Keyboard.dismiss();
    navigation.goBack();
  }

  async function saveItem() {
    if (!canSave || saving.current || leaving.current) return;
    saving.current = true;
    setIsSaving(true);
    setSaveError(null);
    Keyboard.dismiss();

    try {
      await addShoppingItem(db, { name, quantity });
    } catch (cause) {
      setSaveError({ cause });
      saving.current = false;
      setIsSaving(false);
      return;
    }

    leaving.current = true;
    navigation.goBack();
    showToast(t('shopping.registered'));
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={returnToList} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']} onAccessibilityEscape={returnToList}>
          <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
              <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                disabled={isSaving} accessibilityState={{ disabled: isSaving }} onPress={returnToList}
                style={[styles.headerButton, styles.leftButton]}>
                <MaterialDesignIcons name="close" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
              </FeedbackPressable>
              <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                style={styles.title}>{t('shopping.add')}</Text>
              <FeedbackPressable iconFeedback accessibilityRole="button" accessibilityLabel={t('shopping.save')}
                disabled={!canSave || isSaving} accessibilityState={{ disabled: !canSave || isSaving, busy: isSaving }}
                onPress={saveItem} style={[styles.headerButton, styles.rightButton]}>
                {isSaving ? <ActivityIndicator color={colors.text} /> : (
                  <MaterialDesignIcons name="checkbox-marked-circle-plus-outline" size={HEADER_ICON_SIZE} color={colors.text} accessible={false} />
                )}
              </FeedbackPressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
              contentContainerStyle={[styles.form, { paddingBottom: spacing.lg + insets.bottom }]}>
              <FormTextInput label={t('shopping.name')} required value={name} onChangeText={setName}
                maxLength={SHOPPING_INPUT_MAX_LENGTH} editable={!isSaving} returnKeyType="next"
                onSubmitEditing={() => { if (!saving.current && !leaving.current) quantityInput.current?.focus(); }} />
              <FormTextInput ref={quantityInput} label={t('ingredient.quantity')} required value={quantity} onChangeText={setQuantity}
                placeholder={t('ingredient.quantityPlaceholder')} maxLength={SHOPPING_INPUT_MAX_LENGTH} editable={!isSaving} />
              {saveError ? (
                <Text accessibilityRole="alert" style={styles.error}>{getErrorMessage(saveError.cause, t, t('shopping.saveError'))}</Text>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const getStyles = createThemedStyles(({ colors }, mode) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  ...getHeaderStyles(mode),
  header: { ...getHeaderStyles(mode).header, backgroundColor: colors.background },
  title: { ...getHeaderStyles(mode).title, flex: 1, textAlign: 'center' },
  headerButton: { width: HEADER_CONTENT_HEIGHT, height: HEADER_CONTENT_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  leftButton: { marginLeft: -HEADER_ICON_INSET },
  rightButton: { marginRight: -HEADER_ICON_INSET },
  form: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  error: { color: colors.error },
}));

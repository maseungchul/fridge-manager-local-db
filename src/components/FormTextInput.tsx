/**
 * @file
 * FormTextInput은 라벨·입력란·오류 문구를 함께 표시하는 공통 폼 입력 컴포넌트다.
 * 오른쪽에 버튼 등의 요소를 추가할 수 있으며, 입력값과 검증 결과는 호출하는 화면에서 관리한다.
 * forwardRef로 내부 TextInput을 연결해 부모가 focus() 등의 기능을 사용할 수 있게 한다.
 */
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import { colors, spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n/LanguageProvider';

// TextInput의 속성을 재사용하되 style은 제외해 입력란의 공통 스타일을 유지한다.
export interface FormTextInputProps extends Omit<TextInputProps, 'style'> {
  errorMessage?: string;
  label: string;
  required?: boolean;
  // 화면의 제목 위계에 맞춰 라벨만 조정하고 입력란의 공통 스타일은 유지한다.
  labelStyle?: StyleProp<TextStyle>;
  // 입력 묶음 사이의 여백을 화면 배치에 맞게 조정한다.
  containerStyle?: StyleProp<ViewStyle>;
  // 비밀번호 보기 버튼처럼 입력란 오른쪽에 배치할 요소다.
  trailingElement?: ReactNode;
}

// 첫 번째 타입은 ref로 노출할 대상, 두 번째 타입은 전달받을 props다.
export const FormTextInput = forwardRef<ComponentRef<typeof TextInput>, FormTextInputProps>(
  function FormTextInput(
    {
      errorMessage,
      label,
      required = false,
      labelStyle,
      containerStyle,
      placeholderTextColor = colors.textMuted,
      trailingElement,
      // value, onChangeText, 키보드 설정 등 나머지 속성은 내부 TextInput에 전달한다.
      ...inputProps
    },
    ref,
  ) {
    const { t } = useTranslation();
    const accessibilityLabel = required
      ? `${inputProps.accessibilityLabel ?? label}, ${t('common.required')}`
      : inputProps.accessibilityLabel;
    return (
      <View style={[styles.field, containerStyle]}>
        <Text style={[styles.label, labelStyle]} accessibilityLabel={required ? `${label}, ${t('common.required')}` : label}>
          {label}{required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        {/* 오른쪽 요소가 있으면 입력란과 함께 감싸고, 없으면 TextInput만 표시한다. */}
        {trailingElement ? (
          <View style={[styles.inputContainer, errorMessage ? styles.inputError : undefined]}>
            <TextInput
              {...inputProps}
              accessibilityLabel={accessibilityLabel}
              placeholderTextColor={placeholderTextColor}
              ref={ref}
              style={styles.inputWithTrailingElement}
            />
            {trailingElement}
          </View>
        ) : (
          <TextInput
            {...inputProps}
            accessibilityLabel={accessibilityLabel}
            placeholderTextColor={placeholderTextColor}
            ref={ref}
            style={[styles.input, inputProps.multiline && styles.multilineInput, errorMessage ? styles.inputError : undefined]}
          />
        )}
        {/* 오류 문구를 표시하고, 지원되는 접근성 환경에서 변경 내용을 안내한다. */}
        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  required: { color: colors.error },
  input: {
    height: 52,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  inputContainer: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    // 높이 44인 버튼의 상하 여백과 오른쪽 테두리 안쪽 여백을 맞춘다.
    paddingRight: 3,
  },
  multilineInput: {
    height: 96,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
  inputWithTrailingElement: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    lineHeight: 17,
  },
});

/**
 * @file
 * 선택 휠의 중간값 저장을 줄이고 닫을 때 마지막 선택을 반영한다.
 */
import { useEffect, useRef, useState } from 'react';

export function usePickerAutoSave(selected: number, saved: number, saving: boolean,
  onSave: (value: number) => Promise<void>, onDismiss: () => void) {
  const [edited, setEdited] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempted = useRef<number | undefined>(undefined);
  const shouldSave = edited && selected !== saved;

  useEffect(() => {
    if (!shouldSave || saving || attempted.current === selected) return;
    // 휠이 움직이는 동안 중간값마다 알림을 다시 예약하지 않게 한다.
    timer.current = setTimeout(() => {
      attempted.current = selected;
      void onSave(selected);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [onSave, saving, selected, shouldSave]);

  async function dismiss() {
    clearTimeout(timer.current);
    if (shouldSave) await onSave(selected);
    onDismiss();
  }

  function markEdited() {
    attempted.current = undefined;
    setEdited(true);
  }

  return { markEdited, dismiss };
}

/**
 * @file
 * 앱 실행 중 여러 칸에서 담은 재료 ID를 임시이동목록으로 유지한다.
 * 재료 정보·보관 위치는 DB 조회 결과를 사용하고, 목록은 영구 저장하지 않는다.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface IngredientMoveQueue {
  ingredientIds: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  retain: (ids: string[]) => void;
}

const IngredientMoveQueueContext = createContext<IngredientMoveQueue | null>(null);

export function IngredientMoveQueueProvider({ children }: { children: ReactNode }) {
  const [ingredientIds, setIngredientIds] = useState<string[]>([]);
  const add = useCallback((id: string) => {
    setIngredientIds(current => current.includes(id) ? current : [...current, id]);
  }, []);
  const remove = useCallback((id: string) => {
    setIngredientIds(current => current.filter(candidate => candidate !== id));
  }, []);
  const clear = useCallback(() => setIngredientIds([]), []);
  // 홈 재조회에 성공했을 때만 삭제된 재료를 정리하고, 조회 실패로 대기 목록을 비우지 않는다.
  const retain = useCallback((ids: string[]) => {
    setIngredientIds(current => current.filter(id => ids.includes(id)));
  }, []);

  return (
    <IngredientMoveQueueContext.Provider value={{ ingredientIds, add, remove, clear, retain }}>
      {children}
    </IngredientMoveQueueContext.Provider>
  );
}

export function useIngredientMoveQueue() {
  const queue = useContext(IngredientMoveQueueContext);
  if (!queue) throw new Error('임시이동목록의 공통 상태를 찾을 수 없습니다.');
  return queue;
}

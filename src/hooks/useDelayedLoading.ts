/**
 * @file
 * 화면 조회가 빠르게 끝나면 로딩 표시를 생략하고, 표시한 경우 최소 노출 시간을 유지한다.
 * 새 조회를 시작하거나 화면을 벗어나면 이전 타이머와 조회 결과를 무효화한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const LOADING_DELAY_MS = 200;
const MIN_LOADING_VISIBLE_MS = 300;

export function useDelayedLoading() {
  const [isLoading, setIsLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelLoad = useCallback(() => {
    requestId.current++;
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  useEffect(() => cancelLoad, [cancelLoad]);

  const runLoad = useCallback(async (load: (isCurrent: () => boolean) => Promise<void>) => {
    cancelLoad();
    const request = requestId.current;
    const isCurrent = () => request === requestId.current;
    let shownAt: number | undefined;
    setIsLoading(true);
    setShowLoading(false);

    timer.current = setTimeout(() => {
      if (!isCurrent()) return;
      shownAt = Date.now();
      setShowLoading(true);
    }, LOADING_DELAY_MS);

    try {
      await load(isCurrent);
    } finally {
      if (isCurrent()) {
        clearTimeout(timer.current);
        const remaining = shownAt === undefined ? 0 : MIN_LOADING_VISIBLE_MS - (Date.now() - shownAt);
        const finish = () => {
          if (!isCurrent()) return;
          timer.current = undefined;
          setHasLoaded(true);
          setIsLoading(false);
          setShowLoading(false);
        };
        if (remaining > 0) timer.current = setTimeout(finish, remaining);
        else finish();
      }
    }
  }, [cancelLoad]);

  return { isLoading, showLoading, hasLoaded, runLoad, cancelLoad };
}

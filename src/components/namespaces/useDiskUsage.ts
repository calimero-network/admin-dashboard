import { useEffect, useRef, useState } from 'react';
import { getUsage } from '../../api/namespaceApi';
import { parseUsage, type NamespaceBytes } from '../../utils/diskUsage';

export const USAGE_POLL_MS = 60_000;

export function useDiskUsage(): Map<string, NamespaceBytes> | null {
  const [usage, setUsage] = useState<Map<string, NamespaceBytes> | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const fetchUsage = async () => {
      try {
        const next = parseUsage(await getUsage());
        if (live.current) setUsage(next);
      } catch {
        if (live.current) setUsage(null);
      }
    };

    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      if (timer !== undefined) return;
      void fetchUsage();
      timer = setInterval(() => void fetchUsage(), USAGE_POLL_MS);
    };
    const onVisibilityChange = () => (document.hidden ? stop() : start());
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      live.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return usage;
}

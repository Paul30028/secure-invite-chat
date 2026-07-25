import { useCallback, useEffect, useState } from "react";
import { loadPrivateData, updatePrivateData, type PrivateData } from "../lib/privateStore";
export function usePrivateData() {
  const [data, setData] = useState<PrivateData | null>(null);
  const refresh = useCallback(() => { void loadPrivateData().then(setData).catch(() => setData(null)); }, []);
  useEffect(refresh, [refresh]);
  const update = useCallback(async (fn: (data: PrivateData) => PrivateData) => { const next = await updatePrivateData(fn); setData(next); return next; }, []);
  return { data, refresh, update };
}

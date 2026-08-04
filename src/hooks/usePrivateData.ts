import { useCallback, useEffect, useState } from "react";
import { loadPrivateData, updatePrivateData, type PrivateData } from "../lib/privateStore";
export function usePrivateData() {
  const [data, setData] = useState<PrivateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => { void loadPrivateData().then((value) => { setData(value); setError(null); }).catch(() => { setData(null); setError("本机加密存储不可用"); }); }, []);
  useEffect(refresh, [refresh]);
  const update = useCallback(async (fn: (data: PrivateData) => PrivateData) => { const next = await updatePrivateData(fn); setData(next); return next; }, []);
  return { data, error, refresh, update };
}

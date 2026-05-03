import { useAuth } from "./useAuth";

export function useSettings() {
  const { settings, loading } = useAuth();

  return { settings, loading, refresh: () => {} };
}

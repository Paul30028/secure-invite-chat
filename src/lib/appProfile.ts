export type AppProfile = {
  displayName: string;
  avatar: string;
  notifications: boolean;
  callRingtone: boolean;
  readReceipts: boolean;
  autoDownloadWifi: boolean;
  completedAt: number;
};

const KEY = "sic_app_profile_v1";

export function loadAppProfile(): AppProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AppProfile>;
    if (!value.displayName) return null;
    return {
      displayName: value.displayName,
      avatar: value.avatar || "🌾",
      notifications: value.notifications !== false,
      callRingtone: value.callRingtone !== false,
      readReceipts: value.readReceipts !== false,
      autoDownloadWifi: value.autoDownloadWifi === true,
      completedAt: value.completedAt || Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveAppProfile(value: Omit<AppProfile, "completedAt">): AppProfile {
  const profile = { ...value, completedAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
}

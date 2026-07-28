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
const LEGACY_KEY = "sic_local_profile";

export function loadAppProfile(): AppProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (!legacyRaw) return null;
      const legacy = JSON.parse(legacyRaw) as { avatar?: string; nickname?: string };
      if (!legacy.nickname) return null;
      return saveAppProfile({
        displayName: legacy.nickname,
        avatar: legacy.avatar || "麦",
        notifications: true,
        callRingtone: true,
        readReceipts: true,
        autoDownloadWifi: false,
      });
    }
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

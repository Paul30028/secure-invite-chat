const KEY = "sic_local_profile";

export type LocalProfile = { avatar: string; nickname: string };

export function getLocalProfile(): LocalProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalProfile) : null;
  } catch {
    return null;
  }
}

export function saveLocalProfile(profile: LocalProfile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export const AVATAR_CHOICES = ["麦", "鸽", "鱼", "羊", "经", "冠", "光"];

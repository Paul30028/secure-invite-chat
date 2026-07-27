import type { HTMLAttributes } from "react";

export const AVATAR_OPTIONS = ["🌾", "🕊️", "🐟", "✝️", "📖", "🤍"];

export async function makePhotoAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  canvas.getContext("2d")!.drawImage(
    bitmap,
    (bitmap.width - size) / 2,
    (bitmap.height - size) / 2,
    size,
    size,
    0,
    0,
    256,
    256,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", .82);
}

export function AvatarBadge({ avatar, fallback, className = "", ...props }: {
  avatar: string;
  fallback?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`avatar-badge ${className}`} {...props}>
      {avatar.startsWith("data:image/") ? <img src={avatar} alt="" /> : avatar || fallback || "我"}
    </span>
  );
}

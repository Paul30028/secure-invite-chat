import { useEffect } from "react";
import { APP_NAME } from "../config/appConfig";

export function SplashScreen({
  onDone,
  scripture,
}: {
  onDone: () => void;
  scripture: string;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center px-10 text-center"
      style={{
        background: "linear-gradient(160deg, #f3efe6 0%, #e8ecdf 100%)",
      }}
      onClick={onDone}
      role="button"
      tabIndex={0}
    >
      <img
        src="/icon-192.png"
        alt={APP_NAME}
        className="w-28 h-28 rounded-3xl shadow-md mb-6"
      />
      <p className="text-[11px] tracking-[0.2em] text-[#8a9a82] font-medium">
        SECURE INVITE CHAT
      </p>
      <h1 className="text-2xl font-bold text-[#2f3b30] mt-1 tracking-wide">{APP_NAME}</h1>

      {scripture && (
        <blockquote className="mt-10 text-base text-[#3d4a3d] leading-relaxed max-w-xs">
          “{scripture}”
        </blockquote>
      )}
    </div>
  );
}

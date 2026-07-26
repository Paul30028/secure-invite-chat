import { useEffect, useMemo, useState } from "react";
import { firstUrl, hostnameOf, isMostlyLink, splitLinks } from "../lib/linkify";
import { b64ToBytes } from "../lib/crypto";
import type { ChatMessage, TrustBadge } from "../lib/types";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function trustLabel(t?: TrustBadge): { text: string; cls: string } | null {
  switch (t) {
    case "verified":
      return { text: "已签名", cls: "text-[#118c43]" };
    case "first_seen":
      return { text: "新设备", cls: "text-[#3b82f6]" };
    case "key_changed":
      return { text: "⚠ 密钥变更", cls: "text-red-400 font-semibold" };
    case "bad_sig":
      return { text: "⚠ 签名无效", cls: "text-red-400" };
    case "unsigned":
      return { text: "未签名", cls: "text-[#8a8a8a]" };
    case "legacy":
      return { text: "旧格式", cls: "text-[#8a8a8a]" };
    default:
      return null;
  }
}

function downloadFile(msg: ChatMessage) {
  if (!msg.file?.dataB64) return;
  const bytes = b64ToBytes(msg.file.dataB64);
  const blob = new Blob([bytes], { type: msg.file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = msg.file.name;
  a.click();
  URL.revokeObjectURL(url);
}

function ImageLightbox({
  url,
  name,
  onClose,
  onSave,
}: {
  url: string;
  name: string;
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/92 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      <div
        className="flex items-center justify-between px-3 py-3 border-b border-white/10"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <span className="text-sm text-white/90 truncate flex-1 mr-3">{name}</span>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 text-white hover:bg-white/20"
            onClick={onSave}
          >
            保存
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 text-white hover:bg-white/20"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
      <button
        type="button"
        className="flex-1 flex items-center justify-center p-4 min-h-0"
        onClick={onClose}
        aria-label="点击关闭"
      >
        <img
          src={url}
          alt={name}
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </button>
    </div>
  );
}

function LinkCard({
  url,
  isMine,
  caption,
}: {
  url: string;
  isMine: boolean;
  caption?: string;
}) {
  const host = hostnameOf(url);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`rounded-2xl overflow-hidden border text-sm max-w-full ${
        isMine
          ? "bg-[#95ec69] border-[#95ec69] text-[#1f2329] rounded-tr-sm"
          : "bg-white border-[#e5e5e5] text-[#1f2329] rounded-tl-sm"
      }`}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 pt-3 pb-2 hover:opacity-95"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">🔗</span>
          <span className={`text-[11px] font-medium ${isMine ? "text-[#3a6b22]" : "text-[#3b82f6]"}`}>
            链接分享 · {host}
          </span>
        </div>
        <div className="text-[12px] break-all opacity-90 leading-snug line-clamp-3">{url}</div>
        {caption && caption.trim() && (
          <div className="mt-2 text-[12px] opacity-80 whitespace-pre-wrap">{caption}</div>
        )}
      </a>
      <div
        className={`flex border-t text-[11px] ${
          isMine ? "border-[#7ed957]" : "border-[#e5e5e5]"
        }`}
      >
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 py-2 text-center ${isMine ? "hover:bg-[#8ee45f]" : "hover:bg-[#f5f5f5]"}`}
        >
          打开
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className={`flex-1 py-2 border-l ${
            isMine ? "border-[#7ed957] hover:bg-[#8ee45f]" : "border-[#e5e5e5] hover:bg-[#f5f5f5]"
          }`}
        >
          {copied ? "已复制" : "复制链接"}
        </button>
      </div>
    </div>
  );
}

function FileBubble({ msg, trust }: { msg: ChatMessage; trust: ReturnType<typeof trustLabel> }) {
  const isImage = !!msg.file?.mime?.startsWith("image/");
  const [lightbox, setLightbox] = useState(false);
  const previewUrl = useMemo(() => {
    if (!msg.file?.dataB64 || !isImage) return null;
    try {
      const bytes = b64ToBytes(msg.file.dataB64);
      const blob = new Blob([bytes], { type: msg.file.mime });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [msg.file, isImage]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className={`flex ${msg.isMine ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[85%] sm:max-w-[70%] flex flex-col ${msg.isMine ? "items-end" : "items-start"}`}>
        {!msg.isMine && (
          <span className="text-xs text-[#8a8a8a] mb-1 px-1 flex items-center gap-2">
            {msg.senderName}
            {trust && <span className={trust.cls}>{trust.text}</span>}
          </span>
        )}
        <div
          className={`rounded-2xl overflow-hidden text-left text-sm ${
            msg.isMine
              ? "bg-[#95ec69] text-[#1f2329] rounded-tr-sm"
              : "bg-white text-[#1f2329] rounded-tl-sm"
          } ${msg.trust === "key_changed" || msg.trust === "bad_sig" ? "ring-1 ring-red-500" : ""}`}
        >
          {previewUrl && (
            <button
              type="button"
              className="block w-full p-0 border-0 bg-transparent cursor-zoom-in"
              onClick={() => setLightbox(true)}
              title="点击放大"
            >
              <img
                src={previewUrl}
                alt={msg.file!.name}
                className="max-w-full max-h-52 object-cover block w-full"
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadFile(msg)}
            className="w-full px-4 py-3 text-left hover:opacity-90 transition-opacity"
          >
            <div className="font-medium">📎 {msg.file!.name}</div>
            <div className={`text-[11px] mt-1 ${msg.isMine ? "text-[#3a6b22]" : "text-[#8a8a8a]"}`}>
              {formatSize(msg.file!.size)} · 加密传送 · {isImage ? "点图放大 / 点此保存" : "点击保存到本机"}
            </div>
          </button>
        </div>
        <span className="text-[10px] text-[#8a8a8a] mt-1 px-1">{formatTime(msg.ts)}</span>
      </div>

      {lightbox && previewUrl && (
        <ImageLightbox
          url={previewUrl}
          name={msg.file!.name}
          onClose={() => setLightbox(false)}
          onSave={() => downloadFile(msg)}
        />
      )}
    </div>
  );
}

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const trust = trustLabel(msg.trust);

  if (msg.msgType === "file" && msg.file?.transfer && !msg.file.dataB64) {
    const { received, total, error } = msg.file.transfer;
    const percent = total ? Math.round((received / total) * 100) : 0;
    return (
      <div className={`flex ${msg.isMine ? "justify-end" : "justify-start"} mb-3`}>
        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.isMine ? "bg-[#95ec69]" : "bg-white"}`}>
          <div className="font-medium">📎 {msg.file.name}</div>
          <div className={`mt-1 text-[11px] ${error ? "text-red-500" : "text-[#6b7280]"}`}>
            {error || `接收中 ${received}/${total}（${percent}%）`}
          </div>
          {!error && <div className="mt-2 h-1.5 rounded-full bg-black/10 overflow-hidden"><div className="h-full bg-[#07c160]" style={{ width: `${percent}%` }} /></div>}
        </div>
      </div>
    );
  }

  if (msg.msgType === "file" && msg.file && !msg.decryptError) {
    return <FileBubble msg={msg} trust={trust} />;
  }

  const link = firstUrl(msg.text);
  const showCard = link && isMostlyLink(msg.text) && !msg.decryptError;
  const parts = splitLinks(msg.text);
  const caption =
    link && showCard
      ? msg.text
          .replace(link, "")
          .replace(/^https?:\/\//i, "")
          .trim()
      : "";

  return (
    <div className={`flex ${msg.isMine ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${msg.isMine ? "items-end" : "items-start"} flex flex-col`}>
        {!msg.isMine && (
          <span className="text-xs text-[#8a8a8a] mb-1 px-1 flex items-center gap-2">
            {msg.senderName}
            {trust && <span className={trust.cls}>{trust.text}</span>}
          </span>
        )}

        {showCard && link ? (
          <LinkCard url={link} isMine={msg.isMine} caption={caption || undefined} />
        ) : (
          <div
            className={`rounded-lg px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
              msg.isMine
                ? "bg-[#95ec69] text-[#1f2329] rounded-tr-sm"
                : "bg-white text-[#1f2329] rounded-tl-sm"
            } ${msg.decryptError ? "border border-red-500/60 italic opacity-80" : ""} ${
              msg.trust === "key_changed" || msg.trust === "bad_sig" ? "ring-1 ring-red-500" : ""
            }`}
          >
            {parts.map((p, i) =>
              p.url ? (
                <a
                  key={i}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-[#2563eb] hover:text-[#1d4ed8] break-all"
                >
                  {p.text}
                </a>
              ) : (
                <span key={i}>{p.text}</span>
              )
            )}
          </div>
        )}
        <span className="text-[10px] text-[#8a8a8a] mt-1 px-1">
          {formatTime(msg.ts)}
          {msg.isMine && trust ? ` · ${trust.text}` : ""}
        </span>
      </div>
    </div>
  );
}

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
      return { text: "已签名", cls: "text-emerald-400" };
    case "first_seen":
      return { text: "新设备", cls: "text-[#576b95]" };
    case "key_changed":
      return { text: "⚠ 密钥变更", cls: "text-red-400 font-semibold" };
    case "bad_sig":
      return { text: "⚠ 签名无效", cls: "text-red-400" };
    case "unsigned":
      return { text: "未签名", cls: "text-[#999]" };
    case "legacy":
      return { text: "旧格式", cls: "text-[#999]" };
    default:
      return null;
  }
}

function ChatAvatar({ name, isMine }: { name?: string; isMine: boolean }) {
  const label = isMine ? "我" : (name || "群").trim().slice(0, 1) || "群";
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-medium ${
        isMine ? "bg-[#07c160] text-white" : "bg-[#b7c2d0] text-white"
      }`}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

function downloadFile(msg: ChatMessage) {
  if (!msg.file) return;
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
          ? "bg-[#95ec69] border-[#95ec69] text-[#191919] rounded-br-sm"
          : "bg-white border-[#ededed] text-[#191919] rounded-bl-sm"
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
          <span className={`text-[11px] font-medium ${isMine ? "text-[#4c6b38]" : "text-[#576b95]"}`}>
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
          isMine ? "border-[#80cf59]" : "border-[#e5e5e5]"
        }`}
      >
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 py-2 text-center ${isMine ? "hover:bg-[#85d85e]" : "hover:bg-[#f2f2f2]"}`}
        >
          打开
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className={`flex-1 py-2 border-l ${
            isMine ? "border-[#e5e5e5] hover:bg-[#f2f2f2]" : "border-[#e5e5e5] hover:bg-[#f2f2f2]"
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
    if (!msg.file || !isImage) return null;
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
    <div className={`flex items-start gap-2 ${msg.isMine ? "justify-end" : "justify-start"} mb-3`}>
      {!msg.isMine && <ChatAvatar name={msg.senderName} isMine={false} />}
      <div className={`max-w-[78%] sm:max-w-[70%] flex flex-col ${msg.isMine ? "items-end" : "items-start"}`}>
        {!msg.isMine && (
          <span className="text-xs text-slate-400 mb-1 px-1 flex items-center gap-2">
            {msg.senderName}
            {trust && <span className={trust.cls}>{trust.text}</span>}
          </span>
        )}
        <div
          className={`rounded-2xl overflow-hidden text-left text-sm ${
            msg.isMine
              ? "bg-[#95ec69] text-[#191919] rounded-br-sm"
              : "bg-white text-[#191919] rounded-bl-sm"
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
            <div className={`text-[11px] mt-1 ${msg.isMine ? "text-[#4c6b38]" : "text-[#888]"}`}>
              {formatSize(msg.file!.size)} · 加密传送 · {isImage ? "点图放大 / 点此保存" : "点击保存到本机"}
            </div>
          </button>
        </div>
        <span className="text-[10px] text-slate-500 mt-1 px-1">{formatTime(msg.ts)}</span>
      </div>
      {msg.isMine && <ChatAvatar name={msg.senderName} isMine />}

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

  if (msg.blocked) {
    return (
      <div className="flex justify-center mb-3">
        <span className="max-w-[85%] rounded-lg border border-red-500/50 bg-red-50 px-3 py-2 text-xs text-red-700">
          {msg.text}
        </span>
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
    <div className={`flex items-start gap-2 ${msg.isMine ? "justify-end" : "justify-start"} mb-3`}>
      {!msg.isMine && <ChatAvatar name={msg.senderName} isMine={false} />}
      <div className={`max-w-[78%] sm:max-w-[70%] ${msg.isMine ? "items-end" : "items-start"} flex flex-col`}>
        {!msg.isMine && (
          <span className="text-xs text-slate-400 mb-1 px-1 flex items-center gap-2">
            {msg.senderName}
            {trust && <span className={trust.cls}>{trust.text}</span>}
          </span>
        )}

        {showCard && link ? (
          <LinkCard url={link} isMine={msg.isMine} caption={caption || undefined} />
        ) : (
          <div
            className={`rounded-2xl px-4 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
              msg.isMine
                ? "bg-[#95ec69] text-[#191919] rounded-br-sm"
                : "bg-white text-[#191919] rounded-bl-sm"
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
                  className="underline text-[#576b95] hover:text-[#40567f] break-all"
                >
                  {p.text}
                </a>
              ) : (
                <span key={i}>{p.text}</span>
              )
            )}
          </div>
        )}
        <span className="text-[10px] text-slate-500 mt-1 px-1">
          {formatTime(msg.ts)}
          {msg.isMine && trust ? ` · ${trust.text}` : ""}
        </span>
      </div>
      {msg.isMine && <ChatAvatar name={msg.senderName} isMine />}
    </div>
  );
}

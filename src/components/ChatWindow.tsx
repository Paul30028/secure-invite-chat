import { useEffect, useRef, useState, type DragEvent } from "react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage, LocalGroup } from "../lib/types";
import { computeGroupSafetyNumber, formatSafetyNumber } from "../lib/safetyNumber";
import { MAX_FILE_BYTES, type FileSendProgress } from "../hooks/useChatEngine";

const QUICK_EMOJIS = ["😀", "😂", "👍", "❤️", "🎉", "😢", "😮", "🙏", "✅", "🔥"];

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatWindow({
  group,
  messages,
  onSend,
  onSendFile,
  onSimulatePeer,
  onOpenAdmin,
  onOpenMembers,
  memberCount,
  onLeave,
  onBack,
  groupSecret,
  localMode,
}: {
  group: LocalGroup;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onSendFile: (file: File, onProgress?: (p: FileSendProgress) => void) => Promise<void> | void;
  onSimulatePeer?: () => void;
  onOpenAdmin: () => void;
  onOpenMembers?: () => void;
  memberCount?: number;
  onLeave: () => void;
  onBack?: () => void;
  groupSecret: string;
  localMode?: boolean;
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showLinkBox, setShowLinkBox] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [fileProgress, setFileProgress] = useState<FileSendProgress | null>(null);
  const [showSafety, setShowSafety] = useState(false);
  const [safety, setSafety] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const sendingFile = fileProgress !== null && fileProgress.stage !== "done";

  useEffect(() => {
    if (!showSafety) return;
    const secret = groupSecret || group.groupSecret || group.lastKnownInviteCode;
    void computeGroupSafetyNumber(secret, group.groupId).then((d) =>
      setSafety(formatSafetyNumber(d))
    );
  }, [showSafety, group.groupId, group.groupSecret, group.lastKnownInviteCode, groupSecret]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, fileProgress?.percent]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
    setShowEmoji(false);
  };

  const sendLink = () => {
    let u = linkUrl.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u) && !/^www\./i.test(u)) {
      u = `https://${u}`;
    }
    const note = linkNote.trim();
    onSend(note ? `${note}\n${u}` : u);
    setLinkUrl("");
    setLinkNote("");
    setShowLinkBox(false);
  };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      alert(`文件过大（${formatSize(f.size)}），当前上限 ${MAX_FILE_BYTES / 1024 / 1024}MB`);
      if (fileRef.current) fileRef.current.value = "";
      if (imageRef.current) imageRef.current.value = "";
      return;
    }
    setFileProgress({ percent: 0, stage: "read", label: "准备传送…" });
    try {
      await onSendFile(f, setFileProgress);
      setTimeout(() => setFileProgress(null), 600);
    } catch {
      setFileProgress(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      if (imageRef.current) imageRef.current.value = "";
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  return (
    <div
      className="flex-1 flex flex-col h-full min-w-0 bg-[#f3efe6] relative text-[#1f2329]"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-40 bg-[#3d6b4f]/15 border-2 border-dashed border-[#3d6b4f] flex items-center justify-center pointer-events-none">
          <div className="text-center text-[#1f2329]">
            <div className="text-3xl mb-2">📎</div>
            <div className="text-sm font-medium">松开以加密传送文件</div>
            <div className="text-xs text-[#3d6b4f] mt-1">
              上限 {MAX_FILE_BYTES / 1024 / 1024}MB
            </div>
          </div>
        </div>
      )}

      <div className="h-14 shrink-0 border-b border-[#d9d9d9] bg-[#f7f7f7] flex items-center justify-between px-3 sm:px-5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              className="sm:hidden w-9 h-9 rounded-md bg-transparent text-[#1f2329] text-xl shrink-0"
              onClick={onBack}
              aria-label="返回"
            >
              ←
            </button>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate flex items-center gap-1.5">
              {group.name}
              {group.isAdmin && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3d6b4f]/15 text-[#3d6b4f] font-normal">
                  管理端
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#8a8a8a] truncate">
              {typeof memberCount === "number" ? `${memberCount} 人 · ` : ""}
              {group.isAdmin ? "管理端" : group.displayName} · 加密
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-wrap justify-end">
          {localMode && onSimulatePeer && (
            <button
              type="button"
              className="px-2 py-1.5 text-[11px] rounded-lg bg-[#e5f6ee] text-[#3d6b4f]"
              onClick={onSimulatePeer}
            >
              模拟
            </button>
          )}
          {onOpenMembers && (
            <button
              type="button"
              className="px-2 sm:px-2.5 py-1.5 text-xs rounded-lg bg-white hover:bg-[#f0f0f0] text-[#333] border border-[#d9d9d9]"
              onClick={onOpenMembers}
            >
              成员{typeof memberCount === "number" ? `(${memberCount})` : ""}
            </button>
          )}
          <button
            type="button"
            className="px-2 sm:px-2.5 py-1.5 text-xs rounded-lg bg-[#e5f6ee] text-[#3d6b4f] border border-[#c7ead8]"
            onClick={() => setShowSafety(true)}
          >
            安全码
          </button>
          {group.isAdmin && (
            <button
              type="button"
              className="px-2 sm:px-2.5 py-1.5 text-xs rounded-md bg-[#3d6b4f] text-white font-medium"
              onClick={onOpenAdmin}
            >
              邀请码
            </button>
          )}
          <button
            type="button"
            className="px-2 sm:px-2.5 py-1.5 text-xs rounded-lg bg-white text-[#e54d42] border border-[#ead0cd]"
            onClick={onLeave}
          >
            退出
          </button>
        </div>
      </div>

      {showSafety && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-5 max-w-sm w-full">
            <h3 className="text-sm font-semibold text-[#3d6b4f] mb-2">群安全码</h3>
            <p className="font-mono text-[11px] text-[#1f2329] leading-relaxed break-all mb-3">
              {safety || "…"}
            </p>
            <p className="text-[11px] text-[#8a8a8a] mb-4 leading-relaxed">
              与群友当面或语音逐位核对。一致 = 双方群密钥相同。
            </p>
            <button
              type="button"
              className="w-full py-2 text-sm rounded-lg bg-[#f2f2f2] text-[#333]"
              onClick={() => setShowSafety(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {showLinkBox && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#d9d9d9] rounded-xl p-5 max-w-sm w-full">
            <h3 className="text-sm font-semibold text-[#1f2329] mb-1">分享链接</h3>
            <p className="text-[11px] text-[#8a8a8a] mb-3">
              发送后对方会看到可点击的链接卡片（打开 / 复制）
            </p>
            <label className="text-xs text-[#6b7280] mb-1 block">网址</label>
            <input
              className="w-full bg-[#f7f7f7] border border-[#d9d9d9] rounded-lg px-3 py-2.5 mb-3 text-sm outline-none focus:border-[#3d6b4f] font-mono"
              placeholder="https://… 或 www.…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              autoFocus
            />
            <label className="text-xs text-[#6b7280] mb-1 block">备注（可选）</label>
            <input
              className="w-full bg-[#f7f7f7] border border-[#d9d9d9] rounded-lg px-3 py-2.5 mb-4 text-sm outline-none focus:border-[#3d6b4f]"
              placeholder="例如：会议纪要 / 资料下载"
              value={linkNote}
              onChange={(e) => setLinkNote(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-lg text-[#555] hover:bg-[#f2f2f2]"
                onClick={() => setShowLinkBox(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-md bg-[#3d6b4f] text-white disabled:opacity-40"
                disabled={!linkUrl.trim()}
                onClick={sendLink}
              >
                发送链接
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 wechat-chat-scroll">
        {messages.length === 0 ? (
          <div className="text-center mt-10 px-4 space-y-2">
            <p className="text-xs text-[#8a8a8a]">
              {localMode
                ? "本地调试中：发一条文字 / 点 🔗 链接 / 📎 文件，立即出现在下方。"
                : "还没有消息。可发文字、链接、图片或文件（端到端加密）。"}
            </p>
            {localMode && onSimulatePeer && (
              <button
                type="button"
                onClick={onSimulatePeer}
                className="text-xs text-[#3d6b4f] underline"
              >
                点这里模拟对方发来一条 →
              </button>
            )}
            {group.isAdmin && !localMode && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="text-xs text-[#3d6b4f] underline"
              >
                打开管理端，邀请手机 / 其它电脑加入 →
              </button>
            )}
            <p className="text-[11px] text-[#9a9a9a]">
              桌面端可直接把文件拖进此窗口
            </p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} msg={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {fileProgress && (
        <div className="px-3 sm:px-4 pb-1">
          <div className="rounded-xl border border-[#c7ead8] bg-[#e5f6ee] px-3 py-2.5">
            <div className="flex items-center justify-between text-[11px] text-[#3d6b4f] mb-1.5">
              <span className="truncate">加密传送 · {fileProgress.label}</span>
              <span className="shrink-0 tabular-nums ml-2">
                {fileProgress.percent}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#eaf1ec] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#3d6b4f] transition-all duration-200 ease-out"
                style={{ width: `${fileProgress.percent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div
        className="border-t border-[#d9d9d9] bg-[#f7f7f7] p-2 sm:p-3 relative"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {showEmoji && (
          <div className="absolute bottom-full mb-2 left-2 right-2 sm:right-auto sm:left-3 bg-white border border-[#d9d9d9] rounded-lg p-2 flex flex-wrap gap-1 shadow-xl z-10">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="text-xl p-1 hover:scale-110 transition-transform"
                onClick={() => setText((t) => t + e)}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1 sm:gap-1.5">
          <button
            type="button"
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-md bg-white hover:bg-[#f0f0f0] border border-[#d9d9d9] flex items-center justify-center text-base"
            onClick={() => setShowEmoji((s) => !s)}
            title="表情"
          >
            🙂
          </button>
          <button
            type="button"
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-md bg-white hover:bg-[#f0f0f0] border border-[#d9d9d9] flex items-center justify-center text-sm disabled:opacity-40"
            onClick={() => setShowLinkBox(true)}
            disabled={sendingFile}
            title="分享链接"
          >
            🔗
          </button>
          <button
            type="button"
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-md bg-white hover:bg-[#f0f0f0] border border-[#d9d9d9] flex items-center justify-center text-sm disabled:opacity-40"
            onClick={() => imageRef.current?.click()}
            disabled={sendingFile}
            title="发送图片"
          >
            🖼
          </button>
          <button
            type="button"
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-md bg-white hover:bg-[#f0f0f0] border border-[#d9d9d9] flex items-center justify-center text-sm disabled:opacity-40"
            onClick={() => fileRef.current?.click()}
            disabled={sendingFile}
            title={`加密传送文件（≤${MAX_FILE_BYTES / 1024 / 1024}MB）`}
          >
            {sendingFile ? "…" : "📎"}
          </button>
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
          <textarea
            className="flex-1 bg-[#f7f7f7] border border-[#d9d9d9] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#3d6b4f] resize-none min-h-[40px] max-h-28"
            placeholder="发消息"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const it of items) {
                if (it.kind === "file") {
                  const f = it.getAsFile();
                  if (f) {
                    e.preventDefault();
                    void handleFile(f);
                    return;
                  }
                }
              }
            }}
          />
          <button
            type="button"
            className="px-3 sm:px-4 py-2.5 text-sm rounded-md bg-[#3d6b4f] hover:bg-[#06ad56] text-white disabled:opacity-40 shrink-0 min-h-[40px]"
            disabled={!text.trim() || sendingFile}
            onClick={handleSend}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

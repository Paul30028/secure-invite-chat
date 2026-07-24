import { useEffect, useRef, useState, type DragEvent } from "react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage, LocalGroup } from "../lib/types";
import { MAX_FILE_BYTES, type FileSendProgress } from "../hooks/useChatEngine";

const EMOJIS = ["😀", "😂", "🥰", "😢", "😮", "👍", "👎", "🙏", "🎉", "❤️", "🔥", "✅"];

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
  onOpenMembers,
  onStartAudioCall,
  onStartVideoCall,
  callAvailable,
  memberCount,
  onBack,
  localMode,
}: {
  group: LocalGroup;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onSendFile: (file: File, onProgress?: (p: FileSendProgress) => void) => Promise<void> | void;
  onSimulatePeer?: () => void;
  onOpenAdmin: () => void;
  onOpenMembers?: () => void;
  onStartAudioCall?: () => void;
  onStartVideoCall?: () => void;
  callAvailable?: boolean;
  memberCount?: number;
  onLeave: () => void;
  onBack?: () => void;
  groupSecret: string;
  localMode?: boolean;
}) {
  const [text, setText] = useState("");
  const [fileProgress, setFileProgress] = useState<FileSendProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const sendingFile = fileProgress !== null && fileProgress.stage !== "done";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, fileProgress?.percent]);

  const handleSend = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };

  const handleFile = async (file: File | null) => {
    setShowActions(false);
    setShowEmoji(false);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert(`文件过大（${formatSize(file.size)}），当前上限 ${MAX_FILE_BYTES / 1024 / 1024}MB`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setFileProgress({ percent: 0, stage: "read", label: "准备发送…" });
    try {
      await onSendFile(file, setFileProgress);
      setTimeout(() => setFileProgress(null), 600);
    } catch {
      setFileProgress(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <main
      className="relative flex h-full min-w-0 flex-1 flex-col bg-[#ededed]"
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center border-2 border-dashed border-[#07c160] bg-white/92">
          <div className="text-center text-[#191919]">
            <div className="mb-2 text-3xl">📎</div>
            <p className="text-sm font-medium">松开即可发送文件</p>
            <p className="mt-1 text-xs text-[#888]">最大 {MAX_FILE_BYTES / 1024 / 1024}MB</p>
          </div>
        </div>
      )}

      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#dedede] bg-[#f7f7f7] px-2 sm:h-14 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[25px] font-light leading-none text-[#191919] active:bg-[#e8e8e8]"
              onClick={onBack}
              aria-label="返回聊天列表"
            >
              ←
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-medium text-[#191919]">{group.name}</h1>
            <p className="truncate text-[11px] text-[#999]">
              {typeof memberCount === "number" ? `${memberCount} 位成员` : group.displayName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {callAvailable && (
            <>
              <button type="button" className="grid h-10 w-9 place-items-center rounded-full text-lg text-[#555] active:bg-[#e8e8e8]" onClick={onStartAudioCall} aria-label="语音通话" title="语音通话">☎</button>
              <button type="button" className="grid h-10 w-9 place-items-center rounded-full text-lg text-[#555] active:bg-[#e8e8e8]" onClick={onStartVideoCall} aria-label="视频通话" title="视频通话">▣</button>
            </>
          )}
          {onOpenMembers && (
            <button
              type="button"
              className="grid h-10 w-9 place-items-center rounded-full text-[22px] text-[#555] active:bg-[#e8e8e8]"
              onClick={onOpenMembers}
              aria-label="查看聊天成员"
              title="聊天成员"
            >
              ⋯
            </button>
          )}
        </div>
      </header>

      <section className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
        {messages.length === 0 ? (
          <div className="mx-auto mt-16 max-w-xs text-center">
            <p className="text-sm text-[#999]">暂时没有消息</p>
            <p className="mt-2 text-xs leading-relaxed text-[#aaa]">
              输入文字、粘贴链接，或点左下角按钮发送图片和文件。
            </p>
            {localMode && onSimulatePeer && (
              <button
                type="button"
                onClick={onSimulatePeer}
                className="mt-4 text-xs text-[#576b95] hover:underline"
              >
                模拟收到一条消息
              </button>
            )}
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} msg={message} />)
        )}
        <div ref={bottomRef} />
      </section>

      {fileProgress && (
        <div className="border-t border-[#dedede] bg-white px-3 pt-2 sm:px-4">
          <div className="flex items-center gap-3 rounded-lg bg-[#f7f7f7] px-3 py-2">
            <span className="text-sm">📎</span>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-[11px] text-[#666]">
                <span className="truncate">{fileProgress.label}</span>
                <span>{fileProgress.percent}%</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#dedede]">
                <div className="h-full rounded-full bg-[#07c160] transition-all" style={{ width: `${fileProgress.percent}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <footer
        className="border-t border-[#d8d8d8] bg-[#f7f7f7] px-2 py-2 sm:px-3"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {showEmoji && (
          <div className="mb-2 grid grid-cols-6 gap-1 rounded-xl bg-white p-2 shadow-sm sm:max-w-sm">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="grid h-10 place-items-center rounded-lg text-xl active:bg-[#f2f2f2]"
                onClick={() => {
                  setText((value) => value + emoji);
                  setShowEmoji(false);
                }}
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {showActions && (
          <div className="mb-2 grid grid-cols-3 gap-2 rounded-xl bg-white p-2 shadow-sm sm:max-w-sm">
            <button type="button" className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg text-xs text-[#555] active:bg-[#f2f2f2]" onClick={() => imageRef.current?.click()} disabled={sendingFile}>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f5f5f5] text-xl">▣</span>图片
            </button>
            <button type="button" className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg text-xs text-[#555] active:bg-[#f2f2f2]" onClick={() => fileRef.current?.click()} disabled={sendingFile}>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f5f5f5] text-xl">⌑</span>文件
            </button>
            {localMode && onSimulatePeer ? (
              <button type="button" className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg text-xs text-[#555] active:bg-[#f2f2f2]" onClick={() => { setShowActions(false); onSimulatePeer(); }}>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f5f5f5] text-xl">◌</span>测试消息
              </button>
            ) : <div className="min-h-20" />}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            className="grid h-10 w-9 shrink-0 place-items-center rounded-lg text-xl text-[#555] active:bg-[#e8e8e8]"
            onClick={() => {
              setShowEmoji((open) => !open);
              setShowActions(false);
            }}
            aria-label="选择表情"
            title="表情"
          >
            ☺
          </button>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xl text-[#555] hover:bg-[#e8e8e8] disabled:opacity-40"
            onClick={() => setShowActions((open) => !open)}
            disabled={sendingFile}
            title="更多发送方式"
            aria-label="更多发送方式"
          >
            {sendingFile ? "…" : "+"}
          </button>
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0] || null)}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0] || null)}
          />
          <textarea
            className="min-h-10 max-h-28 flex-1 resize-none rounded-md border border-[#dedede] bg-white px-3 py-2 text-sm leading-5 text-[#191919] outline-none placeholder:text-[#aaa] focus:border-[#b5b5b5]"
            placeholder="输入消息"
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            onPaste={(event) => {
              const items = event.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.kind === "file") {
                  const file = item.getAsFile();
                  if (file) {
                    event.preventDefault();
                    void handleFile(file);
                    return;
                  }
                }
              }
            }}
          />
          <button
            type="button"
            className="h-10 shrink-0 rounded-md bg-[#07c160] px-4 text-sm text-white hover:bg-[#06ad56] disabled:bg-[#b9ddc5]"
            disabled={!text.trim() || sendingFile}
            onClick={handleSend}
          >
            发送
          </button>
        </div>
        <p className="mt-1 hidden text-[10px] text-[#aaa] sm:block">Enter 发送 · Shift + Enter 换行 · 可直接粘贴链接或图片</p>
      </footer>
    </main>
  );
}

import { useMemo, useRef, useState } from "react";
import {
  createMatrixDemoRoom,
  loginMatrixDemo,
  sendMatrixDemoText,
  sendMatrixDemoFile,
  syncMatrixDemo,
  type MatrixDemoRoom,
  type MatrixDemoSession,
} from "../lib/matrixDemoClient";
import { getMatrixHomeserverUrl } from "../lib/matrixConfig";

function mergeRooms(oldRooms: MatrixDemoRoom[], nextRooms: MatrixDemoRoom[]) {
  const byId = new Map(oldRooms.map((room) => [room.roomId, room]));
  for (const room of nextRooms) {
    const old = byId.get(room.roomId);
    const messages = new Map((old?.messages || []).map((message) => [message.eventId, message]));
    room.messages.forEach((message) => messages.set(message.eventId, message));
    byId.set(room.roomId, {
      ...room,
      name: room.name === room.roomId && old?.name ? old.name : room.name,
      messages: [...messages.values()].sort((a, b) => a.timestamp - b.timestamp),
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function MatrixDemoModal({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<MatrixDemoSession | null>(null);
  const [rooms, setRooms] = useState<MatrixDemoRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRoom = useMemo(
    () => rooms.find((room) => room.roomId === activeRoomId),
    [rooms, activeRoomId]
  );

  const refresh = async (activeSession: MatrixDemoSession) => {
    const result = await syncMatrixDemo(activeSession);
    setRooms((current) => mergeRooms(current, result.rooms));
    setSession({ ...activeSession, nextBatch: result.nextBatch });
    setActiveRoomId((current) => current || result.rooms[0]?.roomId || "");
  };

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Matrix 操作失败");
    } finally {
      setBusy(false);
    }
  };

  const login = () =>
    act(async () => {
      const next = await loginMatrixDemo(getMatrixHomeserverUrl(), username, password);
      setPassword("");
      setSession(next);
      await refresh(next);
      setNotice("登录成功；会话令牌仅保留在当前窗口内存中。");
    });

  const createRoom = () =>
    session &&
    act(async () => {
      const roomId = await createMatrixDemoRoom(session, newRoom);
      setNewRoom("");
      setActiveRoomId(roomId);
      await refresh(session);
      setNotice("私有房间已创建。");
    });

  const send = () =>
    session &&
    activeRoomId &&
    act(async () => {
      await sendMatrixDemoText(session, activeRoomId, draft);
      setDraft("");
      await refresh(session);
    });

  const sendFile = (file: File) =>
    session &&
    activeRoomId &&
    act(async () => {
      await sendMatrixDemoFile(session, activeRoomId, file);
      await refresh(session);
      setNotice("文件已发送。");
    });

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-3">
      <div className="flex max-h-[94vh] w-full max-w-[820px] flex-col overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[#30363d] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Matrix 功能 Demo</h2>
            <p className="mt-1 text-xs text-slate-500">登录、私有房间、同步与文字发送；尚未启用端到端加密。</p>
          </div>
          <button type="button" className="px-2 py-1 text-slate-400" onClick={onClose}>关闭</button>
        </header>

        {!session ? (
          <div className="mx-auto w-full max-w-md p-6">
            <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2 text-[11px] text-red-200">
              功能测试专用：此阶段消息是 Matrix 明文事件。密码不会写入本地存储。
            </p>
            <label className="mb-1 block text-xs text-slate-400">Matrix 用户名</label>
            <input className="mb-3 w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@name:example.com" autoComplete="username" />
            <label className="mb-1 block text-xs text-slate-400">密码</label>
            <input className="mb-4 w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" onKeyDown={(event) => { if (event.key === "Enter") void login(); }} />
            <button type="button" disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold disabled:opacity-40" onClick={() => void login()}>{busy ? "正在登录…" : "登录 Matrix Demo"}</button>
            {notice && <p className="mt-3 text-xs text-amber-200">{notice}</p>}
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-1 flex-col sm:flex-row">
            <aside className="overflow-y-auto border-b border-[#30363d] p-3 sm:w-72 sm:border-b-0 sm:border-r">
              <p className="mb-3 break-all text-[10px] text-slate-500">{session.userId}<span className="mt-1 block">{session.homeserverUrl}</span></p>
              <div className="mb-3 flex gap-2">
                <input className="min-w-0 flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-2 text-xs outline-none focus:border-indigo-500" value={newRoom} onChange={(event) => setNewRoom(event.target.value)} placeholder="新房间名称" />
                <button type="button" disabled={busy || !newRoom.trim()} className="rounded-lg bg-indigo-600 px-3 text-xs disabled:opacity-40" onClick={() => void createRoom()}>创建</button>
              </div>
              <div className="space-y-1">
                {rooms.map((room) => <button key={room.roomId} type="button" onClick={() => setActiveRoomId(room.roomId)} className={"w-full rounded-lg px-3 py-2 text-left text-xs " + (activeRoomId === room.roomId ? "bg-indigo-600 text-white" : "bg-[#21262d] text-slate-300")}><span className="block truncate">{room.name}</span><span className="block truncate text-[9px] opacity-60">{room.roomId}</span></button>)}
                {!rooms.length && <p className="p-2 text-xs text-slate-500">没有已加入的房间。</p>}
              </div>
            </aside>
            <main className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{activeRoom?.name || "请选择房间"}</p><p className="truncate text-[9px] text-slate-600">{activeRoom?.roomId || ""}</p></div>
                <button type="button" disabled={busy} className="rounded-md bg-[#21262d] px-3 py-1.5 text-[11px] text-slate-300 disabled:opacity-40" onClick={() => void act(() => refresh(session))}>刷新同步</button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {activeRoom?.messages.map((message) => <div key={message.eventId} className={"max-w-[85%] rounded-xl px-3 py-2 text-sm " + (message.sender === session.userId ? "ml-auto bg-indigo-600 text-white" : "bg-[#21262d] text-slate-200")}><p className="mb-1 break-all text-[9px] opacity-60">{message.sender}</p>{message.kind === "file" ? <a className="block break-all underline" href={message.mediaUrl} target="_blank" rel="noreferrer">📎 {message.body}{message.size ? " · " + Math.ceil(message.size / 1024) + " KB" : ""}</a> : <p className="whitespace-pre-wrap break-words">{/^https?:\/\//i.test(message.body) ? <a className="underline" href={message.body} target="_blank" rel="noreferrer">{message.body}</a> : message.body}</p>}</div>)}
                {activeRoom && !activeRoom.messages.length && <p className="mt-8 text-center text-xs text-slate-600">房间内暂无文字消息。</p>}
              </div>
              <div className="border-t border-[#30363d] p-3">
                {notice && <p className="mb-2 text-[11px] text-amber-200">{notice}</p>}
                <div className="flex gap-2"><input ref={fileInputRef} className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void sendFile(file); }} /><button type="button" disabled={busy || !activeRoom} className="rounded-lg bg-[#21262d] px-3 text-xs text-slate-200 disabled:opacity-40" onClick={() => fileInputRef.current?.click()}>文件</button><input className="min-w-0 flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!activeRoom} placeholder={activeRoom ? "输入消息或链接" : "请先选择房间"} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void send(); } }} /><button type="button" disabled={busy || !activeRoom || !draft.trim()} className="rounded-lg bg-indigo-600 px-4 text-sm font-semibold disabled:opacity-40" onClick={() => void send()}>发送</button></div><p className="mt-2 text-[10px] text-slate-600">文件最大 10 MB；链接会以可点击文本显示。</p>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

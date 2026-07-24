import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";
import { useChatEngine } from "./hooks/useChatEngine";
import { useAndroidBackButton } from "./hooks/useAndroidBackButton";
import { Sidebar } from "./components/Sidebar";
import { ChatWindow } from "./components/ChatWindow";
import { CreateGroupModal } from "./components/CreateGroupModal";
import { JoinGroupModal } from "./components/JoinGroupModal";
import { AdminPanel } from "./components/AdminPanel";
import { SettingsModal } from "./components/SettingsModal";
import { Onboarding } from "./components/Onboarding";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { AdminHome } from "./components/AdminHome";
import { MembersPanel } from "./components/MembersPanel";

function App() {
  const {
    deviceId,
    groups,
    activeGroupId,
    setActiveGroupId,
    messages,
    membersByGroup,
    phoneHints,
    status,
    errorMsg,
    securityAlert,
    clearSecurityAlert,
    createGroup,
    joinGroup,
    sendMessage,
    sendFile,
    simulatePeerMessage,
    regenerateCode,
    leaveGroup,
    refreshMembers,
    kickMember,
    getShareInvite,
    getGroupSecret,
    reconnect,
    applyModeFromSettings,
    localMode,
  } = useChatEngine();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const activeGroup = groups.find((g) => g.groupId === activeGroupId) || null;
  const mobileShowSidebar = !activeGroupId;
  const showOnboarding = groups.length === 0 && !activeGroup;
  const activeMembers = activeGroup ? membersByGroup[activeGroup.groupId] || [] : [];

  // 创建群后弹出邀请码（真机验收：管理端发码）
  const prevAdminIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const adminIds = new Set(groups.filter((g) => g.isAdmin).map((g) => g.groupId));
    let newlyCreated: string | null = null;
    for (const id of adminIds) {
      if (!prevAdminIds.current.has(id)) {
        newlyCreated = id;
        break;
      }
    }
    prevAdminIds.current = adminIds;
    if (newlyCreated && activeGroupId === newlyCreated) {
      setShowAdmin(true);
    }
  }, [groups, activeGroupId]);

  // 进入群时拉成员列表
  useEffect(() => {
    if (activeGroup && !localMode) {
      refreshMembers(activeGroup.groupId);
    }
  }, [activeGroup?.groupId, localMode, refreshMembers]);

  const backToList = useCallback(() => setActiveGroupId(null), [setActiveGroupId]);

  // Android 物理返回键：先关最上层弹窗 → 再退回群列表 → 最后才退出 App
  // （之前反复出现"进入管理员界面后退不出"，根因是从未接管过硬件返回键）
  useAndroidBackButton({
    closers: [
      [showSettings, () => setShowSettings(false)],
      [showMembers, () => setShowMembers(false)],
      [showAdmin, () => setShowAdmin(false)],
      [showJoin, () => setShowJoin(false)],
      [showCreate, () => setShowCreate(false)],
    ],
    hasActiveGroup: !!activeGroupId,
    onBackToList: backToList,
  });

  return (
    <div
      className="flex h-full min-h-[100vh] w-full overflow-hidden flex-col"
      style={{ minHeight: "100vh", height: "100%" }}
    >
      <ConnectionBanner status={status} onSettings={() => setShowSettings(true)} />

      <div className="flex flex-1 min-h-0">
        {!showOnboarding && (
          <Sidebar
            groups={groups}
            activeGroupId={activeGroupId}
            onSelect={setActiveGroupId}
            onCreate={() => setShowCreate(true)}
            onJoin={() => setShowJoin(true)}
            onSettings={() => setShowSettings(true)}
            onOpenAdmin={() => setShowAdmin(true)}
            status={status}
            mobileOpen={mobileShowSidebar}
          />
        )}

        {showOnboarding ? (
          <Onboarding
            status={status}
            phoneHints={phoneHints}
            onConnectedSetup={() => {
              void reconnect();
            }}
            onOpenSettings={() => setShowSettings(true)}
            onCreate={() => setShowCreate(true)}
            onJoin={() => setShowJoin(true)}
          />
        ) : activeGroup ? (
          <ChatWindow
            group={activeGroup}
            messages={messages[activeGroup.groupId] || []}
            onSend={(text) => sendMessage(activeGroup.groupId, text)}
            onSendFile={(file, onProgress) => sendFile(activeGroup.groupId, file, onProgress)}
            onSimulatePeer={
              localMode ? () => void simulatePeerMessage(activeGroup.groupId) : undefined
            }
            onOpenAdmin={() => setShowAdmin(true)}
            onOpenMembers={() => {
              if (!localMode) refreshMembers(activeGroup.groupId);
              setShowMembers(true);
            }}
            memberCount={activeMembers.length || undefined}
            onLeave={() => leaveGroup(activeGroup.groupId)}
            onBack={() => setActiveGroupId(null)}
            groupSecret={getGroupSecret(activeGroup.groupId)}
            localMode={localMode}
          />
        ) : (
          <AdminHome
            status={status}
            hasGroups={groups.length > 0}
            onCreate={() => setShowCreate(true)}
            onJoin={() => setShowJoin(true)}
            onSettings={() => setShowSettings(true)}
          />
        )}
      </div>

      {showCreate && (
        <CreateGroupModal onClose={() => setShowCreate(false)} onCreate={createGroup} />
      )}
      {showJoin && <JoinGroupModal onClose={() => setShowJoin(false)} onJoin={joinGroup} />}
      {showAdmin && activeGroup && activeGroup.isAdmin && (
        <AdminPanel
          group={activeGroup}
          shareInvite={getShareInvite(activeGroup.groupId)}
          groupSecret={getGroupSecret(activeGroup.groupId)}
          onClose={() => setShowAdmin(false)}
          onRegenerate={() => regenerateCode(activeGroup.groupId)}
        />
      )}
      {showMembers && activeGroup && (
        <MembersPanel
          group={activeGroup}
          members={activeMembers}
          myDeviceId={deviceId}
          onClose={() => setShowMembers(false)}
          onRefresh={() => refreshMembers(activeGroup.groupId)}
          onKick={(id) => kickMember(activeGroup.groupId, id)}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            applyModeFromSettings();
            void reconnect();
          }}
        />
      )}

      {securityAlert && (
        <div className="fixed top-14 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md bg-red-900/95 border border-red-500 text-white text-sm px-4 py-3 rounded-lg shadow-xl z-[70]">
          <div className="font-semibold mb-1">安全警报</div>
          <p className="text-xs leading-relaxed mb-2">{securityAlert}</p>
          <button
            className="text-xs underline text-red-200"
            onClick={clearSecurityAlert}
            type="button"
          >
            已知晓
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm bg-red-600/90 text-white text-sm px-4 py-2 rounded-lg shadow-xl z-[60]">
          {errorMsg}
        </div>
      )}
    </div>
  );
}

export default App;

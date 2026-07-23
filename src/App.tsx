import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useChatEngine } from "./hooks/useChatEngine";
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
import { MatrixDemoModal } from "./components/MatrixDemoModal";
import { PublicNoticeModal } from "./components/PublicNoticeModal";
import { CallOverlay } from "./components/CallOverlay";
import { useCallEngine } from "./hooks/useCallEngine";

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
    openDemoChat,
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

  const callEngine = useCallEngine(deviceId);

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMatrixDemo, setShowMatrixDemo] = useState(false);
  // 公开公告是应用首页，用户无需先进入设置。
  const [showPublicNotices, setShowPublicNotices] = useState(true);

  const activeGroup = groups.find((g) => g.groupId === activeGroupId) || null;
  const mobileShowSidebar = !activeGroupId;
  const showOnboarding = groups.length === 0 && !activeGroup;
  const activeMembers = activeGroup ? membersByGroup[activeGroup.groupId] || [] : [];
  const callPeer = activeMembers.find((member) => member.deviceId !== deviceId && member.online) || null;

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
            onOpenDemo={() => void openDemoChat()}
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
            callAvailable={!localMode && !!callPeer}
            onStartAudioCall={() => {
              if (callPeer) void callEngine.startCall(activeGroup.groupId, { deviceId: callPeer.deviceId, displayName: callPeer.displayName }, "audio", activeGroup.displayName);
            }}
            onStartVideoCall={() => {
              if (callPeer) void callEngine.startCall(activeGroup.groupId, { deviceId: callPeer.deviceId, displayName: callPeer.displayName }, "video", activeGroup.displayName);
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
          onOpenPublicNotices={() => {
            setShowSettings(false);
            setShowPublicNotices(true);
          }}
          onOpenMatrixDemo={() => {
            setShowSettings(false);
            setShowMatrixDemo(true);
          }}
          onSaved={() => {
            applyModeFromSettings();
            void reconnect();
          }}
        />
      )}
      {showMatrixDemo && <MatrixDemoModal onClose={() => setShowMatrixDemo(false)} />}
      {showPublicNotices && (
        <PublicNoticeModal
          onClose={() => setShowPublicNotices(false)}
          onEnterChat={() => void openDemoChat()}
        />
      )}

      {callEngine.call && (
        <CallOverlay
          call={callEngine.call}
          localStream={callEngine.localStream}
          remoteStream={callEngine.remoteStream}
          onAccept={() => void callEngine.acceptCall()}
          onReject={callEngine.rejectCall}
          onEnd={callEngine.endCall}
          onToggleAudio={callEngine.toggleAudio}
          onToggleVideo={callEngine.toggleVideo}
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

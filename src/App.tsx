import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { useChatEngine } from "./hooks/useChatEngine";
import { useCallEngine } from "./hooks/useCallEngine";
import { useAndroidBackButton } from "./hooks/useAndroidBackButton";
import { usePrivateData } from "./hooks/usePrivateData";
import { loadAppProfile, saveAppProfile, type AppProfile } from "./lib/appProfile";
import { rememberMembers } from "./lib/privateStore";
import { Sidebar } from "./components/Sidebar";
import { ChatWindow } from "./components/ChatWindow";
import { CreateGroupModal } from "./components/CreateGroupModal";
import { JoinGroupModal } from "./components/JoinGroupModal";
import { AdminPanel } from "./components/AdminPanel";
import { SettingsModal, type AdminSettingsAction } from "./components/SettingsModal";
import { Onboarding } from "./components/Onboarding";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { AdminHome } from "./components/AdminHome";
import { MembersPanel } from "./components/MembersPanel";
import { SectionNav, type AppSection } from "./components/SectionNav";
import { ContactsPage } from "./components/ContactsPage";
import { InvitesPage } from "./components/InvitesPage";
import { MePage } from "./components/MePage";
import { DailyNoticeBar } from "./components/DailyNoticeBar";
import { FirstUserSetup, NoticeEntrance, SplashScreen } from "./components/LaunchScreens";
import { CallPeerPicker } from "./components/CallPeerPicker";
import { CallOverlay } from "./components/CallOverlay";

type GateStage = "splash" | "notice" | "setup" | "app";

const fallbackProfile: AppProfile = {
  displayName: "我",
  avatar: "🌾",
  notifications: true,
  callRingtone: true,
  readReceipts: true,
  autoDownloadWifi: false,
  completedAt: 0,
};

export default function App() {
  const engine = useChatEngine();
  const calls = useCallEngine(engine.deviceId);
  const local = usePrivateData();
  const [profile, setProfile] = useState<AppProfile | null>(() => loadAppProfile());
  const [gate, setGate] = useState<GateStage>("splash");
  const [section, setSection] = useState<AppSection>("messages");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [callMode, setCallMode] = useState<"audio" | "video" | null>(null);
  const active = engine.groups.find((group) => group.groupId === engine.activeGroupId) || null;
  const members = active ? engine.membersByGroup[active.groupId] || [] : [];
  const onlineMembers = members.filter((member) => member.online && member.deviceId !== engine.deviceId);
  const onboarding = engine.groups.length === 0 && !active;
  const adminGroup = active?.isAdmin ? active : engine.groups.find((group) => group.isAdmin) || null;
  const entranceNotice = [
    engine.dailyNotice.dailyDevotion,
    engine.dailyNotice.hymn,
    engine.dailyNotice.scripture,
  ].filter(Boolean).join("\n\n");

  useEffect(() => {
    const timer = setTimeout(() => setGate("notice"), 1900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    Object.entries(engine.membersByGroup).forEach(([id, list]) => {
      void rememberMembers(id, engine.deviceId, list).then(local.refresh);
    });
  }, [engine.membersByGroup, engine.deviceId, local.refresh]);

  const back = useCallback(() => {
    engine.setActiveGroupId(null);
    setSection("messages");
  }, [engine]);

  useAndroidBackButton({
    closers: [
      [showSettings, () => setShowSettings(false)],
      [showMembers, () => setShowMembers(false)],
      [showAdmin, () => setShowAdmin(false)],
      [showJoin, () => setShowJoin(false)],
      [showCreate, () => setShowCreate(false)],
    ],
    hasActiveGroup: !!engine.activeGroupId || section !== "messages",
    onBackToList: back,
  });

  const prevAdmins = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(engine.groups.filter((group) => group.isAdmin).map((group) => group.groupId));
    if ([...now].some((id) => !prevAdmins.current.has(id)) && section === "messages") setShowAdmin(true);
    prevAdmins.current = now;
  }, [engine.groups, section]);

  const updateProfile = (next: Omit<AppProfile, "completedAt">) => {
    setProfile(saveAppProfile(next));
  };

  const openAdminAction = (action: AdminSettingsAction) => {
    if (!adminGroup) return;
    engine.setActiveGroupId(adminGroup.groupId);
    setShowSettings(false);
    if (action === "members") {
      engine.refreshMembers(adminGroup.groupId);
      setShowMembers(true);
      return;
    }
    setShowAdmin(true);
  };

  if (gate === "splash") return <SplashScreen />;
  if (gate === "notice") {
    return <NoticeEntrance notice={entranceNotice} status={engine.status} onEnter={() => setGate(profile ? "app" : "setup")} />;
  }
  if (gate === "setup") {
    return <FirstUserSetup onComplete={(next) => { updateProfile(next); setGate("app"); }} />;
  }

  const content = onboarding
    ? <Onboarding status={engine.status} phoneHints={engine.phoneHints} onConnectedSetup={() => void engine.reconnect()} onOpenSettings={() => setShowSettings(true)} onCreate={() => setShowCreate(true)} onJoin={() => setShowJoin(true)} />
    : section === "contacts"
      ? <ContactsPage contacts={Object.values(local.data?.contacts || {})} onUpdate={(id, patch) => void local.update((data) => ({ ...data, contacts: { ...data.contacts, [id]: { ...data.contacts[id]!, ...patch } } }))} />
      : section === "invites"
        ? <InvitesPage pending={local.data?.pendingInvites || []} groups={engine.groups} onCreate={() => setShowCreate(true)} onOpenAdmin={(group) => { engine.setActiveGroupId(group.groupId); setShowAdmin(true); }} onStage={(raw) => void local.update((data) => ({ ...data, pendingInvites: [...data.pendingInvites, { id: crypto.randomUUID(), raw, createdAt: Date.now() }] }))} onAccept={(raw) => { setShowJoin(true); void local.update((data) => ({ ...data, pendingInvites: data.pendingInvites.filter((item) => item.raw !== raw) })); }} onRemove={(id) => void local.update((data) => ({ ...data, pendingInvites: data.pendingInvites.filter((item) => item.id !== id) }))} />
        : section === "me" && local.data
          ? <MePage
              deviceId={engine.deviceId}
              data={local.data}
              onSettings={() => setShowSettings(true)}
              onRestore={(data) => void local.update(() => data)}
              onOpenAbout={() => setShowSettings(true)}
            />
          : active
            ? <ChatWindow
                group={active}
                messages={engine.messages[active.groupId] || []}
                onSend={(text) => engine.sendMessage(active.groupId, text)}
                onSendFile={(file, progress) => engine.sendFile(active.groupId, file, progress)}
                onSimulatePeer={engine.localMode ? () => void engine.simulatePeerMessage(active.groupId) : undefined}
                onOpenAdmin={() => setShowAdmin(true)}
                onOpenMembers={() => { engine.refreshMembers(active.groupId); setShowMembers(true); }}
                memberCount={members.length}
                onlineMembers={onlineMembers}
                callAvailable={onlineMembers.length > 0}
                onStartAudio={() => setCallMode("audio")}
                onStartVideo={() => setCallMode("video")}
                onLeave={() => engine.leaveGroup(active.groupId)}
                onBack={back}
                groupSecret={engine.getGroupSecret(active.groupId)}
                localMode={engine.localMode}
                dailyNotice={engine.dailyNotice.scripture || engine.dailyNotice.dailyDevotion}
              />
            : <AdminHome status={engine.status} hasGroups={engine.groups.length > 0} onCreate={() => setShowCreate(true)} onJoin={() => setShowJoin(true)} onSettings={() => setShowSettings(true)} />;

  const chatFocused = section === "messages" && !!active && !onboarding;

  return <div className="flex h-full min-h-[100vh] w-full overflow-hidden flex-col">
    {!chatFocused && <ConnectionBanner status={engine.status} onSettings={() => void engine.reconnect()} />}
    {!chatFocused && <DailyNoticeBar notice={engine.dailyNotice} />}
    {engine.maintenance && <div className="bg-red-600 px-4 py-2 text-center text-xs text-white">系统维护中，非管理员暂时无法收发消息。</div>}
    <div className="flex min-h-0 flex-1">
      {!chatFocused && <SectionNav active={section} onChange={setSection} desktop />}
      {section === "messages" && !onboarding && !chatFocused && <Sidebar groups={engine.groups} activeGroupId={engine.activeGroupId} onSelect={engine.setActiveGroupId} onCreate={() => setShowCreate(true)} onJoin={() => setShowJoin(true)} onSettings={() => setShowSettings(true)} onOpenAdmin={() => setShowAdmin(true)} status={engine.status} mobileOpen={!engine.activeGroupId} preferences={local.data?.conversationPrefs} onConversationAction={(id, action) => void local.update((data) => ({ ...data, conversationPrefs: { ...data.conversationPrefs, [id]: { ...data.conversationPrefs[id], [action === "pin" ? "pinned" : action === "mute" ? "muted" : action === "unread" ? "unread" : "hidden"]: !data.conversationPrefs[id]?.[action === "pin" ? "pinned" : action === "mute" ? "muted" : action === "unread" ? "unread" : "hidden"] } } }))} />}
      {content}
    </div>
    {!onboarding && !chatFocused && <SectionNav active={section} onChange={setSection} />}
    {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreate={engine.createGroup} />}
    {showJoin && <JoinGroupModal onClose={() => setShowJoin(false)} onJoin={engine.joinGroup} />}
    {showAdmin && active?.isAdmin && <AdminPanel group={active} shareInvite={engine.getShareInvite(active.groupId)} groupSecret={engine.getGroupSecret(active.groupId)} onClose={() => setShowAdmin(false)} onRegenerate={() => engine.regenerateCode(active.groupId)} onRotateKey={() => void engine.rotateGroupKeyNow(active.groupId)} onRevoke={() => engine.revokeInvite(active.groupId)} onSetExpiry={(hours) => engine.setInviteExpiry(active.groupId, hours)} onPublishNotice={(notice) => engine.publishDailyNotice(active.groupId, notice)} onMaintenance={(enabled) => engine.setMaintenanceMode(active.groupId, enabled)} />}
    {showMembers && active && <MembersPanel group={active} members={members} myDeviceId={engine.deviceId} onClose={() => setShowMembers(false)} onRefresh={() => engine.refreshMembers(active.groupId)} onKick={(id) => engine.kickMember(active.groupId, id)} onMute={(id) => engine.muteMember(active.groupId, id, true)} onShareHistory={(id) => void engine.shareHistoryWithMember(active.groupId, id)} />}
    {showSettings && <SettingsModal profile={profile || fallbackProfile} status={engine.status} adminAvailable={!!adminGroup} adminGroupName={adminGroup?.name} onClose={() => setShowSettings(false)} onSaved={() => void engine.reconnect()} onProfileChange={updateProfile} onAdminAction={openAdminAction} />}
    {callMode && active && <CallPeerPicker mode={callMode} peers={onlineMembers} onClose={() => setCallMode(null)} onSelect={(peer) => { const mode = callMode; setCallMode(null); void calls.startCall(active.groupId, peer, mode, profile?.displayName || active.displayName || "我"); }} />}
    {calls.call && <CallOverlay call={calls.call} localStream={calls.localStream} remoteStream={calls.remoteStream} onAccept={() => void calls.acceptCall()} onReject={calls.rejectCall} onEnd={calls.endCall} onToggleAudio={calls.toggleAudio} onToggleVideo={calls.toggleVideo} onSwitchCamera={() => void calls.switchCamera()} audioMuted={calls.audioMuted} videoPaused={calls.videoPaused} />}
    {engine.errorMsg && <div className="fixed bottom-20 left-4 right-4 z-[60] rounded-lg bg-red-600/90 px-4 py-2 text-sm text-white shadow-xl sm:left-auto sm:right-4 sm:max-w-sm">{engine.errorMsg}</div>}
  </div>;
}

import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { useChatEngine } from "./hooks/useChatEngine";
import { useAndroidBackButton } from "./hooks/useAndroidBackButton";
import { usePrivateData } from "./hooks/usePrivateData";
import { rememberMembers } from "./lib/privateStore";
import { getLocalProfile } from "./lib/localProfile";
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
import { SectionNav, type AppSection } from "./components/SectionNav";
import { ContactsPage } from "./components/ContactsPage";
import { InvitesPage } from "./components/InvitesPage";
import { MePage } from "./components/MePage";
import { DailyNoticeBar } from "./components/DailyNoticeBar";
import { SplashScreen } from "./components/SplashScreen";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ProfileSetupScreen } from "./components/ProfileSetupScreen";
import { AboutScreen } from "./components/AboutScreen";
import { AdminSettingsScreen } from "./components/AdminSettingsScreen";

type FlowStage = "splash" | "welcome" | "profile" | "main";

export default function App() {
  const engine = useChatEngine();
  const local = usePrivateData();
  const [section, setSection] = useState<AppSection>("messages");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);

  const [stage, setStage] = useState<FlowStage>("splash");

  const active = engine.groups.find((g) => g.groupId === engine.activeGroupId) || null;
  const members = active ? engine.membersByGroup[active.groupId] || [] : [];
  const onboarding = engine.groups.length === 0 && !active;

  useEffect(() => {
    Object.entries(engine.membersByGroup).forEach(([id, list]) =>
      void rememberMembers(id, engine.deviceId, list).then(local.refresh)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.membersByGroup, engine.deviceId, local.refresh]);

  const back = useCallback(() => {
    engine.setActiveGroupId(null);
    setSection("messages");
  }, [engine]);

  useAndroidBackButton({
    closers: [
      [showAdminSettings, () => setShowAdminSettings(false)],
      [showAbout, () => setShowAbout(false)],
      [showSettings, () => setShowSettings(false)],
      [showMembers, () => setShowMembers(false)],
      [showAdmin, () => setShowAdmin(false)],
      [showJoin, () => setShowJoin(false)],
      [showCreate, () => setShowCreate(false)],
    ],
    hasActiveGroup: !!engine.activeGroupId || section !== "messages",
    onBackToList: back,
  });

  const enterMainApp = useCallback(() => {
    setStage(getLocalProfile() ? "main" : "profile");
  }, []);

  if (stage === "splash") {
    return <SplashScreen onDone={() => setStage("welcome")} scripture={engine.dailyNotice.scripture} />;
  }
  if (stage === "welcome") {
    return <WelcomeScreen status={engine.status} notice={engine.dailyNotice} onEnter={enterMainApp} />;
  }
  if (stage === "profile") {
    return <ProfileSetupScreen onDone={() => setStage("main")} />;
  }

  const content = onboarding ? (
    <Onboarding
      status={engine.status}
      phoneHints={engine.phoneHints}
      onConnectedSetup={() => void engine.reconnect()}
      onOpenSettings={() => setShowSettings(true)}
      onCreate={() => setShowCreate(true)}
      onJoin={() => setShowJoin(true)}
    />
  ) : section === "contacts" ? (
    <ContactsPage
      contacts={Object.values(local.data?.contacts || {})}
      onUpdate={(id, patch) =>
        void local.update((d) => ({ ...d, contacts: { ...d.contacts, [id]: { ...d.contacts[id]!, ...patch } } }))
      }
    />
  ) : section === "invites" ? (
    <InvitesPage
      pending={local.data?.pendingInvites || []}
      groups={engine.groups}
      onCreate={() => setShowCreate(true)}
      onOpenAdmin={(g) => {
        engine.setActiveGroupId(g.groupId);
        setShowAdmin(true);
      }}
      onStage={(raw) =>
        void local.update((d) => ({ ...d, pendingInvites: [...d.pendingInvites, { id: crypto.randomUUID(), raw, createdAt: Date.now() }] }))
      }
      onAccept={(raw) => {
        setShowJoin(true);
        void local.update((d) => ({ ...d, pendingInvites: d.pendingInvites.filter((x) => x.raw !== raw) }));
      }}
      onRemove={(id) => void local.update((d) => ({ ...d, pendingInvites: d.pendingInvites.filter((x) => x.id !== id) }))}
    />
  ) : section === "me" && local.data ? (
    <MePage
      deviceId={engine.deviceId}
      data={local.data}
      onSettings={() => setShowSettings(true)}
      onRestore={(data) => void local.update(() => data)}
      onOpenAbout={() => setShowAbout(true)}
    />
  ) : active ? (
    <ChatWindow
      group={active}
      messages={engine.messages[active.groupId] || []}
      onSend={(text) => engine.sendMessage(active.groupId, text)}
      onSendFile={(file, progress) => engine.sendFile(active.groupId, file, progress)}
      onSimulatePeer={engine.localMode ? () => void engine.simulatePeerMessage(active.groupId) : undefined}
      onOpenAdmin={() => setShowAdmin(true)}
      onOpenMembers={() => {
        engine.refreshMembers(active.groupId);
        setShowMembers(true);
      }}
      memberCount={members.length}
      onLeave={() => engine.leaveGroup(active.groupId)}
      onBack={back}
      groupSecret={engine.getGroupSecret(active.groupId)}
      localMode={engine.localMode}
    />
  ) : (
    <AdminHome
      status={engine.status}
      hasGroups={engine.groups.length > 0}
      onCreate={() => setShowCreate(true)}
      onJoin={() => setShowJoin(true)}
      onSettings={() => setShowSettings(true)}
    />
  );

  return (
    <div className="flex h-full min-h-[100vh] w-full overflow-hidden flex-col">
      <ConnectionBanner status={engine.status} onSettings={() => void engine.reconnect()} />
      <DailyNoticeBar notice={engine.dailyNotice} />
      {engine.maintenance && (
        <div className="bg-red-600 text-white text-xs px-4 py-2 text-center">
          系统维护中，非管理员暂时无法收发消息。
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <SectionNav active={section} onChange={setSection} desktop />
        {section === "messages" && !onboarding && (
          <Sidebar
            groups={engine.groups}
            activeGroupId={engine.activeGroupId}
            onSelect={engine.setActiveGroupId}
            onCreate={() => setShowCreate(true)}
            onJoin={() => setShowJoin(true)}
            onSettings={() => setShowSettings(true)}
            onOpenAdmin={() => setShowAdmin(true)}
            status={engine.status}
            mobileOpen={!engine.activeGroupId}
            preferences={local.data?.conversationPrefs}
            onConversationAction={(id, action) =>
              void local.update((d) => ({
                ...d,
                conversationPrefs: {
                  ...d.conversationPrefs,
                  [id]: {
                    ...d.conversationPrefs[id],
                    [action === "pin" ? "pinned" : action === "mute" ? "muted" : action === "unread" ? "unread" : "hidden"]:
                      !d.conversationPrefs[id]?.[
                        action === "pin" ? "pinned" : action === "mute" ? "muted" : action === "unread" ? "unread" : "hidden"
                      ],
                  },
                },
              }))
            }
          />
        )}
        {content}
      </div>
      {!onboarding && <SectionNav active={section} onChange={setSection} />}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreate={engine.createGroup} />}
      {showJoin && <JoinGroupModal onClose={() => setShowJoin(false)} onJoin={engine.joinGroup} />}
      {showAdmin && active?.isAdmin && (
        <AdminPanel
          group={active}
          shareInvite={engine.getShareInvite(active.groupId)}
          groupSecret={engine.getGroupSecret(active.groupId)}
          onClose={() => setShowAdmin(false)}
          onRegenerate={() => engine.regenerateCode(active.groupId)}
          onRotateKey={() => void engine.rotateGroupKeyNow(active.groupId)}
          onRevoke={() => engine.revokeInvite(active.groupId)}
          onSetExpiry={(hours) => engine.setInviteExpiry(active.groupId, hours)}
          onPublishNotice={(notice) => engine.publishDailyNotice(active.groupId, notice)}
          onMaintenance={(enabled) => engine.setMaintenanceMode(active.groupId, enabled)}
        />
      )}
      {showMembers && active && (
        <MembersPanel
          group={active}
          members={members}
          myDeviceId={engine.deviceId}
          onClose={() => setShowMembers(false)}
          onRefresh={() => engine.refreshMembers(active.groupId)}
          onKick={(id) => engine.kickMember(active.groupId, id)}
          onMute={(id) => engine.muteMember(active.groupId, id, true)}
          onShareHistory={(id) => void engine.shareHistoryWithMember(active.groupId, id)}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => void engine.reconnect()} />}

      {showAbout && !showAdminSettings && (
        <div className="fixed inset-0 z-[65] bg-[#f3efe6]">
          <AboutScreen
            onBack={() => setShowAbout(false)}
            hasAdminGroups={engine.groups.some((g) => g.isAdmin)}
            onOpenAdminSettings={() => setShowAdminSettings(true)}
          />
        </div>
      )}
      {showAdminSettings && (
        <div className="fixed inset-0 z-[66] bg-[#f3efe6]">
          <AdminSettingsScreen
            group={active && active.isAdmin ? active : engine.groups.find((g) => g.isAdmin)!}
            onBack={() => setShowAdminSettings(false)}
            onOpenNotice={() => {
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowAdmin(true);
            }}
            onOpenMembers={() => {
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowMembers(true);
            }}
            onOpenInvite={() => {
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowAdmin(true);
            }}
            onOpenKeys={() => {
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowAdmin(true);
            }}
            onOpenMaintenance={() => {
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowAdmin(true);
            }}
            onOpenDiagnostics={() => {
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowSettings(true);
            }}
            onOpenAuditLog={() => {
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowSettings(true);
            }}
          />
        </div>
      )}

      {engine.errorMsg && (
        <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm bg-red-600/90 text-white text-sm px-4 py-2 rounded-lg shadow-xl z-[60]">
          {engine.errorMsg}
        </div>
      )}
    </div>
  );
}

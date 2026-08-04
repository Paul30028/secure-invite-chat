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
import { AboutScreen } from "./components/AboutScreen";
import { AdminSettingsScreen } from "./components/AdminSettingsScreen";
import { ConnectionStatusScreen } from "./components/ConnectionStatusScreen";
import { ConnectionDiagnosticsScreen } from "./components/ConnectionDiagnosticsScreen";
import { SplashScreen } from "./components/SplashScreen";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ProfileSetupScreen } from "./components/ProfileSetupScreen";
import { AnnouncementsPage } from "./components/AnnouncementsPage";
import { HomePage } from "./components/HomePage";

type FlowStage = "splash" | "welcome" | "profile" | "main";

export default function App() {
  const engine = useChatEngine();
  const local = usePrivateData();
  const [section, setSection] = useState<AppSection>("home");
  const [showDailyNotice, setShowDailyNotice] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [adminFocus, setAdminFocus] = useState<"invite" | "notice" | "keys" | "maintenance" | undefined>();
  const [showConnectionStatus, setShowConnectionStatus] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [stage, setStage] = useState<FlowStage>("splash");
  const finishSplash = useCallback(() => {
    setStage(getLocalProfile() ? "main" : "welcome");
  }, []);

  const active = engine.groups.find((g) => g.groupId === engine.activeGroupId) || null;
  const members = active ? engine.membersByGroup[active.groupId] || [] : [];
  const adminSettingsGroup = active?.isAdmin ? active : engine.groups.find((g) => g.isAdmin) || null;
  const onboarding = engine.groups.length === 0 && !active;

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(engine.membersByGroup).filter(([, list]) => list.length > 0);
    if (!entries.length) return;
    void Promise.all(entries.map(([id, list]) => rememberMembers(id, engine.deviceId, list))).then(() => {
      if (!cancelled) local.refresh();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.membersByGroup, engine.deviceId]);

  const back = useCallback(() => {
    if (engine.activeGroupId) {
      engine.setActiveGroupId(null);
      setSection("messages");
      return;
    }
    setSection("home");
  }, [engine]);

  useAndroidBackButton({
    closers: [
      [showAdminSettings, () => setShowAdminSettings(false)],
      [showConnectionStatus, () => setShowConnectionStatus(false)],
      [showDiagnostics, () => setShowDiagnostics(false)],
      [showAbout, () => setShowAbout(false)],
      [showSettings, () => setShowSettings(false)],
      [showMembers, () => setShowMembers(false)],
      [showAdmin, () => setShowAdmin(false)],
      [showJoin, () => setShowJoin(false)],
      [showCreate, () => setShowCreate(false)],
    ],
    hasActiveGroup: !!engine.activeGroupId || section !== "home",
    onBackToList: back,
  });

  useEffect(() => {
    if (stage === "main" && !getLocalProfile() && engine.groups.length > 0) setStage("profile");
  }, [engine.groups.length, stage]);
  if (stage === "splash") return <SplashScreen onDone={finishSplash} scripture={engine.dailyNotice.scripture} />;
  if (stage === "welcome") return <WelcomeScreen status={engine.status} notice={engine.dailyNotice} onEnter={() => setStage("main")} />;
  if (stage === "profile") return <ProfileSetupScreen onDone={() => setStage("main")} />;

  const content = section === "home" ? (
    <HomePage
      notice={engine.dailyNotice}
      groupCount={engine.groups.length}
      onOpenDevotion={() => setSection("announcements")}
      onOpenHymn={() => setSection("announcements")}
      onOpenCommunity={() => setSection("messages")}
    />
  ) : section === "announcements" ? <AnnouncementsPage notice={engine.dailyNotice} /> : onboarding && section === "messages" ? (
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
      onRestore={(data) => void local.update(() => data)}
      onOpenAbout={() => setShowAbout(true)}
      onOpenAdminSettings={() => setShowAdminSettings(true)}
      hasAdminGroups={engine.groups.some((g) => g.isAdmin)}
      onBack={() => setSection("home")}
    />
  ) : section === "me" ? (
    <main className="flex-1 bg-[#fbfaf4] px-6 py-10 text-[#29362b]"><div className="mx-auto max-w-md rounded-2xl border border-[#dfe5d9] bg-[#fffef9] p-5 text-center shadow-sm"><h1 className="text-lg font-semibold">我的</h1><p className="mt-3 text-sm leading-relaxed text-[#71806f]">{local.error || "正在读取本机加密数据…"}</p><button type="button" className="mt-5 rounded-xl bg-[#557c5b] px-5 py-2.5 text-sm text-white" onClick={local.error ? local.refresh : () => setSection("home")}>{local.error ? "重新尝试" : "返回首页"}</button></div></main>
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
    />
  );

  return (
    <div className="flex h-full min-h-[100vh] w-full overflow-hidden flex-col">
      <ConnectionBanner status={engine.status} onSettings={() => setShowConnectionStatus(true)} />
      <DailyNoticeBar notice={engine.dailyNotice} open={showDailyNotice} onOpenChange={setShowDailyNotice} />
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
            dailyNotice={engine.dailyNotice}
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
      <SectionNav active={section} onChange={setSection} />

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreate={engine.createGroup} />}
      {showJoin && <JoinGroupModal onClose={() => setShowJoin(false)} onJoin={engine.joinGroup} onPreview={engine.previewInvite} initialDisplayName={getLocalProfile()?.nickname || ""} />}
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
          focusSection={adminFocus}
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
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showConnectionStatus && <ConnectionStatusScreen status={engine.status} onBack={() => setShowConnectionStatus(false)} onReconnect={() => void engine.reconnect()} onOpenDiagnostics={() => { setShowConnectionStatus(false); setShowDiagnostics(true); }} />}
      {showDiagnostics && <ConnectionDiagnosticsScreen status={engine.status} onBack={() => setShowDiagnostics(false)} onReconnect={() => void engine.reconnect()} />}

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
            group={adminSettingsGroup!}
            onBack={() => { setAdminFocus(undefined); setShowAdminSettings(false); }}
            onOpenNotice={() => {
              if (!adminSettingsGroup) return;
              engine.setActiveGroupId(adminSettingsGroup.groupId);
              setAdminFocus("notice");
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowAdmin(true);
            }}
            onOpenMembers={() => {
              if (!adminSettingsGroup) return;
              engine.setActiveGroupId(adminSettingsGroup.groupId);
              engine.refreshMembers(adminSettingsGroup.groupId);
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowMembers(true);
            }}
            onOpenInvite={() => {
              if (!adminSettingsGroup) return;
              engine.setActiveGroupId(adminSettingsGroup.groupId);
              setAdminFocus("invite");
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowAdmin(true);
            }}
            onOpenKeys={() => {
              if (!adminSettingsGroup) return;
              engine.setActiveGroupId(adminSettingsGroup.groupId);
              setAdminFocus("keys");
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowAdmin(true);
            }}
            onOpenMaintenance={() => {
              if (!adminSettingsGroup) return;
              engine.setActiveGroupId(adminSettingsGroup.groupId);
              setAdminFocus("maintenance");
              setShowAdminSettings(false);
              setShowAbout(false);
              setShowAdmin(true);
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

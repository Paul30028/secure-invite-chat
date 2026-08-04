export type AppSection = "home" | "announcements" | "messages" | "contacts" | "invites" | "me";
const items: Array<{ id: AppSection; label: string; icon: string }> = [
  { id: "home", label: "首页", icon: "⌂" },
  { id: "messages", label: "消息", icon: "●" },
  { id: "invites", label: "邀请", icon: "＋" },
  { id: "me", label: "我的", icon: "◉" },
];
export function SectionNav({ active, onChange, desktop = false }: { active: AppSection; onChange: (id: AppSection) => void; desktop?: boolean }) {
  return <nav className={desktop ? "hidden sm:flex w-[76px] shrink-0 bg-[#faf9f3] border-r border-[#e6e3d7] flex-col pt-5 gap-2" : "sm:hidden h-[66px] shrink-0 bg-[#fffef9] border-t border-[#e6e3d7] flex justify-around pb-[env(safe-area-inset-bottom)]"} aria-label="主导航">
    {items.map(item => <button key={item.id} type="button" onClick={() => onChange(item.id)} className={`${desktop ? "mx-2 py-3 rounded-xl text-xs" : "flex-1 text-[11px] flex flex-col items-center justify-center gap-0.5"} ${active === item.id ? "text-[#3d6b4f] bg-[#e9f0e7]" : "text-[#9aa096]"}`}><span className={`text-lg leading-none ${item.id === "me" ? "text-base" : "text-xl"}`}>{item.icon}</span><span>{item.label}</span></button>)}
  </nav>;
}

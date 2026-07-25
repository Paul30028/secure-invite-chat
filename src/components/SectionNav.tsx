export type AppSection = "messages" | "contacts" | "invites" | "me";
const items: Array<{ id: AppSection; label: string; icon: string }> = [
  { id: "messages", label: "消息", icon: "💬" }, { id: "contacts", label: "联系人", icon: "👥" }, { id: "invites", label: "邀请", icon: "✚" }, { id: "me", label: "我的", icon: "☺" },
];
export function SectionNav({ active, onChange, desktop = false }: { active: AppSection; onChange: (id: AppSection) => void; desktop?: boolean }) {
  return <nav className={desktop ? "hidden sm:flex w-20 shrink-0 bg-[#2e2e2e] text-white flex-col pt-4 gap-2" : "sm:hidden h-16 shrink-0 bg-white border-t border-[#d9d9d9] flex justify-around pb-[env(safe-area-inset-bottom)]"} aria-label="主导航">
    {items.map(item => <button key={item.id} type="button" onClick={() => onChange(item.id)} className={`${desktop ? "mx-2 py-3 rounded-xl text-xs" : "flex-1 text-[11px] flex flex-col items-center justify-center gap-0.5"} ${active === item.id ? "text-[#07c160] bg-[#07c160]/10" : "text-[#777]"}`}><span className="text-lg">{item.icon}</span><span>{item.label}</span></button>)}
  </nav>;
}

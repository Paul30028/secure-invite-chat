import { useEffect } from "react";

/**
 * useAndroidBackButton - 接管 Android 硬件/手势返回键
 *
 * 背景问题：
 * 本应用是纯状态驱动的单页应用（各个弹窗/面板用 useState 控制显示，
 * 不是浏览器路由跳转），Capacitor WebView 默认不知道"当前应该退回到哪一步"。
 * 如果不手动注册 `@capacitor/app` 的 backButton 监听，Android 物理返回键
 * 要么完全没反应（停在当前弹窗出不去），要么直接把整个 App 退出——
 * 这正是"进入管理员界面后退不出"的根因。
 *
 * 处理优先级（每次按返回键只处理最上层的一件事，不会一次性连续退多层）：
 *   1. 有弹窗/面板打开 → 按 closers 数组顺序，关闭第一个"当前处于打开状态"的
 *   2. 没有弹窗，但当前有选中的群 → 退回群列表（对应 App.tsx 里的 onBackToList）
 *   3. 都没有 → 说明已经在应用最外层，交还给系统默认行为（退出 App）
 *
 * 仅在原生 Android/iOS 壳内生效；普通浏览器访问网页版时不生效
 * （网页版用户本来就有浏览器自己的返回按钮/手势，不需要接管）。
 */
export function useAndroidBackButton(params: {
  /** 按顺序检查的弹窗：[是否打开, 关闭它的函数]。数组靠前的优先级更高 */
  closers: Array<[boolean, () => void]>;
  /** 当前是否已经选中了某个群（在聊天界面里） */
  hasActiveGroup: boolean;
  /** 退回群列表（相当于 ChatWindow 的"返回"按钮） */
  onBackToList: () => void;
}) {
  const { closers, hasActiveGroup, onBackToList } = params;

  useEffect(() => {
    let removeListener: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      // 动态导入，避免在纯网页环境下也强制加载原生插件代码
      let CapacitorApp: typeof import("@capacitor/app").App;
      let Capacitor: typeof import("@capacitor/core").Capacitor;
      try {
        const appMod = await import("@capacitor/app");
        const coreMod = await import("@capacitor/core");
        CapacitorApp = appMod.App;
        Capacitor = coreMod.Capacitor;
      } catch {
        return; // 未安装原生壳依赖（纯网页开发环境），直接跳过
      }
      if (cancelled) return;
      if (!Capacitor.isNativePlatform()) return; // 网页版不接管，交给浏览器自己处理

      const handle = await CapacitorApp.addListener("backButton", () => {
        for (const [isOpen, close] of closers) {
          if (isOpen) {
            close();
            return;
          }
        }
        if (hasActiveGroup) {
          onBackToList();
          return;
        }
        // 已经在最外层（群列表/主页），交还系统默认行为：退出 App
        void CapacitorApp.exitApp();
      });
      removeListener = () => handle.remove();
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
    // closers 里的闭包每次渲染都会重新生成，用 JSON 化的开关状态做依赖对比即可，
    // 避免因为函数引用变化导致监听器被无意义地反复重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closers.map(([open]) => open).join(","), hasActiveGroup, onBackToList]);
}

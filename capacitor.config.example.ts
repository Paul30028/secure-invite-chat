import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 复制本文件为 capacitor.config.ts 后使用：
 *   copy capacitor.config.example.ts capacitor.config.ts
 *   npm run build && npx cap sync
 *
 * Android / iOS 上请在 App「设置」中配置 wss:// 或 ws://你的服务器:8765
 */
const config: CapacitorConfig = {
  appId: "com.sic.invitechat",
  appName: "邀群密聊",
  webDir: "dist",
  server: {
    // 开发时可改为电脑局域网 IP，方便真机热更新：
    // url: "http://192.168.1.8:1420",
    // cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;

import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android / iOS 壳配置
 * 构建：npm run build:android
 */
const config: CapacitorConfig = {
  appId: "com.sic.invitechat",
  appName: "邀群密聊",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  server: {
    // https 提供 secure context（Web Crypto 需要）
    androidScheme: "https",
    // 允许开发期连局域网 ws://
    cleartext: true,
  },
};

export default config;

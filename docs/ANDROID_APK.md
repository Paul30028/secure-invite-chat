# Android APK 构建指南

## 环境要求

1. **Node.js 20+**
2. **Android Studio**（含 SDK、Platform Tools）—— 自带 JBR，一般不用单独装 Java
3. 或单独安装 **Temurin JDK 17**
4. 脚本会**自动查找** `JAVA_HOME`（Android Studio\jbr 等）
5. `ANDROID_HOME` 一般在 `%LOCALAPPDATA%\Android\Sdk`（装过 Studio 即可）

### 若仍提示 JAVA_HOME

在 **PowerShell** 临时设置（路径按你机器实际为准）：

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
java -version
npm run build:android
```

永久设置（新开终端生效）：

```powershell
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
```

若 jbr 不在上述路径：打开 Android Studio → Settings → Build → Build Tools → Gradle → Gradle JDK，看显示的路径。

## 一键脚本（推荐，PowerShell，避免中文乱码）

在项目根目录 **PowerShell** 执行：

```powershell
cd C:\Users\holyx\Downloads\secure-invite-chat
npm run build:android
```

或：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-apk.ps1
```

也可用纯英文 bat（无中文，避免 cmd 编码炸裂）：

```bat
scripts\build-android-apk.bat
```

脚本会：

1. `npm install`（含 Capacitor）
2. `npm run build` 打 Web
3. 若无 `android/` 则 `npx cap add android`
4. `npx cap sync android`
5. `gradlew assembleDebug` 生成调试 APK

成功后 APK 大致路径：

```
android\app\build\outputs\apk\debug\app-debug.apk
```

拷到手机安装即可（需允许「未知来源」）。

> 若仍报错：用 Android Studio 打开 `android` 文件夹，菜单 Build → Build APK(s)。

## 手动命令

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android --save
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

在 Android Studio 中：Build → Build Bundle(s) / APK(s) → Build APK(s)。

## 手机如何连上中继

### A. 同一 Wi‑Fi（最快）

1. 电脑：`server\start-server.bat`
2. 查电脑 IP（如 `192.168.1.8`）
3. 手机装 APK → 打开 App → **设置**
4. 填：`ws://192.168.1.8:8765` → 保存并重连
5. 用完整 `SIC1....` 邀请串入群

### B. 手机流量（蜂窝）

1. 租一台有公网 IP 的 VPS（国内/海外自选）
2. 跑 `server.py`，前面加 Nginx/Caddy **WSS**（见 `DEPLOY_WSS.md`）
3. App 设置填：`wss://你的域名`
4. 与 Wi‑Fi 无关，全国可达

> 不能指望手机流量直连你家路由器的 `192.168.x.x`（无公网映射时）。

## 防截屏（可选，接近 Signal）

在 `android/app/src/main/java/.../MainActivity.java` 的 `onCreate` 中增加：

```java
getWindow().setFlags(
  android.view.WindowManager.LayoutParams.FLAG_SECURE,
  android.view.WindowManager.LayoutParams.FLAG_SECURE
);
```

然后重新 `cap sync` / 编译。副作用：用户也无法正常截屏存聊天记录。

## 发布正式版

- 使用 **release 签名**（keystore），不要用 debug 包上架
- `allowMixedContent` / 明文流量在生产关闭
- 仅允许 `wss://` 连接

## 常见问题

| 现象 | 处理 |
|------|------|
| **安装后黑屏** | ① `vite base: './'` 相对路径 ② `styles.xml` 必须有 `postSplashScreenTheme`（Android 12+ 启动屏不切主题会一直黑）③ 重新 build+sync+装包前**卸载旧 APK**。详见下方「黑屏修复」 |

### 黑屏修复（2026）

已处理：

1. Vite `base: "./"`
2. Splash：`postSplashScreenTheme` + `SplashScreen.installSplashScreen`
3. 布局避免仅用 `100dvh`（老 WebView 高度塌缩）
4. 启动失败会显示红色错误文字（不再静默黑屏）

重新打包：

```powershell
$env:JAVA_HOME = "D:\软件\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

cd C:\Users\holyx\Downloads\secure-invite-chat
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug --no-daemon
```

**手机上先卸载旧「邀群密聊」再装新 APK。**
| 一直「已断开」 | 检查服务器、IP、防火墙 8765、设置里的 WS 地址 |
| 能进群解密失败 | 邀请串必须完整 `SIC1.a.b`，不要只复制前半 |
| 装不上 APK | 允许未知来源；卸载旧包再装 |
| cap 命令不存在 | 先 `npm i @capacitor/cli @capacitor/android` |

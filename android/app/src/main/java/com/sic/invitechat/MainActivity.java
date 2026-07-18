package com.sic.invitechat;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Must install before super.onCreate — prevents black screen after splash (Android 12+)
    SplashScreen.installSplashScreen(this);
    super.onCreate(savedInstanceState);

    // Signal-like: block screenshots, screen recording, and recents preview
    getWindow().setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
    );

    // Debug builds: allow chrome://inspect WebView debugging
    try {
      WebView.setWebContentsDebuggingEnabled(true);
    } catch (Exception ignored) {
    }
  }
}

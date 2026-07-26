package com.sic.invitechat;

import static org.junit.Assert.assertEquals;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class WebSocketConnectivityTest {
  private static final String ENDPOINT = "wss://ws.secureinchat.com";

  @Test
  public void androidWebViewCanOpenProductionWebSocket() throws Exception {
    CountDownLatch completed = new CountDownLatch(1);
    AtomicReference<String> result = new AtomicReference<>("no_result");

    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      scenario.onActivity(
          activity -> {
            WebView webView = activity.getBridge().getWebView();
            webView.addJavascriptInterface(
                new Object() {
                  @JavascriptInterface
                  public void report(String value) {
                    result.set(value);
                    completed.countDown();
                  }
                },
                "SicDiagnostic");
            webView.evaluateJavascript(
                "(() => {"
                    + "const ws = new WebSocket('"
                    + ENDPOINT
                    + "');"
                    + "const timer = setTimeout(() => {"
                    + "  try { ws.close(); } catch (_) {}"
                    + "  SicDiagnostic.report('timeout');"
                    + "}, 15000);"
                    + "ws.onopen = () => {"
                    + "  clearTimeout(timer);"
                    + "  SicDiagnostic.report('open');"
                    + "  ws.close();"
                    + "};"
                    + "ws.onerror = () => {"
                    + "  clearTimeout(timer);"
                    + "  SicDiagnostic.report('error:' + ws.readyState);"
                    + "};"
                    + "})();",
                null);
          });

      if (!completed.await(25, TimeUnit.SECONDS)) {
        result.set("instrumentation_timeout");
      }
    }

    assertEquals("Android WebView failed to connect to " + ENDPOINT, "open", result.get());
  }
}

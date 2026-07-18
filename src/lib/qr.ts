/**
 * 邀请串二维码（可扫描）
 * 依赖 npm 包 `qrcode`；构建前请 npm install
 */

export async function makeQrDataUrl(text: string, size = 256): Promise<string> {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size,
      color: { dark: "#0d1117", light: "#ffffff" },
    });
  } catch (e) {
    console.warn("[qr] qrcode package missing or failed", e);
    // 1x1 透明占位
    return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
}

export async function shareText(title: string, text: string): Promise<boolean> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return true;
    }
  } catch {
    /* user cancel */
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 群「安全码」——类似 Signal 安全号码
 * 由 groupSecret + groupId 的 SHA-256 派生，供成员线下核对
 * （语音/当面核对一致 → 可确信双方持有同一群密钥）
 */

/** 返回 60 位数字安全码（每 5 位一组显示） */
export async function computeGroupSafetyNumber(
  groupSecret: string,
  groupId: string
): Promise<string> {
  const data = new TextEncoder().encode(`sic-safety-v1|${groupId}|${groupSecret}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  // 取数字：用字节映射到 0-9
  const bytes = new Uint8Array(hash);
  let digits = "";
  for (let i = 0; i < 30 && digits.length < 60; i++) {
    digits += String(bytes[i]! % 10);
    digits += String(bytes[bytes.length - 1 - i]! % 10);
  }
  return digits.slice(0, 60);
}

export function formatSafetyNumber(digits: string): string {
  return digits.replace(/(\d{5})/g, "$1 ").trim();
}

/** 短指纹（设置页展示） */
export async function shortFingerprint(groupSecret: string, groupId: string): Promise<string> {
  const full = await computeGroupSafetyNumber(groupSecret, groupId);
  return full.slice(0, 20).replace(/(\d{5})/g, "$1 ").trim();
}

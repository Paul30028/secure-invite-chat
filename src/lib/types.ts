export type LocalGroup = {
  groupId: string;
  name: string;
  displayName: string;
  isAdmin: boolean;
  adminToken?: string;
  keyJwk: string;
  /** Current key epoch. Existing groups are migrated as version 1. */
  keyVersion?: number;
  /** version -> AES-GCM JWK; only current is handed to a newly joined device. */
  keyJwks?: Record<string, string>;
  groupSecret?: string;
  lastKnownInviteCode: string;
};

/** 群成员（服务器下发，无密钥） */
export type GroupMember = {
  deviceId: string;
  displayName: string;
  joinedAt: number;
  isAdmin: boolean;
  online: boolean;
  ecdhPub?: string;
};

export type FileMeta = {
  name: string;
  mime: string;
  size: number;
  /** Present until all encrypted chunks are assembled and hash-checked. */
  transfer?: { received: number; total: number; error?: string };
};

export type TrustBadge =
  | "verified"
  | "first_seen"
  | "unsigned"
  | "bad_sig"
  | "key_changed"
  | "legacy";

export type ChatMessage = {
  id: string;
  groupId: string;
  senderDeviceId: string;
  senderName: string;
  msgType: "text" | "file" | string;
  text: string;
  ts: number;
  isMine: boolean;
  decryptError?: boolean;
  /** 验签失败的密文被隔离，不得按普通聊天内容渲染。 */
  blocked?: boolean;
  file?: FileMeta & { dataB64?: string };
  trust?: TrustBadge;
};

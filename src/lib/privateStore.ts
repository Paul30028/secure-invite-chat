/** Device-local encrypted data. None of these fields are sent through wsClient. */
import type { GroupMember } from "./types";

export type Contact = { deviceId: string; displayName: string; remark?: string; group?: string; blocked?: boolean; safetyStatus: "fingerprint_pending" | "unverified" | "verified"; groupIds: string[]; addedAt: number };
export type ConversationPreference = { pinned?: boolean; muted?: boolean; unread?: boolean; hidden?: boolean };
export type PendingInvite = { id: string; raw: string; createdAt: number };
export type ProfileSettings = { notifications: boolean; safetyReminders: boolean };
export type PrivateData = { contacts: Record<string, Contact>; conversationPrefs: Record<string, ConversationPreference>; pendingInvites: PendingInvite[]; settings: ProfileSettings };

const DB = "sic_private_v1";
const KEYS = "keys";
const DATA = "data";
const STATE = "state";
const EMPTY: PrivateData = { contacts: {}, conversationPrefs: {}, pendingInvites: [], settings: { notifications: true, safetyReminders: true } };

const b64 = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(KEYS); r.result.createObjectStore(DATA); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function request<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => { const r = fn(db.transaction(store, mode).objectStore(store)); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function masterKey(db: IDBDatabase): Promise<CryptoKey> {
  const saved = await request<CryptoKey | undefined>(db, KEYS, "readonly", s => s.get("master"));
  if (saved) return saved;
  const temporary = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", temporary);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  await request(db, KEYS, "readwrite", s => s.put(key, "master"));
  return key;
}
export async function loadPrivateData(): Promise<PrivateData> {
  const db = await openDb();
  try {
    const entry = await request<{ iv: string; ciphertext: string } | undefined>(db, DATA, "readonly", s => s.get(STATE));
    if (!entry) return structuredClone(EMPTY);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(entry.iv) }, await masterKey(db), unb64(entry.ciphertext));
    return { ...structuredClone(EMPTY), ...JSON.parse(new TextDecoder().decode(plain)) };
  } finally { db.close(); }
}
export async function savePrivateData(data: PrivateData): Promise<void> {
  const db = await openDb();
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await masterKey(db), new TextEncoder().encode(JSON.stringify(data)));
    await request(db, DATA, "readwrite", s => s.put({ iv: b64(iv.buffer), ciphertext: b64(ciphertext) }, STATE));
  } finally { db.close(); }
}
export async function updatePrivateData(update: (current: PrivateData) => PrivateData) { const next = update(await loadPrivateData()); await savePrivateData(next); return next; }
export async function rememberMembers(groupId: string, mine: string, members: GroupMember[]) {
  return updatePrivateData(data => {
    const contacts = { ...data.contacts };
    for (const member of members) if (member.deviceId !== mine) {
      const old = contacts[member.deviceId];
      contacts[member.deviceId] = { ...old, deviceId: member.deviceId, displayName: old?.displayName || member.displayName, safetyStatus: old?.safetyStatus || "fingerprint_pending", groupIds: [...new Set([...(old?.groupIds || []), groupId])], addedAt: old?.addedAt || Date.now() };
    }
    return { ...data, contacts };
  });
}
export async function encryptBackupPayload(data: PrivateData, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return JSON.stringify({ v: 1, salt: b64(salt.buffer), iv: b64(iv.buffer), ciphertext: b64(ciphertext) });
}
export async function decryptBackupPayload(payload: string, password: string): Promise<PrivateData> {
  const x = JSON.parse(payload) as { v: number; salt: string; iv: string; ciphertext: string }; if (x.v !== 1) throw new Error("unsupported_backup");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(x.salt), iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(x.iv) }, key, unb64(x.ciphertext)))) as PrivateData;
}

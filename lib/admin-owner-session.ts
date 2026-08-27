import { headers } from "next/headers";
import {
  deleteOwnerSession,
  getOwnerSession,
} from "../db/admin-owner-auth-repository.ts";

export const adminOwnerSessionCookie = "miran_admin_owner_session";
export const adminOwnerSessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
};

export async function readOwnerPasswordSession() {
  const token = readCookie((await headers()).get("cookie"), adminOwnerSessionCookie);
  if (!token) return null;
  return getOwnerSession(token).catch(() => null);
}

export async function hasOwnerPasswordSessionCookie() {
  return Boolean(readCookie((await headers()).get("cookie"), adminOwnerSessionCookie));
}

export async function closeCurrentOwnerPasswordSession() {
  const token = readCookie((await headers()).get("cookie"), adminOwnerSessionCookie);
  if (token) await deleteOwnerSession(token).catch(() => undefined);
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    return item.slice(separator + 1).trim();
  }
  return "";
}

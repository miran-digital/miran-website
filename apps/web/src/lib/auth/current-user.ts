import { cookies } from "next/headers";
import { ApiError, apiRequest } from "@/lib/api/client";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export type CurrentUser = {
  id: string;
  email: string;
  role: "CUSTOMER" | "SELLER" | "ADMIN";
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await apiRequest<CurrentUser>("/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

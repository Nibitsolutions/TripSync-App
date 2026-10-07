"use client";

// One place for user feedback after an action: every save / delete / post etc. should end in
// notify.success or notify.error so the user always knows what happened and why.

import { toast } from "@/components/ui/toast";

const STATUS_MESSAGES: Record<number, string> = {
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to do this.",
  404: "The record was not found. It may have been deleted.",
  405: "This action is not supported. Please contact support.",
  409: "A record with the same value already exists.",
  413: "The data is too large to save.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on the server. Please try again.",
  502: "Server is not reachable right now. Please try again.",
  503: "Service is temporarily unavailable. Please try again shortly.",
  504: "Server took too long to respond. Please try again.",
};

// Server replies with generic words for these; swap them for the clearer status message.
const GENERIC_SERVER_ERRORS = new Set(["Unauthorized", "Forbidden", "Not found", "Internal Server Error"]);

/** Turn any thrown value (Error, string, fetch failure) into a message a user can act on. */
export function getErrorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!e) return fallback;
  if (typeof e === "string") return e.replace(/^Error:\s*/, "") || fallback;
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
    return "Could not reach the server. Please check your internet connection and try again.";
  }
  if (e instanceof SyntaxError) return "Server returned an unexpected response. Please try again.";
  if (e instanceof Error) return e.message && e.message !== "undefined" ? e.message : fallback;
  return fallback;
}

/** Pick the server's own message when it is specific, otherwise a clear message for the HTTP status. */
export function friendlyStatusMessage(status: number, serverMessage?: unknown): string {
  const msg = typeof serverMessage === "string" ? serverMessage.trim() : "";
  if (msg && !GENERIC_SERVER_ERRORS.has(msg)) return msg;
  return STATUS_MESSAGES[status] || msg || `Request failed (status ${status}).`;
}

/** Read the error message out of a failed Response (JSON `error`/`message`, else a status-based message). */
export async function readApiError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return friendlyStatusMessage(res.status, data && typeof data === "object" ? (data.error ?? data.message) : null);
}

/**
 * fetch + JSON for actions. Sends `body` as JSON, returns parsed JSON on success and throws an
 * Error carrying a readable message on failure (HTTP error, bad JSON, network down).
 */
export async function apiFetch<T = Record<string, unknown>>(
  url: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {}
): Promise<T> {
  const { body, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      method: rest.method ?? (body !== undefined ? "POST" : "GET"),
      headers: body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(getErrorMessage(e));
  }
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json().catch(() => ({}))) as T;
}

export const notify = {
  success(title: string, description?: string) {
    toast.add({ title, description, type: "success" });
  },
  info(title: string, description?: string) {
    toast.add({ title, description, type: "info" });
  },
  warning(title: string, description?: string) {
    toast.add({ title, description, type: "warning" });
  },
  /** `detail` may be an error object, a message, or a list of problems (shown as bullet lines). */
  error(title: string, detail?: unknown) {
    const description = Array.isArray(detail)
      ? detail.map((d) => `• ${d}`).join("\n")
      : detail === undefined
        ? undefined
        : getErrorMessage(detail);
    toast.add({ title, description, type: "error", timeout: 8000 });
  },
};

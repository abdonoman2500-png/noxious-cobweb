export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiClientError(String(data.error ?? "error"), response.status);
  }
  return data as T;
}

export function post<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export function patch<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(body) });
}

export function del<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: "DELETE" });
}

export type UploadedMedia = {
  id: string;
  url: string;
  kind: "image" | "video" | "audio" | "document";
  mimeType: string;
  name: string;
  size: number;
};

export async function uploadMedia(file: File, kind?: string): Promise<UploadedMedia> {
  const form = new FormData();
  form.append("file", file);
  if (kind) form.append("kind", kind);
  const data = await apiFetch<{ media: UploadedMedia }>("/api/media", {
    method: "POST",
    body: form,
  });
  return data.media;
}

export function errorMessage(code: string, t: (key: never) => string): string {
  const map: Record<string, string> = {
    invalid_credentials: "invalidCredentials",
    email_taken: "emailTaken",
    weak_password: "weakPassword",
    invalid_email: "invalidEmail",
    invalid_name: "invalidName",
    rate_limited: "rateLimited",
    not_found: "userNotFound",
    own_id: "invalidId",
    invalid_public_id: "invalidId",
    blocked: "blockedAction",
    unauthorized: "invalidCredentials",
  };
  const key = map[code];
  if (!key) return code;
  return t(key as never);
}

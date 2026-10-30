import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireAuthUser } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { detectKind, storeUpload, validateUpload, type MediaKind } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const me = await requireAuthUser();
    const limited = rateLimit(clientKey(request, "upload", me.id), 40, 10 * 60 * 1000);
    if (!limited.ok) throw new HttpError(429, "rate_limited");

    const form = await request.formData().catch(() => null);
    if (!form) throw new HttpError(400, "invalid_form");
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "missing_file");

    const declaredKind = String(form.get("kind") ?? "");
    const kind = (["image", "video", "audio", "document"].includes(declaredKind)
      ? declaredKind
      : detectKind(file.type)) as MediaKind | null;
    if (!kind) throw new HttpError(400, "unsupported_type");

    const problem = validateUpload(kind, file.type, file.size);
    if (problem) throw new HttpError(400, problem);

    const buffer = new Uint8Array(await file.arrayBuffer());
    const row = await storeUpload(me.id, kind, file.type, file.name || `upload-${Date.now()}`, buffer);

    return NextResponse.json({
      media: {
        id: row.id,
        url: `/api/media/${row.id}`,
        kind: row.kind,
        mimeType: row.mimeType,
        name: row.fileName,
        size: row.sizeBytes,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

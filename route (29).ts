import { NextResponse } from "next/server";
import { iceServers } from "@/lib/webrtc";
import { getAuthUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    iceServers,
    turnConfigured: iceServers.some((s) => String(s.urls).startsWith("turn")),
  });
}

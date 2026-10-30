import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Sets the UI locale cookie (used by the landing page language switch). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get("set") === "en" ? "en" : "ar";
  const response = NextResponse.redirect(new URL("/", url.origin));
  response.cookies.set("locale", locale, { path: "/", maxAge: 31536000 });
  return response;
}

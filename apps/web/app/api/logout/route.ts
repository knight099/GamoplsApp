import { NextResponse } from "next/server";
import { buildLogoutCookieOptions } from "@gamopls/auth";

export async function POST() {
  const cookie = buildLogoutCookieOptions();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
  return response;
}

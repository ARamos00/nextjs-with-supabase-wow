// app/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const state = crypto.randomUUID();
  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_BLIZZARD_REDIRECT_URL; // should point to /blizzard/callback

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Missing Blizzard OAuth env variables" }, { status: 500 });
  }

  // Request both openid and wow.profile scopes
  const scope = "openid wow.profile";
  const authUrl = new URL("https://oauth.battle.net/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("blizzard_oauth_state", state, {
    path: "/",
    httpOnly: true,
    secure: true,
    maxAge: 300, // 5 minutes
  });

  console.log("Redirecting to Blizzard OAuth with URL:", authUrl.toString());
  return response;
}

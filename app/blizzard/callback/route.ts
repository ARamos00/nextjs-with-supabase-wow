// app/blizzard/callback/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  const redirectUri = process.env.NEXT_PUBLIC_BLIZZARD_REDIRECT_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "Missing Blizzard OAuth env variables" }, { status: 500 });
  }

  const tokenUrl = "https://oauth.battle.net/token";
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: params,
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    console.error("Token exchange failed:", errorText);
    return NextResponse.json(
      { error: "Token exchange failed", details: errorText },
      { status: 500 }
    );
  }

  const tokenData = await tokenRes.json();
  console.log("Token Data:", tokenData);
  
  const accessToken = tokenData.access_token;
  
  // Optionally, check if tokenData.scope includes "wow.profile"
  if (!tokenData.scope?.includes("wow.profile")) {
    console.warn("Access token is missing 'wow.profile' scope:", tokenData.scope);
  }

  // Retrieve Blizzard user info (BattleTag, etc.)
  const userInfoUrl = "https://oauth.battle.net/userinfo";
  const userRes = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) {
    const errorText = await userRes.text();
    console.error("Fetching user info failed:", errorText);
    return NextResponse.json(
      { error: "Fetching user info failed", details: errorText },
      { status: 500 }
    );
  }

  const userData = await userRes.json();
  console.log("User Data:", userData);

  // Store Blizzard info in cookies for our protected page
  const response = NextResponse.redirect(new URL("/protected", url.origin));
  response.cookies.set("battleTag", userData.battletag, { path: "/" });
  response.cookies.set("accessToken", accessToken, {
    path: "/",
    httpOnly: true,
    secure: true,
  });

  return response;
}

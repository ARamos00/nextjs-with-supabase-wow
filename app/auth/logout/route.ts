// app/auth/logout/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Redirect back to the protected page to maintain the site session.
  const response = NextResponse.redirect(new URL("/protected", request.url));
  
  // Clear only the Blizzard OAuth cookies.
  response.cookies.delete("battleTag", { path: "/" });
  response.cookies.delete("accessToken", { path: "/" });
  
  return response;
}

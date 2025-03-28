// app/auth/logout/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/protected", request.url));

  response.cookies.delete({ name: "battleTag", path: "/" });
  response.cookies.delete({ name: "accessToken", path: "/" });

  return response;
}

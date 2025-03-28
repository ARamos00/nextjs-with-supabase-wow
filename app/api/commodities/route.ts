// // app/api/commodities/route.ts
// import { NextResponse } from "next/server";
// import { cookies } from "next/headers";

// export async function GET(request: Request) {
//   const cookieStore = cookies();
//   const accessToken = (await cookieStore).get("accessToken")?.value;

//   if (!accessToken) {
//     return NextResponse.json(
//       { error: "No Blizzard access token found" },
//       { status: 401 }
//     );
//   }

//   const url = new URL("https://us.api.blizzard.com/data/wow/auctions/commodities");
//   url.searchParams.set("namespace", "dynamic-us");
//   url.searchParams.set("locale", "en_US");

//   try {
//     const res = await fetch(url.toString(), {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//       },
//       // Cache this API call for 5 minutes
//       next: { revalidate: 300 },
//     });

//     if (!res.ok) {
//       const errorText = await res.text();
//       return NextResponse.json(
//         { error: "Failed to fetch commodities", details: errorText, status: res.status },
//         { status: res.status }
//       );
//     }

//     const data = await res.json();
//     return NextResponse.json(data);
//   } catch (error: any) {
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }

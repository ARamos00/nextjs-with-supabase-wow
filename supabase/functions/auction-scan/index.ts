// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * The main function that Supabase Edge Functions will run.
 */
Deno.serve(async (req) => {
  // 1) Initialize Supabase service client using environment variables
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 2) Blizzard client credentials from environment variables
  const BLIZZARD_CLIENT_ID = Deno.env.get("BLIZZARD_CLIENT_ID")!
  const BLIZZARD_CLIENT_SECRET = Deno.env.get("BLIZZARD_CLIENT_SECRET")!

  // 3) Request a Blizzard access token (Client Credentials Flow)
  const tokenRes = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${BLIZZARD_CLIENT_ID}:${BLIZZARD_CLIENT_SECRET}`)}`
    },
    body: "grant_type=client_credentials"
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return new Response(JSON.stringify({ error: `Failed to fetch Blizzard token: ${err}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { access_token } = await tokenRes.json()

  // 4) Fetch the Blizzard commodities data
  const url = new URL("https://us.api.blizzard.com/data/wow/auctions/commodities")
  url.searchParams.set("namespace", "dynamic-us")
  url.searchParams.set("locale", "en_US")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${access_token}` }
  })

  if (!res.ok) {
    const err = await res.text()
    return new Response(JSON.stringify({ error: `Failed to fetch auctions: ${err}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // 5) Parse the JSON response and get the 'Last-Modified' header
  const data = await res.json()
  const auctions = data.auctions
  const lastModified = res.headers.get("Last-Modified") ?? ""

  // 6) Check if the data is already up to date
  const { data: lastScan } = await supabase
    .from("auction_scan_meta")
    .select("last_modified")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single()

  if (lastScan?.last_modified === lastModified) {
    return new Response(JSON.stringify({ message: "No new data available." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  // 7) Prepare data to insert
  const now = Date.now()
  // e.g. 2023-10-02T12:00:00Z
  const scanHour = new Date(now).toISOString().substring(0, 13) + ":00:00Z"

  // Minimal example: you can adapt it to your advanced logic / averaging
  const rows = auctions.map((auction: any) => ({
    scan_timestamp: new Date(now).toISOString(),
    scan_hour: scanHour,
    material: auction.item.id,
    rank: null,
    listings: 1,
    total_quantity: auction.quantity,
    average_price: auction.unit_price,
  }))

  // 8) Insert or update the data in auction_history
  const { error } = await supabase
    .from("auction_history")
    .upsert(rows, { onConflict: ["scan_hour", "material", "rank"] })

  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // 9) Record the new 'Last-Modified' so next run won't duplicate
  await supabase.from("auction_scan_meta").insert({ last_modified: lastModified })

  // 10) Respond with success
  return new Response(JSON.stringify({ message: "Data saved successfully." }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
})

/* To invoke locally:
  1) supabase start
  2) supabase functions serve auction-scan
  3) Make an HTTP POST request:
     curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/auction-scan' \
       --header 'Authorization: Bearer <YOUR_ANON_OR_SERVICE_KEY>' \
       --header 'Content-Type: application/json' \
       --data '{"name":"Functions"}'
*/


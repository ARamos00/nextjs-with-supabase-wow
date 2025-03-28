import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBlizzardAccessToken } from '@/utils/blizzardAuth';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchCommodities() {
  console.log('Fetching commodities data from Blizzard API');
  const token = await getBlizzardAccessToken();
  const url = new URL('https://us.api.blizzard.com/data/wow/auctions/commodities');
  url.searchParams.set('namespace', 'dynamic-us');
  url.searchParams.set('locale', 'en_US');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`API error: ${await res.text()}`);

  const data = await res.json();
  console.log(`Fetched ${data.auctions.length} auctions.`);
  return {
    auctions: data.auctions,
    lastModified: res.headers.get('Last-Modified'),
  };
}

async function getLastModified() {
  console.log('Retrieving stored last modified timestamp.');
  const { data, error } = await supabase
    .from('auction_scan_meta')
    .select('last_modified')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  console.log('Stored last modified timestamp:', data?.[0]?.last_modified);
  return data?.[0]?.last_modified;
}

async function setLastModified(timestamp: string) {
  console.log('Updating last modified timestamp to:', timestamp);
  const { error } = await supabase.from('auction_scan_meta').insert({ last_modified: timestamp });
  if (error) throw error;
  console.log('Last modified timestamp updated successfully.');
}

async function batchInsert(rows: any[], batchSize = 2000, delayMs = 5000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Inserting batch from index ${i} to ${i + batch.length}`);

    const { error } = await supabase
      .from('commodity_auction_raw')
      .upsert(batch, { onConflict: 'auction_id' });

    if (error) {
      console.error(`Error inserting batch ${i}:`, error);
      throw error;
    }

    console.log(`Batch from index ${i} to ${i + batch.length} inserted successfully.`);

    if (i + batchSize < rows.length) {
      console.log(`Waiting ${delayMs}ms before next batch.`);
      await sleep(delayMs);
    }
  }
}

export async function GET() {
  try {
    console.log('Starting commodities processing job.');
    const { auctions, lastModified } = await fetchCommodities();

    const storedLastModified = await getLastModified();

    if (storedLastModified === lastModified) {
      console.log('No new data to process.');
      return NextResponse.json({ message: 'No new data to process.' }, { status: 200 });
    }

    const now = new Date();
    const scanHour = new Date(now);
    scanHour.setMinutes(0, 0, 0);

    const auctionRows = auctions.map((auction: any) => ({
      auction_id: auction.id,
      item_id: auction.item.id,
      quantity: auction.quantity,
      unit_price: auction.unit_price,
      time_left: auction.time_left,
      scan_timestamp: now,
      scan_hour: scanHour,
    }));

    console.log(`Prepared ${auctionRows.length} auction rows for insertion.`);

    await batchInsert(auctionRows, 2500, 1);

    await setLastModified(lastModified!);

    console.log('All commodities processed and stored successfully.');
    return NextResponse.json({ message: 'All commodities processed and stored successfully.' }, { status: 200 });
  } catch (error: any) {
    console.error('Error processing auctions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

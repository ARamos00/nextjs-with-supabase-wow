import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBlizzardAccessToken } from '@/utils/blizzardAuth';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface AuctionRow {
  item_id: number;
  [key: string]: any;
}

async function fetchCommodities() {
  console.log('[Blizzard API] Fetching commodities data');
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
  console.log(`[Blizzard API] Retrieved ${data.auctions.length} auctions.`);
  return {
    auctions: data.auctions,
    lastModified: res.headers.get('Last-Modified'),
  };
}

async function getLastModified() {
  console.log('[Supabase] Retrieving stored last modified timestamp.');
  const { data, error } = await supabase
    .from('auction_scan_meta')
    .select('last_modified')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  const timestamp = data?.[0]?.last_modified;
  console.log(`[Supabase] Last modified timestamp is: ${timestamp}`);
  return timestamp;
}

async function setLastModified(timestamp: string) {
  console.log(`[Supabase] Updating last modified timestamp to: ${timestamp}`);
  const { error } = await supabase.from('auction_scan_meta').insert({ last_modified: timestamp });
  if (error) throw error;
  console.log('[Supabase] Last modified timestamp updated successfully.');
}

async function batchInsert(rows: any[], batchSize = 2000, delayMs = 5000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`[Supabase] Inserting batch ${i / batchSize + 1}: rows ${i} to ${i + batch.length}`);

    const { error } = await supabase
      .from('commodity_auction_raw')
      .upsert(batch, { onConflict: 'auction_id' });

    if (error) {
      console.error(`[Supabase] Error inserting batch ${i / batchSize + 1}:`, error);
      throw error;
    }

    console.log(`[Supabase] Batch ${i / batchSize + 1} inserted successfully.`);

    if (i + batchSize < rows.length) {
      console.log(`[Supabase] Waiting ${delayMs}ms before next batch.`);
      await sleep(delayMs);
    }
  }
}

async function enrichMissingItems(itemIds: number[]) {
  console.log(`[Enrichment] Checking for ${itemIds.length} unique item IDs.`);

  const chunkSize = 500;
  const existingIds = new Set<number>();

  for (let i = 0; i < itemIds.length; i += chunkSize) {
    const chunk = itemIds.slice(i, i + chunkSize);
    const { data: existingItems, error } = await supabase
      .from('auction_items')
      .select('item_id')
      .in('item_id', chunk);

    if (error) throw error;
    if (existingItems) {
      existingItems.forEach((item: { item_id: number }) => existingIds.add(item.item_id));
    }
  }

  const missingIds = itemIds.filter(id => !existingIds.has(id));

  console.log(`[Enrichment] ${missingIds.length} items are missing and will be fetched.`);

  const token = await getBlizzardAccessToken();

  for (let i = 0; i < missingIds.length; i++) {
    const itemId = missingIds[i];
    const url = `https://us.api.blizzard.com/data/wow/item/${itemId}?namespace=static-us&locale=en_US`;
    console.log(`[Enrichment] [${i + 1}/${missingIds.length}] Fetching item ${itemId}`);

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.warn(`[Enrichment] Failed to fetch item ${itemId}: ${res.status} ${res.statusText}`);
        continue;
      }

      const item = await res.json();

      const enrichedItem = {
        item_id: item.id,
        name: item.name,
        quality_type: item.quality?.type,
        quality_name: item.quality?.name,
        level: item.level,
        required_level: item.required_level,
        item_class_id: item.item_class?.id,
        item_class_name: item.item_class?.name,
        item_subclass_id: item.item_subclass?.id,
        item_subclass_name: item.item_subclass?.name,
        inventory_type: item.inventory_type?.type,
        purchase_price: item.purchase_price,
        sell_price: item.sell_price,
        max_count: item.max_count,
        is_equippable: item.is_equippable,
        is_stackable: item.is_stackable,
        description: item.description,
        media_url: item.media?.key?.href,
      };

      const { error: insertError } = await supabase
        .from('auction_items')
        .upsert([enrichedItem], { onConflict: 'item_id' });

      if (insertError) throw insertError;

      console.log(`[Enrichment] Inserted item ${item.id} - ${item.name}`);
      await sleep(200);
    } catch (err) {
      console.error(`[Enrichment] Exception while fetching item ${itemId}:`, err);
    }
  }
}

export async function GET() {
  try {
    console.log('[ETL] Starting commodities processing job.');
    const { auctions, lastModified } = await fetchCommodities();

    const storedLastModified = await getLastModified();

    if (storedLastModified === lastModified) {
      console.log('[ETL] No new data to process. Skipping insert.');
      return NextResponse.json({ message: 'No new data to process.' }, { status: 200 });
    }

    const now = new Date();
    const scanHour = new Date(now);
    scanHour.setMinutes(0, 0, 0);

    const auctionRows: AuctionRow[] = auctions.map((auction: any) => ({
      auction_id: auction.id,
      item_id: auction.item.id,
      quantity: auction.quantity,
      unit_price: auction.unit_price,
      time_left: auction.time_left,
      scan_timestamp: now,
      scan_hour: scanHour,
    }));

    console.log(`[ETL] Prepared ${auctionRows.length} auction rows for insertion.`);
    await batchInsert(auctionRows, 2500, 1);
    await setLastModified(lastModified!);

    const uniqueItemIds = Array.from(
      new Set(auctionRows.map((row: AuctionRow) => row.item_id))
    );

    console.log(`[ETL] Found ${uniqueItemIds.length} unique item IDs in raw data.`);

    await enrichMissingItems(uniqueItemIds);

    console.log('[ETL] All commodities processed and enriched successfully.');
    return NextResponse.json({ message: 'All commodities processed and enriched successfully.' }, { status: 200 });
  } catch (error: any) {
    console.error('[ETL] Error during processing:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

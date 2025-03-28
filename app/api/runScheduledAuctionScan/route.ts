// app/api/runScheduledAuctionScan/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // changed from custom client
import { blacksmithingAuctionItems } from '@/utils/auctionItems';
import { getBlizzardAccessToken } from '@/utils/blizzardAuth';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type AuctionEntry = {
  quantity: number;
  unitPrice: number;
  timestamp: number;
};

type RankSummary = {
  listings: number;
  totalQuantity: number;
  priceEntries: AuctionEntry[];
  averagePrice?: number;
  robustAvg?: number;
  currentAvg?: number;
};

function computeTimeWeightedTrimmedMean(entries: AuctionEntry[], decayConstant = 7200000, trimFraction = 0.10) {
  if (!entries.length) return 0;
  const now = Date.now();
  const weighted = entries.map(({ quantity, unitPrice, timestamp }) => {
    const recencyWeight = Math.exp(-(now - timestamp) / decayConstant);
    return { quantity, unitPrice, effectiveWeight: quantity * recencyWeight };
  });
  const sorted = weighted.sort((a, b) => a.unitPrice - b.unitPrice);
  const totalWeight = sorted.reduce((sum, e) => sum + e.effectiveWeight, 0);
  const low = totalWeight * trimFraction;
  const high = totalWeight * (1 - trimFraction);

  let cum = 0, weightedSum = 0, used = 0;
  for (const e of sorted) {
    const prev = cum;
    cum += e.effectiveWeight;
    const portion = Math.min(cum, high) - Math.max(prev, low);
    if (portion > 0) {
      weightedSum += e.unitPrice * portion;
      used += portion;
    }
  }
  return used ? weightedSum / used : 0;
}

function computeCurrentPriceAverage(entries: AuctionEntry[]) {
  if (!entries.length) return 0;
  const sorted = entries.sort((a, b) => a.unitPrice - b.unitPrice);
  const limit = Math.max(1, Math.floor(sorted.length * 0.10));
  const subset = sorted.slice(0, limit);
  const totalPrice = subset.reduce((sum, e) => sum + e.unitPrice * e.quantity, 0);
  const totalQuantity = subset.reduce((sum, e) => sum + e.quantity, 0);
  return totalQuantity ? totalPrice / totalQuantity : 0;
}

async function fetchAuctionData() {
  const accessToken = await getBlizzardAccessToken();

  const url = new URL('https://us.api.blizzard.com/data/wow/auctions/commodities');
  url.searchParams.set('namespace', 'dynamic-us');
  url.searchParams.set('locale', 'en_US');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  const lastModified = res.headers.get('Last-Modified');

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Blizzard Commodities API Error: ${error}`);
  }

  const data = await res.json();
  return { auctions: data.auctions, lastModified };
}

async function getStoredLastModified() {
  const { data } = await supabase
    .from('auction_scan_meta')
    .select('last_modified')
    .order('updated_at', { ascending: false })
    .limit(1);
  return data?.[0]?.last_modified;
}

async function updateStoredLastModified(last_modified: string) {
  await supabase.from('auction_scan_meta').insert({ last_modified });
}

export async function GET() {
  try {
    const { auctions, lastModified } = await fetchAuctionData();
    const storedLastModified = await getStoredLastModified();

    if (storedLastModified === lastModified) {
      return NextResponse.json({ message: 'No new data available.' }, { status: 200 });
    }

    const now = Date.now();
    const scanDate = new Date(now).toISOString().split("T")[0];
    const originalDate = new Date(now);
    originalDate.setMinutes(0, 0, 0);
    const scanHour = originalDate.toISOString();

    const counts: Record<string, Record<number, RankSummary>> = {};

    for (const [material, { ranks }] of Object.entries(blacksmithingAuctionItems)) {
      counts[material] = {};
      ranks.forEach((_, i) => {
        counts[material][i] = { listings: 0, totalQuantity: 0, priceEntries: [] };
      });
    }

    auctions.forEach(({ item, quantity = 1, unit_price, timestamp }: any) => {
      const id = Number(item?.id || item);
      const qty = Number(quantity);
      const price = Number(unit_price);
      const time = Number(timestamp) || now;

      Object.entries(blacksmithingAuctionItems).forEach(([material, { ranks }]) => {
        ranks.forEach((trackedId, rankIndex) => {
          if (id === trackedId) {
            const r = counts[material][rankIndex];
            r.listings += 1;
            r.totalQuantity += qty;
            if (price > 0) r.priceEntries.push({ quantity: qty, unitPrice: price, timestamp: time });
          }
        });
      });
    });

    const rows = [];

    for (const [material, ranks] of Object.entries(counts)) {
      for (const [rankKey, rankSummary] of Object.entries(ranks)) {
        const summary = rankSummary as RankSummary;
        const robust = computeTimeWeightedTrimmedMean(summary.priceEntries);
        const current = computeCurrentPriceAverage(summary.priceEntries);
        const finalAvg = summary.totalQuantity < 100 || robust > current * 1.2 ? current : robust * 0.25 + current * 0.75;

        rows.push({
          scan_timestamp: new Date(now).toISOString(),
          scan_date: scanDate,
          scan_hour: scanHour,
          material,
          rank: blacksmithingAuctionItems[material].ranks.length > 1 ? Number(rankKey) + 1 : null,
          listings: summary.listings,
          total_quantity: summary.totalQuantity,
          average_price: Math.round(finalAvg),
          robust_avg: Math.round(robust),
          current_avg: Math.round(current),
        });
      }
    }

    if (rows.length) {
      const { error } = await supabase
        .from('auction_history')
        .upsert(rows, { onConflict: ['scan_hour', 'material', 'rank'] });

      if (error) throw error;

      await updateStoredLastModified(lastModified!);
    }

    return NextResponse.json({ message: 'New data saved successfully.' }, { status: 200 });
  } catch (error: any) {
    console.error('Scheduled scan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

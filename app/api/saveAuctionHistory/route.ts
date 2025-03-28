// // app/api/saveAuctionHistory/route.ts
// import { NextResponse } from 'next/server';
// import { createClient } from '@/utils/supabase/server';
// import { blacksmithingAuctionItems } from '@/utils/auctionItems';

// export async function POST(request: Request) {
//   try {
//     const { scanTimestamp, summary } = await request.json();
//     if (!scanTimestamp || !summary) {
//       return NextResponse.json({ error: 'Missing scanTimestamp or summary data.' }, { status: 400 });
//     }

//     // Compute scan_date (YYYY-MM-DD)
//     const scanDate = new Date(scanTimestamp).toISOString().split("T")[0];

//     // Compute scan_hour by rounding scanTimestamp to the start of the hour.
//     const originalDate = new Date(scanTimestamp);
//     originalDate.setMinutes(0, 0, 0);
//     const scanHour = originalDate.toISOString();

//     const supabase = await createClient();

//     // Check if any record for this scan_hour already exists.
//     const { data: existingRows, error: selectError } = await supabase
//       .from('auction_history')
//       .select('id')
//       .eq('scan_hour', scanHour)
//       .limit(1);

//     if (selectError) {
//       console.error('Error checking existing records:', selectError);
//       return NextResponse.json({ error: selectError.message }, { status: 500 });
//     }

//     if (existingRows && existingRows.length > 0) {
//       const nextHour = new Date(originalDate.getTime() + 3600000).toISOString();
//       return NextResponse.json({ 
//         message: 'Data for this hour already exists.',
//         nextAllowedScanHour: nextHour
//       }, { status: 200 });
//     }

//     // Prepare an array of rows to insert/upsert.
//     const rows = [];
//     for (const [material, ranks] of Object.entries(summary)) {
//       for (const [rankKey, rankSummary] of Object.entries(ranks)) {
//         const rankValue = (blacksmithingAuctionItems[material]?.ranks.length || 0) > 1
//           ? Number(rankKey) + 1
//           : null;

//         rows.push({
//           scan_timestamp: new Date(scanTimestamp).toISOString(),
//           scan_date: scanDate,
//           scan_hour: scanHour,
//           material,
//           rank: rankValue,
//           listings: rankSummary.listings,
//           total_quantity: rankSummary.totalQuantity,
//           average_price: rankSummary.averagePrice,
//           robust_avg: rankSummary.robustAvg ?? null,
//           current_avg: rankSummary.currentAvg ?? null,
//         });
//       }
//     }

//     const { error } = await supabase
//       .from('auction_history')
//       .upsert(rows, { onConflict: ['scan_hour', 'material', 'rank'] });

//     if (error) {
//       console.error('Error upserting auction_history:', error);
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     }

//     return NextResponse.json({ message: 'Data saved successfully.' }, { status: 200 });
//   } catch (err: any) {
//     console.error('Error in saveAuctionHistory API:', err);
//     return NextResponse.json({ error: err.message }, { status: 500 });
//   }
// }

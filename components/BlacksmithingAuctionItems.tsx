"use client";

import React, { useState } from "react";
import { blacksmithingAuctionItems } from "@/utils/auctionItems";

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

type MaterialSummary = Record<number, RankSummary>;
type AuctionSummary = Record<string, MaterialSummary>;

function formatCopper(copper: number) {
  const rounded = Math.round(copper);
  const gold = Math.floor(rounded / 10000);
  const silver = Math.floor((rounded % 10000) / 100);
  const remainingCopper = rounded % 100;
  return `${gold}g ${silver}s ${remainingCopper}c`;
}

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

export default function BlacksmithingAuctionItems() {
  const [summary, setSummary] = useState<AuctionSummary | null>(null);
  const [scanTimestamp, setScanTimestamp] = useState<number | null>(null);
  const [savedScan, setSavedScan] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    try {
      const { auctions } = await (await fetch("/api/commodities")).json();
      const now = Date.now();
      setScanTimestamp(now);

      const counts: AuctionSummary = {};
      for (const [material, { ranks }] of Object.entries(blacksmithingAuctionItems)) {
        counts[material] = {};
        ranks.forEach((_, i) => counts[material][i] = { listings: 0, totalQuantity: 0, priceEntries: [] });
      }

      auctions.forEach(({ item, quantity = 1, unit_price, timestamp }) => {
        const id = Number(item?.id || item);
        const qty = Number(quantity);
        const price = Number(unit_price);
        const time = Number(timestamp) || Date.now();

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

      Object.keys(counts).forEach(material => {
        Object.entries(counts[material]).forEach(([rankKey, rankSummary]) => {
          const robust = computeTimeWeightedTrimmedMean(rankSummary.priceEntries);
          const current = computeCurrentPriceAverage(rankSummary.priceEntries);
          const finalAvg = rankSummary.totalQuantity < 100 || robust > current * 1.2
            ? current
            : robust * 0.25 + current * 0.75;

          rankSummary.averagePrice = Math.round(finalAvg);
          rankSummary.robustAvg = Math.round(robust);
          rankSummary.currentAvg = Math.round(current);
        });
      });

      setSummary(counts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!scanTimestamp || savedScan === scanTimestamp) {
      return setSaveMessage("No new scan to save.");
    }
    try {
      const res = await fetch("/api/saveAuctionHistory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanTimestamp, summary }),
      });
  
      const data = await res.json();
  
      if (!res.ok) throw new Error(data.error);
  
      if (data.nextAllowedScanHour) {
        const nextAllowedDate = new Date(data.nextAllowedScanHour).toLocaleString();
        setSaveMessage(`Data for this hour already exists. Next allowed scan: ${nextAllowedDate}`);
      } else {
        setSavedScan(scanTimestamp);
        setSaveMessage(data.message);
      }
  
    } catch (err: any) {
      setSaveMessage("Error saving: " + err.message);
    }
  };
  

  return (
    <div className="p-6 bg-white rounded shadow">
      <h2 className="text-xl font-semibold mb-4">Blacksmithing AH Summary</h2>
      <div className="flex gap-4 mb-4">
        <button onClick={handleFetch} className="btn btn-green">{loading ? "Fetching..." : "Fetch Auction Items"}</button>
        {summary && <button onClick={handleSave} className="btn btn-blue">Save Data to DB</button>}
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {saveMessage && <p className="text-green-600">{saveMessage}</p>}
      {summary && (
        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th>Material</th><th>Rank</th><th>Listings</th><th>Total Qty</th><th>Avg Price</th><th>Robust Avg</th><th>Current Avg</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(summary).flatMap(([mat, ranks]) =>
              Object.entries(ranks).map(([rk, rs]) => (
                <tr key={`${mat}-${rk}`} className="hover:bg-gray-50">
                  <td>{mat}</td>
                  <td>{blacksmithingAuctionItems[mat].ranks.length > 1 ? `Rank ${Number(rk)+1}` : "N/A"}</td>
                  <td>{rs.listings}</td>
                  <td>{rs.totalQuantity}</td>
                  <td>{rs.averagePrice ? formatCopper(rs.averagePrice) : "-"}</td>
                  <td>{rs.robustAvg ? formatCopper(rs.robustAvg) : "-"}</td>
                  <td>{rs.currentAvg ? formatCopper(rs.currentAvg) : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
);
}

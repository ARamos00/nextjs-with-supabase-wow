// components/CommoditiesData.tsx
"use client";

import React, { useState, useEffect } from "react";

export default function CommoditiesData() {
  const [dataSummary, setDataSummary] = useState<{ total: number; distinct: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/commodities");
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch commodities");
      }
      const json = await res.json();
      // Debug log: output the structure of the first auction (if exists)
      if (json.auctions && json.auctions.length > 0) {
        console.debug("Sample auction:", json.auctions[0]);
      } else {
        console.warn("No auctions array found in response.");
      }
      const auctions = json.auctions || [];
      const totalAuctions = auctions.length;
      // Use auction.item.id if available; fallback to auction.itemId if present
      const distinctItems = new Set(
        auctions.map((auction: any) => {
          return auction.item?.id || auction.itemId || "unknown";
        })
      ).size;

      setDataSummary({ total: totalAuctions, distinct: distinctItems });
      setLastFetched(Date.now());
      // Disable the button for 5 minutes (300,000ms)
      setDisabled(true);
      setTimeout(() => {
        setDisabled(false);
      }, 300000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={fetchData}
        disabled={disabled}
        className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
      >
        {loading ? "Loading..." : "Fetch Auction House Commodities"}
      </button>
      {error && <p className="text-red-500">Error: {error}</p>}
      {dataSummary && (
        <div className="text-sm">
          <p>Total Auctions: {dataSummary.total}</p>
          <p>Distinct Items: {dataSummary.distinct}</p>
        </div>
      )}
      {lastFetched && (
        <p className="text-sm">
          Last fetched at: {new Date(lastFetched).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

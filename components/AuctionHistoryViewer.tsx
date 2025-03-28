// components/AuctionHistoryViewer.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { blacksmithingAuctionItems } from '@/utils/auctionItems';

interface AuctionHistory {
  id: number;
  scan_timestamp: string;
  material: string;
  rank: number | null;
  listings: number;
  total_quantity: number;
  average_price: number;
  robust_avg: number | null;
  current_avg: number | null;
}

export default function AuctionHistoryViewer() {
  const supabase = createClient();
  const [selectedMaterial, setSelectedMaterial] = useState<string>('');
  const [history, setHistory] = useState<AuctionHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (material: string) => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('auction_history')
      .select('*')
      .eq('material', material)
      .order('scan_timestamp', { ascending: false });

    if (error) {
      setError(error.message);
      setHistory([]);
    } else {
      setHistory(data);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (selectedMaterial) {
      fetchHistory(selectedMaterial);
    }
  }, [selectedMaterial]);

  return (
    <div className="p-6 bg-white shadow rounded">
      <h2 className="text-xl font-semibold mb-4">Auction History Viewer</h2>

      <select
        value={selectedMaterial}
        onChange={(e) => setSelectedMaterial(e.target.value)}
        className="border p-2 rounded w-full mb-4"
      >
        <option value="">Select Material</option>
        {Object.keys(blacksmithingAuctionItems).map((material) => (
          <option key={material} value={material}>{material}</option>
        ))}
      </select>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!loading && !error && history.length > 0 && (
        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th>Date & Time</th>
              <th>Rank</th>
              <th>Listings</th>
              <th>Total Qty</th>
              <th>Avg Price</th>
              <th>Robust Avg</th>
              <th>Current Avg</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td>{new Date(entry.scan_timestamp).toLocaleString()}</td>
                <td>{entry.rank ?? 'N/A'}</td>
                <td>{entry.listings}</td>
                <td>{entry.total_quantity}</td>
                <td>{(entry.average_price / 10000).toFixed(2)}g</td>
                <td>{entry.robust_avg ? (entry.robust_avg / 10000).toFixed(2) + 'g' : '-'}</td>
                <td>{entry.current_avg ? (entry.current_avg / 10000).toFixed(2) + 'g' : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && !error && selectedMaterial && history.length === 0 && (
        <p>No historical data available for the selected material.</p>
      )}
    </div>
  );
}

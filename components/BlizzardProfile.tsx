// components/BlizzardProfile.tsx
"use client";

import React, { useEffect, useState } from "react";

type ProfileData = any; // You may define a more specific type based on Blizzard's response

export default function BlizzardProfile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/blizzard-profile");
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to fetch profile");
        }
        const data = await res.json();
        setProfile(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  if (loading) return <p>Loading Blizzard Profile...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <pre className="text-xs font-mono p-3 rounded border max-h-96 overflow-auto">
      {JSON.stringify(profile, null, 2)}
    </pre>
  );
}

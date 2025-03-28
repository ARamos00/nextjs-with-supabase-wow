// utils/blizzardAuth.ts
export async function getBlizzardAccessToken() {
    const clientId = process.env.BLIZZARD_CLIENT_ID;
    const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  
    if (!clientId || !clientSecret) {
      throw new Error('Missing Blizzard Client ID or Secret in environment variables.');
    }
  
    const tokenUrl = 'https://oauth.battle.net/token';
  
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({ 'grant_type': 'client_credentials' })
    });
  
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Blizzard token: ${errorText}`);
    }
  
    const data = await response.json();
    return data.access_token as string;
  }
  
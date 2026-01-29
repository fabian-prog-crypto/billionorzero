import { NextRequest, NextResponse } from 'next/server';

// Birdeye API endpoint
const BIRDEYE_API_BASE = 'https://public-api.birdeye.so';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const apiKey = searchParams.get('apiKey');

  console.log('[API /solana/birdeye] Request received:', {
    hasAddress: !!address,
    addressPrefix: address?.slice(0, 10),
    hasApiKey: !!apiKey,
  });

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 });
  }

  try {
    const url = `${BIRDEYE_API_BASE}/v1/wallet/token_list?wallet=${address}`;

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
        'X-API-KEY': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API /solana/birdeye] Birdeye API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Birdeye API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.success) {
      console.error('[API /solana/birdeye] Birdeye API unsuccessful:', data);
      return NextResponse.json(
        { error: 'Birdeye API returned unsuccessful response' },
        { status: 500 }
      );
    }

    const items = data.data?.items || [];
    console.log('[API /solana/birdeye] Raw items from Birdeye:', items.length);

    // Transform Birdeye format to our standard format
    const tokens = items
      .filter((token: any) => {
        // Must have positive balance
        if (!token.uiAmount || token.uiAmount <= 0) return false;

        // Skip dust (less than $0.01) for priced tokens
        const value = token.valueUsd || 0;
        if (token.priceUsd && token.priceUsd > 0 && value < 0.01) return false;

        return true;
      })
      .map((token: any) => ({
        symbol: token.symbol || 'UNKNOWN',
        name: token.name || token.symbol || 'Unknown Token',
        amount: token.uiAmount,
        price: token.priceUsd || 0,
        value: token.valueUsd || 0,
        chain: 'sol',
        logo_url: token.logoURI,
        is_verified: !!token.symbol,
        mint: token.address,
      }))
      .sort((a: any, b: any) => b.value - a.value);

    // Log specific tokens for debugging
    const metaToken = tokens.find((t: any) => t.symbol === 'META');
    if (metaToken) {
      console.log('[API /solana/birdeye] Found META token:', metaToken);
    }

    console.log('[API /solana/birdeye] SUCCESS: Returned', tokens.length, 'tokens');
    return NextResponse.json(tokens);
  } catch (error) {
    console.error('[API /solana/birdeye] Error fetching from Birdeye:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Birdeye', details: String(error) },
      { status: 500 }
    );
  }
}

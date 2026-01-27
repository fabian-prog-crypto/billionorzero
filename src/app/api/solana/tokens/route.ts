import { NextRequest, NextResponse } from 'next/server';

const HELIUS_BASE_URL = 'https://api.helius.xyz/v0';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const apiKey = searchParams.get('apiKey');

  console.log('[API /solana/tokens] Request received:', {
    hasAddress: !!address,
    addressPrefix: address?.slice(0, 10),
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
  });

  if (!address) {
    console.log('[API /solana/tokens] ERROR: Address missing');
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  if (!apiKey) {
    console.log('[API /solana/tokens] ERROR: API key missing');
    return NextResponse.json({ error: 'API key is required' }, { status: 400 });
  }

  try {
    // Fetch token balances with prices from Helius
    const response = await fetch(
      `${HELIUS_BASE_URL}/addresses/${address}/balances?api-key=${apiKey}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API /solana/tokens] Helius API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Helius API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform Helius response to match our expected format
    const tokens = [];

    // Add native SOL balance
    if (data.nativeBalance) {
      const solAmount = data.nativeBalance.lamports / 1e9; // Convert lamports to SOL
      tokens.push({
        symbol: 'SOL',
        name: 'Solana',
        amount: solAmount,
        price: data.nativeBalance.price_per_sol || 0,
        value: data.nativeBalance.total_price || solAmount * (data.nativeBalance.price_per_sol || 0),
        chain: 'sol',
        logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        is_verified: true,
      });
    }

    // Add SPL tokens
    if (data.tokens && Array.isArray(data.tokens)) {
      for (const token of data.tokens) {
        // Skip tokens with no amount or very small dust
        const amount = token.amount / Math.pow(10, token.decimals || 0);
        if (amount <= 0) continue;

        const price = token.pricePerToken || 0;
        const value = token.valueUsd || (amount * price);

        // Skip tiny dust balances (less than $0.01)
        if (price > 0 && value < 0.01) continue;

        tokens.push({
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || token.symbol || 'Unknown Token',
          amount: amount,
          price: price,
          value: value,
          chain: 'sol',
          logo_url: token.logoURI || null,
          is_verified: !!token.symbol, // Consider tokens with symbols as somewhat verified
          mint: token.mint, // Include mint address for reference
        });
      }
    }

    // Sort by value descending
    tokens.sort((a, b) => b.value - a.value);

    console.log('[API /solana/tokens] SUCCESS: Returned', tokens.length, 'tokens');
    return NextResponse.json(tokens);
  } catch (error) {
    console.error('[API /solana/tokens] Error fetching from Helius:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Helius', details: String(error) },
      { status: 500 }
    );
  }
}

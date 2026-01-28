import { NextRequest, NextResponse } from 'next/server';

// Helius DAS API endpoint
const HELIUS_RPC_URL = (apiKey: string) => `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

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
    // Use Helius DAS API (getAssetsByOwner) for comprehensive token data
    // This returns all digital assets including fungible tokens with metadata
    const response = await fetch(HELIUS_RPC_URL(apiKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'billionorzero',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: address,
          page: 1,
          limit: 1000,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API /solana/tokens] Helius DAS API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Helius API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.error) {
      console.error('[API /solana/tokens] Helius DAS RPC error:', data.error);
      return NextResponse.json(
        { error: 'Helius RPC error', details: data.error.message },
        { status: 500 }
      );
    }

    const result = data.result;
    const tokens = [];

    // Add native SOL balance if present
    if (result.nativeBalance) {
      const solAmount = result.nativeBalance.lamports / 1e9; // Convert lamports to SOL
      const solPrice = result.nativeBalance.price_per_sol || 0;
      tokens.push({
        symbol: 'SOL',
        name: 'Solana',
        amount: solAmount,
        price: solPrice,
        value: result.nativeBalance.total_price || solAmount * solPrice,
        chain: 'sol',
        logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        is_verified: true,
      });
    }

    // Process digital assets (fungible tokens)
    if (result.items && Array.isArray(result.items)) {
      console.log('[API /solana/tokens] Processing', result.items.length, 'assets from DAS API');

      for (const asset of result.items) {
        // Only process fungible tokens
        if (asset.interface !== 'FungibleToken' && asset.interface !== 'FungibleAsset') {
          continue;
        }

        // Get token info from the asset
        const tokenInfo = asset.token_info || {};
        const content = asset.content || {};
        const metadata = content.metadata || {};

        // Calculate amount from balance and decimals
        const balance = tokenInfo.balance || 0;
        const decimals = tokenInfo.decimals || 0;
        const amount = balance / Math.pow(10, decimals);

        if (amount <= 0) continue;

        // Get price info
        const price = tokenInfo.price_info?.price_per_token || 0;
        const value = tokenInfo.price_info?.total_price || (amount * price);

        // Skip tiny dust balances (less than $0.01) - but only if we have price data
        if (price > 0 && value < 0.01) continue;

        // Get symbol from token_info or metadata
        const symbol = tokenInfo.symbol || metadata.symbol || asset.content?.metadata?.symbol || 'UNKNOWN';
        const name = metadata.name || tokenInfo.symbol || symbol || 'Unknown Token';

        // Get logo from content
        const logoUrl = content.links?.image || content.files?.[0]?.uri || null;

        // Log tokens for debugging
        if (symbol === 'META' || symbol === 'UNKNOWN') {
          console.log('[API /solana/tokens] Token debug:', {
            id: asset.id,
            interface: asset.interface,
            symbol,
            name,
            amount,
            price,
            value,
            tokenInfo,
          });
        }

        tokens.push({
          symbol,
          name,
          amount,
          price,
          value,
          chain: 'sol',
          logo_url: logoUrl,
          is_verified: !!tokenInfo.symbol,
          mint: asset.id, // The asset ID is the mint address
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

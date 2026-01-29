import { NextRequest, NextResponse } from 'next/server';

// Helius DAS API endpoint
const HELIUS_RPC_URL = (apiKey: string) => `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

// Maximum pages to fetch to avoid infinite loops
const MAX_PAGES = 10;
const ITEMS_PER_PAGE = 1000;

interface TokenInfo {
  symbol: string;
  name: string;
  amount: number;
  price: number;
  value: number;
  chain: string;
  logo_url: string | null;
  is_verified: boolean;
  mint: string;
}

/**
 * Fetch a single page of assets from Helius DAS API
 */
async function fetchAssetsPage(
  apiKey: string,
  address: string,
  page: number
): Promise<{ items: any[]; total: number; cursor?: string }> {
  const response = await fetch(HELIUS_RPC_URL(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `billionorzero-page-${page}`,
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: address,
        page,
        limit: ITEMS_PER_PAGE,
        displayOptions: {
          showFungible: true,
          showNativeBalance: true,
          showZeroBalance: false, // Exclude zero balances to reduce noise
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Helius API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Helius RPC error: ${data.error.message}`);
  }

  return {
    items: data.result?.items || [],
    total: data.result?.total || 0,
    cursor: data.result?.cursor,
  };
}

/**
 * Process a single asset into token info
 */
function processAsset(asset: any): TokenInfo | null {
  // Accept multiple interface types that could be fungible tokens
  // FungibleToken: Standard SPL tokens
  // FungibleAsset: Assets with fungible properties
  // ProgrammableNFT: Some tokens use this interface (like compressed tokens)
  const fungibleInterfaces = ['FungibleToken', 'FungibleAsset'];

  if (!fungibleInterfaces.includes(asset.interface)) {
    return null;
  }

  // Get token info from the asset
  const tokenInfo = asset.token_info || {};
  const content = asset.content || {};
  const metadata = content.metadata || {};

  // Calculate amount from balance and decimals
  const balance = tokenInfo.balance || 0;
  const decimals = tokenInfo.decimals || 0;
  const amount = decimals > 0 ? balance / Math.pow(10, decimals) : balance;

  if (amount <= 0) return null;

  // Get price info
  const price = tokenInfo.price_info?.price_per_token || 0;
  const value = tokenInfo.price_info?.total_price || (amount * price);

  // Skip tiny dust balances (less than $0.01) - but only if we have price data
  if (price > 0 && value < 0.01) return null;

  // Get symbol from multiple sources (priority order)
  const symbol =
    tokenInfo.symbol ||
    metadata.symbol ||
    content.metadata?.symbol ||
    asset.content?.metadata?.symbol ||
    'UNKNOWN';

  // Get name from multiple sources
  const name =
    metadata.name ||
    content.metadata?.name ||
    tokenInfo.symbol ||
    symbol ||
    'Unknown Token';

  // Get logo from content (check multiple locations)
  const logoUrl =
    content.links?.image ||
    content.files?.[0]?.uri ||
    content.files?.[0]?.cdn_uri ||
    metadata.image ||
    null;

  return {
    symbol,
    name,
    amount,
    price,
    value,
    chain: 'sol',
    logo_url: logoUrl,
    is_verified: !!tokenInfo.symbol,
    mint: asset.id, // The asset ID is the mint address
  };
}

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
    const tokens: TokenInfo[] = [];
    const seenMints = new Set<string>();
    let nativeBalance: any = null;

    // Fetch first page to get total and native balance
    console.log('[API /solana/tokens] Fetching page 1...');
    const firstPageResponse = await fetch(HELIUS_RPC_URL(apiKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'billionorzero-page-1',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: address,
          page: 1,
          limit: ITEMS_PER_PAGE,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
            showZeroBalance: false,
          },
        },
      }),
    });

    if (!firstPageResponse.ok) {
      const errorText = await firstPageResponse.text();
      console.error('[API /solana/tokens] Helius DAS API error:', firstPageResponse.status, errorText);
      return NextResponse.json(
        { error: `Helius API error: ${firstPageResponse.status}`, details: errorText },
        { status: firstPageResponse.status }
      );
    }

    const firstPageData = await firstPageResponse.json();

    if (firstPageData.error) {
      console.error('[API /solana/tokens] Helius DAS RPC error:', firstPageData.error);
      return NextResponse.json(
        { error: 'Helius RPC error', details: firstPageData.error.message },
        { status: 500 }
      );
    }

    const result = firstPageData.result;
    nativeBalance = result.nativeBalance;
    const total = result.total || 0;
    const totalPages = Math.min(Math.ceil(total / ITEMS_PER_PAGE), MAX_PAGES);

    console.log('[API /solana/tokens] Total assets:', total, 'Pages to fetch:', totalPages);

    // Process first page items
    const firstPageItems = result.items || [];
    console.log('[API /solana/tokens] Processing page 1 with', firstPageItems.length, 'assets');

    for (const asset of firstPageItems) {
      const token = processAsset(asset);
      if (token && !seenMints.has(token.mint)) {
        seenMints.add(token.mint);
        tokens.push(token);

        // Debug logging for specific tokens
        if (token.symbol === 'META' || token.symbol === 'UNKNOWN') {
          console.log('[API /solana/tokens] Token debug:', {
            id: asset.id,
            interface: asset.interface,
            symbol: token.symbol,
            name: token.name,
            amount: token.amount,
            price: token.price,
            value: token.value,
          });
        }
      }
    }

    // Fetch remaining pages if needed
    for (let page = 2; page <= totalPages; page++) {
      console.log(`[API /solana/tokens] Fetching page ${page}...`);
      try {
        const pageData = await fetchAssetsPage(apiKey, address, page);
        console.log(`[API /solana/tokens] Processing page ${page} with`, pageData.items.length, 'assets');

        for (const asset of pageData.items) {
          const token = processAsset(asset);
          if (token && !seenMints.has(token.mint)) {
            seenMints.add(token.mint);
            tokens.push(token);
          }
        }
      } catch (pageError) {
        console.error(`[API /solana/tokens] Error fetching page ${page}:`, pageError);
        // Continue with next page instead of failing entirely
      }
    }

    // Add native SOL balance
    if (nativeBalance) {
      const solAmount = nativeBalance.lamports / 1e9; // Convert lamports to SOL
      const solPrice = nativeBalance.price_per_sol || 0;
      tokens.unshift({
        symbol: 'SOL',
        name: 'Solana',
        amount: solAmount,
        price: solPrice,
        value: nativeBalance.total_price || solAmount * solPrice,
        chain: 'sol',
        logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        is_verified: true,
        mint: 'So11111111111111111111111111111111111111112',
      });
    }

    // Sort by value descending (SOL will be re-sorted)
    tokens.sort((a, b) => b.value - a.value);

    console.log('[API /solana/tokens] SUCCESS: Returned', tokens.length, 'tokens');

    // Log summary of top tokens for debugging
    const topTokens = tokens.slice(0, 10).map(t => `${t.symbol}: $${t.value.toFixed(2)}`);
    console.log('[API /solana/tokens] Top tokens:', topTokens.join(', '));

    return NextResponse.json(tokens);
  } catch (error) {
    console.error('[API /solana/tokens] Error fetching from Helius:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Helius', details: String(error) },
      { status: 500 }
    );
  }
}

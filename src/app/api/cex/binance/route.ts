/**
 * Binance API Proxy
 * Proxies authenticated and public requests to Binance API
 * Handles HMAC-SHA256 signing on server-side for security
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const BINANCE_API_URL = 'https://api.binance.com';

function createSignature(queryString: string, apiSecret: string): string {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
}

// GET handler for public endpoints (no auth required)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Missing endpoint parameter' },
      { status: 400 }
    );
  }

  try {
    let url: string;

    switch (endpoint) {
      case 'ticker24hr':
        // Get all 24hr tickers (public, no auth)
        url = `${BINANCE_API_URL}/api/v3/ticker/24hr`;
        break;
      case 'tickerPrice':
        // Get all prices (public, no auth)
        url = `${BINANCE_API_URL}/api/v3/ticker/price`;
        break;
      default:
        return NextResponse.json(
          { error: 'Unknown public endpoint' },
          { status: 400 }
        );
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Binance API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Binance public API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Binance API' },
      { status: 500 }
    );
  }
}

// POST handler for authenticated endpoints
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, apiSecret, endpoint } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Missing API credentials' },
        { status: 400 }
      );
    }

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing endpoint parameter' },
        { status: 400 }
      );
    }

    // Build the query parameters
    const timestamp = Date.now();
    const queryParams: Record<string, string | number | boolean> = {
      timestamp,
      recvWindow: 5000,
    };

    // Add endpoint-specific parameters
    if (endpoint === 'account') {
      queryParams.omitZeroBalances = true;
    }

    // Create query string and signature
    const queryString = Object.entries(queryParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    const signature = createSignature(queryString, apiSecret);
    const signedQuery = `${queryString}&signature=${signature}`;

    // Determine the API path
    let apiPath: string;
    switch (endpoint) {
      case 'account':
        apiPath = '/api/v3/account';
        break;
      default:
        return NextResponse.json(
          { error: 'Unknown endpoint' },
          { status: 400 }
        );
    }

    // Make the request to Binance
    const url = `${BINANCE_API_URL}${apiPath}?${signedQuery}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: `Binance API error: ${response.status}`,
          details: errorData
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Binance API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Binance API' },
      { status: 500 }
    );
  }
}

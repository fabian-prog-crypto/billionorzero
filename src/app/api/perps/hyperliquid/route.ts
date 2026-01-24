/**
 * Hyperliquid API Proxy
 * Proxies requests to Hyperliquid API to avoid CORS issues
 */

import { NextRequest, NextResponse } from 'next/server';

const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz/info';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(HYPERLIQUID_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Hyperliquid API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Hyperliquid API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Hyperliquid API' },
      { status: 500 }
    );
  }
}

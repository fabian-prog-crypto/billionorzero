/**
 * Lighter API Proxy
 * Proxies requests to Lighter API to avoid CORS issues
 */

import { NextRequest, NextResponse } from 'next/server';

const LIGHTER_API_URL = 'https://mainnet.zklighter.elliot.ai';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');
  const address = searchParams.get('address');

  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint parameter' }, { status: 400 });
  }

  try {
    let url: string;

    switch (endpoint) {
      case 'accountsByL1Address':
        if (!address) {
          return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
        }
        url = `${LIGHTER_API_URL}/api/v1/accountsByL1Address?l1_address=${address}`;
        break;
      case 'account':
        const by = searchParams.get('by');
        const value = searchParams.get('value');
        if (!by || !value) {
          return NextResponse.json({ error: 'Missing by/value parameters' }, { status: 400 });
        }
        url = `${LIGHTER_API_URL}/api/v1/account?by=${by}&value=${value}`;
        break;
      case 'assetDetails':
        url = `${LIGHTER_API_URL}/api/v1/assetDetails`;
        break;
      default:
        return NextResponse.json({ error: 'Unknown endpoint' }, { status: 400 });
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Lighter API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Lighter API' },
      { status: 500 }
    );
  }
}

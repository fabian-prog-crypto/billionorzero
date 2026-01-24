/**
 * Ethereal API Proxy
 * Proxies requests to Ethereal API to avoid CORS issues
 */

import { NextRequest, NextResponse } from 'next/server';

const ETHEREAL_API_URL = 'https://api.ethereal.trade';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint parameter' }, { status: 400 });
  }

  try {
    let url: string;
    const params = new URLSearchParams();

    switch (endpoint) {
      case 'subaccount': {
        const sender = searchParams.get('sender');
        if (sender) params.set('sender', sender);
        url = `${ETHEREAL_API_URL}/v1/subaccount?${params.toString()}`;
        break;
      }
      case 'balance': {
        const subaccountId = searchParams.get('subaccountId');
        if (subaccountId) params.set('subaccountId', subaccountId);
        url = `${ETHEREAL_API_URL}/v1/subaccount/balance?${params.toString()}`;
        break;
      }
      case 'position': {
        const subaccountId = searchParams.get('subaccountId');
        const open = searchParams.get('open');
        if (subaccountId) params.set('subaccountId', subaccountId);
        if (open) params.set('open', open);
        url = `${ETHEREAL_API_URL}/v1/position?${params.toString()}`;
        break;
      }
      case 'product':
        url = `${ETHEREAL_API_URL}/v1/product`;
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
    console.error('Ethereal API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Ethereal API' },
      { status: 500 }
    );
  }
}

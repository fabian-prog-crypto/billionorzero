/**
 * Coinbase Exchange API Proxy
 * Proxies authenticated requests to Coinbase Exchange API
 * Handles HMAC-SHA256 signing on server-side for security
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const COINBASE_API_URL = 'https://api.exchange.coinbase.com';

function createSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  apiSecret: string
): string {
  const prehash = `${timestamp}${method}${requestPath}${body}`;
  const key = Buffer.from(apiSecret, 'base64');
  return crypto.createHmac('sha256', key).update(prehash).digest('base64');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, apiSecret, apiPassphrase, endpoint } = body;

    if (!apiKey || !apiSecret || !apiPassphrase) {
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

    let requestPath = '';
    let method = 'GET';
    let requestBody = '';

    switch (endpoint) {
      case 'accounts':
        requestPath = '/accounts';
        method = 'GET';
        break;
      default:
        return NextResponse.json(
          { error: 'Unknown endpoint' },
          { status: 400 }
        );
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createSignature(timestamp, method, requestPath, requestBody, apiSecret);

    const url = `${COINBASE_API_URL}${requestPath}`;
    const response = await fetch(url, {
      method,
      headers: {
        'CB-ACCESS-KEY': apiKey,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
        'CB-ACCESS-PASSPHRASE': apiPassphrase,
        'Content-Type': 'application/json',
      },
      body: method === 'GET' ? undefined : requestBody,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: `Coinbase API error: ${response.status}`,
          details: errorData,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Coinbase API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Coinbase API' },
      { status: 500 }
    );
  }
}

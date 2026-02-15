/**
 * Coinbase Advanced Trade API Proxy
 * Proxies authenticated requests to Coinbase Advanced Trade API
 * Generates JWT signatures on server-side for security
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const COINBASE_API_URL = 'https://api.coinbase.com';
const COINBASE_API_HOST = 'api.coinbase.com';

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizePrivateKey(privateKey: string): string {
  if (privateKey.includes('\\n')) {
    return privateKey.replace(/\\n/g, '\n');
  }
  return privateKey;
}

function createJwt(apiKey: string, privateKey: string, method: string, requestPath: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: apiKey,
    iss: 'cdp',
    nbf: now,
    exp: now + 120,
    uri: `${method} ${COINBASE_API_HOST}${requestPath}`,
  };

  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid: apiKey,
    nonce: crypto.randomUUID().replace(/-/g, ''),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign('SHA256', Buffer.from(message), {
    key: normalizePrivateKey(privateKey),
    dsaEncoding: 'ieee-p1363',
  });

  const encodedSignature = base64UrlEncode(signature);
  return `${message}.${encodedSignature}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, apiSecret, apiPrivateKey, endpoint } = body;
    const privateKey = apiPrivateKey || apiSecret;

    if (!apiKey || !privateKey) {
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

    const fetchWithJwt = async (path: string) => {
      const token = createJwt(apiKey, privateKey, method, path);
      const url = `${COINBASE_API_URL}${path}`;
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: method === 'GET' ? undefined : requestBody,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          ok: false as const,
          response: NextResponse.json(
            {
              error: `Coinbase API error: ${response.status}`,
              details: errorData,
            },
            { status: response.status }
          ),
        };
      }

      const data = await response.json();
      return { ok: true as const, data };
    };

    switch (endpoint) {
      case 'accounts':
        requestPath = '/api/v3/brokerage/accounts';
        method = 'GET';
        break;
      default:
        return NextResponse.json(
          { error: 'Unknown endpoint' },
          { status: 400 }
        );
    }

    if (endpoint === 'accounts') {
      const allAccounts: unknown[] = [];
      let cursor: string | undefined;
      const maxPages = 20;

      for (let page = 0; page < maxPages; page += 1) {
        const params = new URLSearchParams({ limit: '250' });
        if (cursor) params.set('cursor', cursor);
        const path = `${requestPath}?${params.toString()}`;

        const pageResult = await fetchWithJwt(path);
        if (!pageResult.ok) {
          return pageResult.response;
        }

        const pageData = pageResult.data;

        if (Array.isArray(pageData.accounts)) {
          allAccounts.push(...pageData.accounts);
        }

        const pagination = pageData?.pagination || {};
        const hasNext = pagination.has_next ?? pageData?.has_next;
        const nextCursor =
          pagination.next_cursor ||
          pagination.cursor ||
          pageData?.next_cursor ||
          pageData?.cursor;

        if (!hasNext || !nextCursor) {
          break;
        }
        cursor = nextCursor;
      }

      return NextResponse.json({ accounts: allAccounts });
    }

    const result = await fetchWithJwt(requestPath);
    if (!result.ok) {
      return result.response;
    }
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Coinbase API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Coinbase API' },
      { status: 500 }
    );
  }
}

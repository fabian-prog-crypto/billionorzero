import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://pro-openapi.debank.com/v1';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const apiKey = searchParams.get('apiKey');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 });
  }

  try {
    // Use all_token_list with is_all=false to get wallet tokens across ALL chains
    // is_all=false excludes protocol receipt tokens (aTokens, LP tokens, etc.)
    // Protocol positions (including Pendle PTs, Aave deposits) come from the protocols endpoint
    const response = await fetch(
      `${BASE_URL}/user/all_token_list?id=${address}&is_all=false`,
      {
        headers: {
          'AccessKey': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeBank API error:', response.status, errorText);
      return NextResponse.json(
        { error: `DeBank API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching from DeBank:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from DeBank', details: String(error) },
      { status: 500 }
    );
  }
}

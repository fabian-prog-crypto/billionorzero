import { NextRequest, NextResponse } from 'next/server';

// Debug endpoint to check DeBank API response format
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const apiKey = searchParams.get('apiKey');

  if (!address || !apiKey) {
    return NextResponse.json({ error: 'Address and apiKey required' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://pro-openapi.debank.com/v1/user/all_token_list?id=${address}`,
      {
        headers: {
          'AccessKey': apiKey,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'DeBank error', status: response.status }, { status: 500 });
    }

    const tokens = await response.json();

    // Calculate what the values should be
    const calculations = tokens
      .filter((t: any) => t.amount > 0 && t.price > 0)
      .map((t: any) => ({
        symbol: t.symbol,
        chain: t.chain,
        amount: t.amount,
        price: t.price,
        calculatedValue: t.amount * t.price,
        priceKey: `debank-${t.symbol.toLowerCase()}-${t.chain}`,
      }))
      .sort((a: any, b: any) => b.calculatedValue - a.calculatedValue);

    const totalNAV = calculations.reduce((sum: number, t: any) => sum + t.calculatedValue, 0);

    return NextResponse.json({
      tokenCount: calculations.length,
      totalNAV: totalNAV.toFixed(2),
      top10: calculations.slice(0, 10),
      allTokens: calculations,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

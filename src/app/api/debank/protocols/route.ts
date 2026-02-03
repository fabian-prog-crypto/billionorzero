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
    const response = await fetch(
      `${BASE_URL}/user/all_complex_protocol_list?id=${address}`,
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

    // Log Sablier data specifically for debugging vesting positions
    if (Array.isArray(data)) {
      const sablierProtocols = data.filter((p: any) =>
        p.name?.toLowerCase().includes('sablier') ||
        p.id?.toLowerCase().includes('sablier')
      );
      if (sablierProtocols.length > 0) {
        console.log('[API /debank/protocols] Sablier protocols found:', JSON.stringify(sablierProtocols, null, 2));
      }

      // Also log any protocols with vesting detail_types
      const vestingProtocols = data.filter((p: any) =>
        p.portfolio_item_list?.some((item: any) =>
          item.detail_types?.includes('vesting') ||
          item.detail_types?.includes('locked')
        )
      );
      if (vestingProtocols.length > 0) {
        console.log('[API /debank/protocols] Protocols with vesting/locked:',
          vestingProtocols.map((p: any) => ({
            name: p.name,
            items: p.portfolio_item_list?.map((i: any) => ({
              name: i.name,
              detail_types: i.detail_types,
              stats: i.stats,
              supply_tokens: i.detail?.supply_token_list?.length || 0,
              reward_tokens: i.detail?.reward_token_list?.length || 0,
            }))
          }))
        );
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching from DeBank:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from DeBank', details: String(error) },
      { status: 500 }
    );
  }
}

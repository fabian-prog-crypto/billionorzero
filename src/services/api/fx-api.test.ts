import { FxApiClient, getFallbackFxRates } from './fx-api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('FxApiClient', () => {
  let client: FxApiClient;

  beforeEach(() => {
    client = new FxApiClient();
    client.clearCache();
    mockFetch.mockReset();
  });

  it('fetches and converts EUR-based rates to USD-based rates', async () => {
    const frankfurterData = {
      rates: { USD: 1.08, GBP: 0.85, CHF: 0.94 },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(frankfurterData));

    const rates = await client.getAllRates();

    expect(rates.USD).toBe(1.0);
    // GBP = EUR/USD / EUR/GBP = 1.08 / 0.85 ≈ 1.2706
    expect(rates.GBP).toBeCloseTo(1.08 / 0.85, 4);
    // CHF = EUR/USD / EUR/CHF = 1.08 / 0.94 ≈ 1.1489
    expect(rates.CHF).toBeCloseTo(1.08 / 0.94, 4);
    // EUR = eurToUsd
    expect(rates.EUR).toBe(1.08);
  });

  it('falls back to fallback rates on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const rates = await client.getAllRates();

    const fallback = getFallbackFxRates();
    expect(rates).toEqual(fallback);
    expect(rates.USD).toBe(1.0);
    expect(rates.EUR).toBe(1.19);
  });

  it('falls back to fallback rates on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    const rates = await client.getAllRates();

    const fallback = getFallbackFxRates();
    expect(rates).toEqual(fallback);
  });

  it('returns specific rate via getRate()', async () => {
    const frankfurterData = {
      rates: { USD: 1.08, GBP: 0.85 },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(frankfurterData));

    const gbpRate = await client.getRate('GBP');
    expect(gbpRate).toBeCloseTo(1.08 / 0.85, 4);

    // Second call should use cache - no additional fetch
    const usdRate = await client.getRate('USD');
    expect(usdRate).toBe(1.0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

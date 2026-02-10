import { StockApiClient } from './stock-api';
import { ApiError } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('StockApiClient', () => {
  let client: StockApiClient;

  beforeEach(() => {
    client = new StockApiClient('test-api-key');
    mockFetch.mockReset();
  });

  it('fetches a successful quote', async () => {
    const quoteData = { c: 150.25, d: 2.5, dp: 1.69, h: 152, l: 148, o: 149, pc: 147.75, t: 1234567890 };
    mockFetch.mockResolvedValueOnce(jsonResponse(quoteData));

    const result = await client.getQuote('AAPL');
    expect(result).toEqual(quoteData);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('symbol=AAPL');
    expect(url).toContain('token=test-api-key');
  });

  it('throws ApiError on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    try {
      await client.getQuote('AAPL');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(500);
      expect((error as ApiError).service).toBe('finnhub');
    }
  });

  it('throws ApiError when API key is missing', async () => {
    const noKeyClient = new StockApiClient();

    try {
      await noKeyClient.getQuote('AAPL');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(401);
      expect((error as ApiError).service).toBe('finnhub');
    }
  });

  it('throws ApiError for invalid symbol (c=0, d=null)', async () => {
    const invalidData = { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse(invalidData));

    try {
      await client.getQuote('XXXXX');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(404);
      expect((error as ApiError).service).toBe('finnhub');
    }
  });

  it('handles quote with missing optional fields gracefully', async () => {
    const partialData = { c: 100, d: 1, dp: 1.0, h: 101, l: 99, o: 99.5, pc: 99, t: 1234567890 };
    mockFetch.mockResolvedValueOnce(jsonResponse(partialData));

    const result = await client.getQuote('MSFT');
    expect(result.c).toBe(100);
    expect(result.d).toBe(1);
  });
});

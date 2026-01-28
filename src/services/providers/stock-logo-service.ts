/**
 * Stock Logo Service
 *
 * Provides logo URLs for stocks and ETFs using multiple fallback sources:
 * 1. Elbstream API (400k+ logos, free)
 * 2. Logo.dev (if API key configured)
 * 3. Clearbit-style domain lookup
 *
 * Sources:
 * - Elbstream: https://elbstream.com/logos
 * - Logo.dev: https://logo.dev
 */

// Known company domains for major stocks (fallback for domain-based lookups)
const STOCK_DOMAINS: Record<string, string> = {
  // Tech Giants
  aapl: 'apple.com',
  msft: 'microsoft.com',
  googl: 'google.com',
  goog: 'google.com',
  amzn: 'amazon.com',
  meta: 'meta.com',
  nvda: 'nvidia.com',
  tsla: 'tesla.com',
  nflx: 'netflix.com',

  // Software & Cloud
  crm: 'salesforce.com',
  adbe: 'adobe.com',
  orcl: 'oracle.com',
  now: 'servicenow.com',
  snow: 'snowflake.com',
  pltr: 'palantir.com',
  uber: 'uber.com',
  abnb: 'airbnb.com',
  shop: 'shopify.com',
  sq: 'squareup.com',
  twlo: 'twilio.com',
  okta: 'okta.com',
  ddog: 'datadoghq.com',
  net: 'cloudflare.com',
  team: 'atlassian.com',

  // Semiconductors
  amd: 'amd.com',
  intc: 'intel.com',
  avgo: 'broadcom.com',
  qcom: 'qualcomm.com',
  txn: 'ti.com',
  mu: 'micron.com',
  amat: 'appliedmaterials.com',
  lrcx: 'lamresearch.com',
  klac: 'kla.com',
  asml: 'asml.com',
  arm: 'arm.com',

  // Finance
  jpm: 'jpmorganchase.com',
  bac: 'bankofamerica.com',
  wfc: 'wellsfargo.com',
  gs: 'goldmansachs.com',
  ms: 'morganstanley.com',
  c: 'citigroup.com',
  v: 'visa.com',
  ma: 'mastercard.com',
  pypl: 'paypal.com',
  axp: 'americanexpress.com',
  schw: 'schwab.com',
  cof: 'capitalone.com',
  bk: 'bnymellon.com',

  // Healthcare
  unh: 'unitedhealthgroup.com',
  jnj: 'jnj.com',
  lly: 'lilly.com',
  pfe: 'pfizer.com',
  abbv: 'abbvie.com',
  mrk: 'merck.com',
  tmo: 'thermofisher.com',
  dhr: 'danaher.com',
  bmy: 'bms.com',
  amgn: 'amgen.com',
  gild: 'gilead.com',
  vrtx: 'vrtx.com',
  regn: 'regeneron.com',
  isrg: 'intuitive.com',

  // Consumer
  ko: 'coca-cola.com',
  pep: 'pepsico.com',
  pg: 'pg.com',
  cost: 'costco.com',
  wmt: 'walmart.com',
  hd: 'homedepot.com',
  low: 'lowes.com',
  mcd: 'mcdonalds.com',
  sbux: 'starbucks.com',
  nke: 'nike.com',
  dis: 'disney.com',
  cmcsa: 'comcastcorporation.com',

  // Industrial & Energy
  cat: 'caterpillar.com',
  de: 'deere.com',
  ba: 'boeing.com',
  hon: 'honeywell.com',
  ge: 'ge.com',
  mmm: '3m.com',
  ups: 'ups.com',
  fdx: 'fedex.com',
  xom: 'exxonmobil.com',
  cvx: 'chevron.com',
  cop: 'conocophillips.com',

  // Telecom
  t: 'att.com',
  vz: 'verizon.com',
  tmus: 't-mobile.com',

  // ETF Providers (use provider logo)
  spy: 'ssga.com',
  voo: 'vanguard.com',
  vti: 'vanguard.com',
  vxus: 'vanguard.com',
  vt: 'vanguard.com',
  bnd: 'vanguard.com',
  vug: 'vanguard.com',
  vgt: 'vanguard.com',
  vwo: 'vanguard.com',
  vea: 'vanguard.com',
  qqq: 'invesco.com',
  qqqm: 'invesco.com',
  ivv: 'ishares.com',
  ief: 'ishares.com',
  iefa: 'ishares.com',
  eem: 'ishares.com',
  iwm: 'ishares.com',
  agg: 'ishares.com',
  lqd: 'ishares.com',
  dia: 'ssga.com',
  xlk: 'ssga.com',
  xlf: 'ssga.com',
  xle: 'ssga.com',
  xlv: 'ssga.com',
  arkk: 'ark-invest.com',
  arkw: 'ark-invest.com',
  arkg: 'ark-invest.com',
  arkf: 'ark-invest.com',
  arkq: 'ark-invest.com',

  // Crypto-related stocks/ETFs
  coin: 'coinbase.com',
  mstr: 'microstrategy.com',
  gbtc: 'grayscale.com',
  ethe: 'grayscale.com',
  ibit: 'ishares.com',
  fbtc: 'fidelity.com',
  bitb: 'bitwiseinvestments.com',
};

/**
 * Get logo URL for a stock symbol
 * Returns array of URLs to try in order (fallback chain)
 */
export function getStockLogoUrls(symbol: string): string[] {
  const normalizedSymbol = symbol.toUpperCase();
  const lowerSymbol = symbol.toLowerCase();
  const urls: string[] = [];

  // 1. Elbstream API (free, 400k+ logos)
  // Supports ticker symbols directly
  urls.push(`https://api.elbstream.com/logos/symbol/${normalizedSymbol}`);

  // 2. Logo.dev ticker endpoint (works without auth for some lookups)
  urls.push(`https://img.logo.dev/ticker/${normalizedSymbol}`);

  // 3. Domain-based fallback using Clearbit-style lookup
  const domain = STOCK_DOMAINS[lowerSymbol];
  if (domain) {
    // Clearbit logo API (being sunset but still works for many)
    urls.push(`https://logo.clearbit.com/${domain}`);
    // Logo.dev domain lookup
    urls.push(`https://img.logo.dev/${domain}`);
  }

  return urls;
}

/**
 * Get a single best-effort logo URL for a stock
 * Primarily uses Elbstream which has good coverage
 */
export function getStockLogoUrl(symbol: string): string {
  return `https://api.elbstream.com/logos/symbol/${symbol.toUpperCase()}`;
}

/**
 * Check if we have a known domain mapping for a stock
 */
export function hasKnownDomain(symbol: string): boolean {
  return symbol.toLowerCase() in STOCK_DOMAINS;
}

/**
 * Get company domain for a stock symbol
 */
export function getStockDomain(symbol: string): string | null {
  return STOCK_DOMAINS[symbol.toLowerCase()] || null;
}

// Singleton service instance
class StockLogoService {
  private cache: Map<string, string | null> = new Map();

  /**
   * Get logo URL for a stock, checking cache first
   */
  getLogoUrl(symbol: string): string {
    const cacheKey = symbol.toLowerCase();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || getStockLogoUrl(symbol);
    }
    return getStockLogoUrl(symbol);
  }

  /**
   * Get all fallback URLs for a stock
   */
  getFallbackUrls(symbol: string): string[] {
    return getStockLogoUrls(symbol);
  }

  /**
   * Mark a logo URL as failed (for tracking purposes)
   */
  markFailed(symbol: string, url: string): void {
    // Could be used for analytics or to skip known-bad URLs
    console.debug(`Stock logo failed for ${symbol}: ${url}`);
  }
}

// Singleton instance
let instance: StockLogoService | null = null;

export function getStockLogoService(): StockLogoService {
  if (!instance) {
    instance = new StockLogoService();
  }
  return instance;
}

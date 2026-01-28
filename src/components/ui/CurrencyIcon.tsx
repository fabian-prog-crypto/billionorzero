'use client';

import CryptoIcon from './CryptoIcon';

// Currency flag emoji map
const CURRENCY_FLAGS: Record<string, string> = {
  usd: '🇺🇸',
  eur: '🇪🇺',
  gbp: '🇬🇧',
  chf: '🇨🇭',
  jpy: '🇯🇵',
  cny: '🇨🇳',
  cad: '🇨🇦',
  aud: '🇦🇺',
  nzd: '🇳🇿',
  hkd: '🇭🇰',
  sgd: '🇸🇬',
  sek: '🇸🇪',
  nok: '🇳🇴',
  dkk: '🇩🇰',
  krw: '🇰🇷',
  inr: '🇮🇳',
  brl: '🇧🇷',
  mxn: '🇲🇽',
  zar: '🇿🇦',
  aed: '🇦🇪',
  thb: '🇹🇭',
  pln: '🇵🇱',
  czk: '🇨🇿',
  ils: '🇮🇱',
  php: '🇵🇭',
  idr: '🇮🇩',
  myr: '🇲🇾',
  try: '🇹🇷',
  rub: '🇷🇺',
};

// Stablecoin symbols that should use CryptoIcon
const STABLECOINS = new Set([
  'usdt', 'usdc', 'dai', 'busd', 'tusd', 'frax', 'lusd', 'usdd',
  'gusd', 'usdp', 'pyusd', 'eurs', 'eurc', 'usde', 'susde', 'gho',
  'crvusd', 'fdusd', 'usdj', 'susd', 'dola', 'mim', 'rai', 'fei'
]);

interface CurrencyIconProps {
  symbol: string;
  size?: number;
  className?: string;
  logoUrl?: string | null;
}

export default function CurrencyIcon({ symbol, size = 24, className = '', logoUrl }: CurrencyIconProps) {
  const normalizedSymbol = symbol.toLowerCase();

  // If it's a stablecoin, use CryptoIcon
  if (STABLECOINS.has(normalizedSymbol)) {
    return <CryptoIcon symbol={symbol} size={size} className={className} logoUrl={logoUrl} />;
  }

  // If it's a fiat currency with a flag
  const flag = CURRENCY_FLAGS[normalizedSymbol];
  if (flag) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.75 }}
      >
        {flag}
      </div>
    );
  }

  // Fallback to letter avatar
  return (
    <div
      className={` flex items-center justify-center text-xs font-semibold bg-[var(--tag-bg)] ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { getStockLogoUrls } from '@/services/providers/stock-logo-service';
import { SUBCATEGORY_COLORS } from '@/lib/colors';

interface StockIconProps {
  symbol: string;
  size?: number;
  className?: string;
  isETF?: boolean;
  logoUrl?: string | null; // Priority logo URL if available
}

/**
 * StockIcon Component
 *
 * Displays company logos for stocks and ETFs with multi-source fallback:
 * 1. Priority logoUrl (if provided)
 * 2. Elbstream API (400k+ logos)
 * 3. Logo.dev ticker lookup
 * 4. Clearbit domain lookup
 * 5. 2-letter avatar fallback
 *
 * Usage:
 * <StockIcon symbol="AAPL" size={24} />
 * <StockIcon symbol="SPY" size={24} isETF />
 */
export default function StockIcon({
  symbol,
  size = 32,
  className = '',
  isETF = false,
  logoUrl,
}: StockIconProps) {
  const [urlIndex, setUrlIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(false);

  // Build URL chain: priority logo -> Elbstream -> Logo.dev -> Clearbit
  const fallbackUrls = getStockLogoUrls(symbol);

  const allUrls: string[] = [];
  if (logoUrl) allUrls.push(logoUrl);
  allUrls.push(...fallbackUrls);

  // Fallback to 2-letter colored avatar
  if (allFailed || allUrls.length === 0) {
    const bgColor = isETF
      ? SUBCATEGORY_COLORS.equities_etfs
      : SUBCATEGORY_COLORS.equities_stocks;

    return (
      <div
        className={`flex items-center justify-center text-xs font-semibold text-white ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: bgColor,
          fontSize: size * 0.35,
        }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={allUrls[urlIndex]}
      alt={symbol}
      width={size}
      height={size}
      className={`object-contain bg-white ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
      }}
      onError={() => {
        if (urlIndex < allUrls.length - 1) {
          setUrlIndex(urlIndex + 1);
        } else {
          setAllFailed(true);
        }
      }}
    />
  );
}

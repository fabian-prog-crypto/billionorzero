'use client';

import { useState } from 'react';

// Map common crypto symbols to CoinGecko image IDs
// Format: symbol -> { id: coin_id, img: image_number }
// Image URLs: https://assets.coingecko.com/coins/images/{img}/small/{id}.png
const COINGECKO_IMAGES: Record<string, { id: string; img: number }> = {
  // Major coins
  btc: { id: 'bitcoin', img: 1 },
  eth: { id: 'ethereum', img: 279 },
  sol: { id: 'solana', img: 4128 },
  bnb: { id: 'binancecoin', img: 825 },
  xrp: { id: 'ripple', img: 44 },
  ada: { id: 'cardano', img: 975 },
  doge: { id: 'dogecoin', img: 5 },
  dot: { id: 'polkadot', img: 12171 },
  matic: { id: 'matic-network', img: 4713 },
  pol: { id: 'polygon-ecosystem-token', img: 39659 },
  avax: { id: 'avalanche-2', img: 12559 },
  link: { id: 'chainlink', img: 877 },
  uni: { id: 'uniswap', img: 12504 },
  atom: { id: 'cosmos', img: 1481 },
  ltc: { id: 'litecoin', img: 2 },
  etc: { id: 'ethereum-classic', img: 453 },
  xlm: { id: 'stellar', img: 100 },
  near: { id: 'near', img: 10365 },
  apt: { id: 'aptos', img: 26455 },
  arb: { id: 'arbitrum', img: 16547 },
  op: { id: 'optimism', img: 25244 },
  sui: { id: 'sui', img: 26375 },
  sei: { id: 'sei-network', img: 28205 },
  inj: { id: 'injective-protocol', img: 12882 },
  tia: { id: 'celestia', img: 31967 },
  jup: { id: 'jupiter-exchange-solana', img: 34188 },
  pyth: { id: 'pyth-network', img: 28177 },
  wif: { id: 'dogwifcoin', img: 33566 },
  bonk: { id: 'bonk', img: 28600 },
  pepe: { id: 'pepe', img: 29850 },
  shib: { id: 'shiba-inu', img: 11939 },
  floki: { id: 'floki', img: 16746 },
  ton: { id: 'the-open-network', img: 17980 },
  trx: { id: 'tron', img: 1094 },
  hbar: { id: 'hedera-hashgraph', img: 3688 },
  icp: { id: 'internet-computer', img: 14495 },
  fil: { id: 'filecoin', img: 12817 },
  ftm: { id: 'fantom', img: 4001 },
  kas: { id: 'kaspa', img: 25751 },
  xmr: { id: 'monero', img: 69 },
  bch: { id: 'bitcoin-cash', img: 780 },
  leo: { id: 'leo-token', img: 8418 },
  okb: { id: 'okb', img: 4463 },

  // Stablecoins
  usdt: { id: 'tether', img: 325 },
  usdc: { id: 'usd-coin', img: 6319 },
  dai: { id: 'dai', img: 9956 },
  busd: { id: 'binance-usd', img: 9576 },
  tusd: { id: 'true-usd', img: 3449 },
  frax: { id: 'frax', img: 13422 },
  lusd: { id: 'liquity-usd', img: 14666 },
  usdd: { id: 'usdd', img: 25380 },
  gusd: { id: 'gemini-dollar', img: 5992 },
  usdp: { id: 'paxos-standard', img: 6013 },
  pyusd: { id: 'paypal-usd', img: 31212 },
  eurs: { id: 'stasis-eurs', img: 5164 },
  eurc: { id: 'euro-coin', img: 26045 },
  usde: { id: 'ethena-usde', img: 33613 },
  gho: { id: 'gho', img: 30663 },
  crvusd: { id: 'crvusd', img: 30118 },

  // DeFi tokens
  aave: { id: 'aave', img: 12645 },
  lit: { id: 'lit-protocol', img: 70287 },
  crv: { id: 'curve-dao-token', img: 12124 },
  cvx: { id: 'convex-finance', img: 15585 },
  mkr: { id: 'maker', img: 1364 },
  ldo: { id: 'lido-dao', img: 13573 },
  steth: { id: 'staked-ether', img: 13442 },
  wsteth: { id: 'wrapped-steth', img: 18834 },
  reth: { id: 'rocket-pool-eth', img: 20764 },
  cbeth: { id: 'coinbase-wrapped-staked-eth', img: 27008 },
  comp: { id: 'compound-governance-token', img: 10775 },
  snx: { id: 'havven', img: 3406 },
  bal: { id: 'balancer', img: 11683 },
  sushi: { id: 'sushi', img: 12271 },
  cake: { id: 'pancakeswap-token', img: 12632 },
  gmx: { id: 'gmx', img: 18323 },
  dydx: { id: 'dydx-chain', img: 28324 },
  ens: { id: 'ethereum-name-service', img: 19785 },
  '1inch': { id: '1inch', img: 13469 },
  grt: { id: 'the-graph', img: 13397 },
  mana: { id: 'decentraland', img: 1442 },
  sand: { id: 'the-sandbox', img: 12129 },
  axs: { id: 'axie-infinity', img: 13029 },
  ape: { id: 'apecoin', img: 24383 },
  blur: { id: 'blur', img: 28453 },
  pendle: { id: 'pendle', img: 15069 },
  ena: { id: 'ethena', img: 36530 },
  eigen: { id: 'eigenlayer', img: 37145 },
  morpho: { id: 'morpho', img: 27597 },
  aero: { id: 'aerodrome-finance', img: 31745 },

  // Wrapped tokens
  weth: { id: 'weth', img: 2518 },
  wbtc: { id: 'wrapped-bitcoin', img: 7598 },
  tbtc: { id: 'tbtc', img: 11522 },
  renbtc: { id: 'renbtc', img: 11370 },

  // Layer 2 & Infrastructure
  strk: { id: 'starknet', img: 26997 },
  zk: { id: 'zksync', img: 38080 },
  imx: { id: 'immutable-x', img: 17233 },
  rndr: { id: 'render-token', img: 11636 },
  fet: { id: 'artificial-superintelligence-alliance', img: 5681 },
  agix: { id: 'singularitynet', img: 2138 },
  ocean: { id: 'ocean-protocol', img: 3687 },
  ar: { id: 'arweave', img: 4343 },
  theta: { id: 'theta-token', img: 2538 },
  gala: { id: 'gala', img: 12493 },
  mina: { id: 'mina-protocol', img: 15628 },
  flow: { id: 'flow', img: 13446 },
  vet: { id: 'vechain', img: 1167 },
  algo: { id: 'algorand', img: 4030 },
  qnt: { id: 'quant-network', img: 3370 },
  xtz: { id: 'tezos', img: 976 },
  egld: { id: 'elrond-erd-2', img: 11033 },
  kava: { id: 'kava', img: 9761 },
  cfx: { id: 'conflux-token', img: 13079 },
  rpl: { id: 'rocket-pool', img: 2325 },
  lrc: { id: 'loopring', img: 913 },
  zrx: { id: '0x', img: 863 },
  bat: { id: 'basic-attention-token', img: 677 },
  enj: { id: 'enjincoin', img: 1102 },
  chz: { id: 'chiliz', img: 8834 },
  cro: { id: 'crypto-com-chain', img: 7310 },
};

function getCoinGeckoImageUrl(symbol: string): string | null {
  const normalizedSymbol = symbol.toLowerCase();
  const coinData = COINGECKO_IMAGES[normalizedSymbol];

  if (coinData) {
    return `https://assets.coingecko.com/coins/images/${coinData.img}/small/${coinData.id}.png`;
  }

  return null;
}

// Fallback icon sources
function getFallbackUrls(symbol: string): string[] {
  const normalizedSymbol = symbol.toLowerCase();
  return [
    // spothq cryptocurrency-icons (good coverage)
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${normalizedSymbol}.png`,
    // CoinCap assets API
    `https://assets.coincap.io/assets/icons/${normalizedSymbol}@2x.png`,
  ];
}

interface CryptoIconProps {
  symbol: string;
  size?: number;
  className?: string;
  isDebt?: boolean;
  logoUrl?: string | null; // Priority logo URL from DeBank/Helius API
}

export default function CryptoIcon({ symbol, size = 32, className = '', isDebt = false, logoUrl }: CryptoIconProps) {
  const [urlIndex, setUrlIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(false);

  // Build URL chain: API logo (priority) -> CoinGecko -> fallbacks
  const coingeckoUrl = getCoinGeckoImageUrl(symbol);
  const fallbackUrls = getFallbackUrls(symbol);

  // Priority order: DeBank/Helius logo -> CoinGecko -> GitHub icons -> CoinCap
  const allUrls: string[] = [];
  if (logoUrl) allUrls.push(logoUrl);
  if (coingeckoUrl) allUrls.push(coingeckoUrl);
  allUrls.push(...fallbackUrls);

  // Fallback to 2-letter avatar
  if (allFailed || allUrls.length === 0) {
    return (
      <div
        className={` flex items-center justify-center text-xs font-semibold ${
          isDebt ? 'bg-[var(--negative)] text-white' : 'bg-[var(--tag-bg)]'
        } ${className}`}
        style={{ width: size, height: size }}
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
      className={` object-cover bg-[var(--tag-bg)] ${isDebt ? 'ring-2 ring-[var(--negative)]' : ''} ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
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

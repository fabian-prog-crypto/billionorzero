import type { CexExchange } from '@/types';

export type CexCredentialFieldId = 'apiKey' | 'apiSecret' | 'apiPassphrase';

export interface CexCredentialField {
  id: CexCredentialFieldId;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
  multiline?: boolean;
}

export interface CexExchangeConfig {
  name: string;
  logo: string;
  supported: boolean;
  validateEndpoint: string;
  credentialFields: CexCredentialField[];
}

export const CEX_EXCHANGE_CONFIG: Record<CexExchange, CexExchangeConfig> = {
  binance: {
    name: 'Binance',
    logo: 'B',
    supported: true,
    validateEndpoint: 'account',
    credentialFields: [
      { id: 'apiKey', label: 'API Key', placeholder: 'Enter your API key', type: 'text' },
      { id: 'apiSecret', label: 'API Secret', placeholder: 'Enter your API secret', type: 'password' },
    ],
  },
  coinbase: {
    name: 'Coinbase',
    logo: 'C',
    supported: true,
    validateEndpoint: 'accounts',
    credentialFields: [
      { id: 'apiKey', label: 'API Key', placeholder: 'Enter your API key', type: 'text' },
      { id: 'apiSecret', label: 'Private Key (PEM)', placeholder: '-----BEGIN EC PRIVATE KEY-----', type: 'password', multiline: true },
    ],
  },
  kraken: {
    name: 'Kraken',
    logo: 'K',
    supported: false,
    validateEndpoint: 'account',
    credentialFields: [
      { id: 'apiKey', label: 'API Key', placeholder: 'Enter your API key', type: 'text' },
      { id: 'apiSecret', label: 'API Secret', placeholder: 'Enter your API secret', type: 'password' },
    ],
  },
  okx: {
    name: 'OKX',
    logo: 'O',
    supported: false,
    validateEndpoint: 'account',
    credentialFields: [
      { id: 'apiKey', label: 'API Key', placeholder: 'Enter your API key', type: 'text' },
      { id: 'apiSecret', label: 'API Secret', placeholder: 'Enter your API secret', type: 'password' },
    ],
  },
};

export function getCexExchangeConfig(exchange: CexExchange): CexExchangeConfig {
  return CEX_EXCHANGE_CONFIG[exchange];
}

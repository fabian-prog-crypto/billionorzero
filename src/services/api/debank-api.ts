/**
 * DeBank API Client
 * Pure HTTP client for DeBank API - no business logic or fallbacks
 */

import { DebankTokenResponse, DebankProtocolResponse, ApiError } from './types';

const API_ROUTES = {
  tokens: '/api/debank/tokens',
  protocols: '/api/debank/protocols',
};

export class DebankApiClient {
  constructor(private apiKey?: string) {}

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async getWalletTokens(address: string): Promise<DebankTokenResponse[]> {
    if (!this.apiKey) {
      throw new ApiError('DeBank API key not configured', 401, 'debank');
    }

    const url = `${API_ROUTES.tokens}?address=${encodeURIComponent(address)}&apiKey=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || 'Failed to fetch wallet tokens',
        response.status,
        'debank'
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new ApiError('Invalid response format from DeBank', 500, 'debank');
    }

    return data;
  }

  async getWalletProtocols(address: string): Promise<DebankProtocolResponse[]> {
    if (!this.apiKey) {
      throw new ApiError('DeBank API key not configured', 401, 'debank');
    }

    const url = `${API_ROUTES.protocols}?address=${encodeURIComponent(address)}&apiKey=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || 'Failed to fetch protocols',
        response.status,
        'debank'
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new ApiError('Invalid response format from DeBank protocols', 500, 'debank');
    }

    return data;
  }
}

// Singleton instance
let instance: DebankApiClient | null = null;

export function getDebankApiClient(apiKey?: string): DebankApiClient {
  if (!instance) {
    instance = new DebankApiClient(apiKey);
  } else if (apiKey) {
    instance.setApiKey(apiKey);
  }
  return instance;
}

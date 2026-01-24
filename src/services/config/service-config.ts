/**
 * Service Configuration
 * Centralized configuration management for all services
 */

export interface ServiceConfig {
  debankApiKey?: string;
  stockApiKey?: string;
  useDemoData: boolean;
  refreshInterval: number; // in milliseconds
}

const CONFIG_KEYS = {
  debankApiKey: 'debank_api_key',
  stockApiKey: 'stock_api_key',
  useDemoData: 'use_demo_data',
} as const;

const DEFAULT_CONFIG: ServiceConfig = {
  debankApiKey: undefined,
  stockApiKey: undefined,
  useDemoData: false,
  refreshInterval: 10 * 60 * 1000, // 10 minutes
};

/**
 * Configuration Manager
 * Handles loading/saving config from localStorage and provides reactive updates
 */
export class ConfigManager {
  private config: ServiceConfig;
  private listeners: Set<(config: ServiceConfig) => void> = new Set();

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Load configuration from localStorage (client-side only)
   */
  loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    this.config = {
      ...DEFAULT_CONFIG,
      debankApiKey: localStorage.getItem(CONFIG_KEYS.debankApiKey) || undefined,
      stockApiKey: localStorage.getItem(CONFIG_KEYS.stockApiKey) || undefined,
      useDemoData: localStorage.getItem(CONFIG_KEYS.useDemoData) === 'true',
    };

    this.notifyListeners();
  }

  /**
   * Get current configuration
   */
  getConfig(): ServiceConfig {
    return { ...this.config };
  }

  /**
   * Get a specific configuration value
   */
  get<K extends keyof ServiceConfig>(key: K): ServiceConfig[K] {
    return this.config[key];
  }

  /**
   * Update configuration
   */
  setConfig(updates: Partial<ServiceConfig>): void {
    this.config = { ...this.config, ...updates };

    // Persist to localStorage if on client
    if (typeof window !== 'undefined') {
      if (updates.debankApiKey !== undefined) {
        if (updates.debankApiKey) {
          localStorage.setItem(CONFIG_KEYS.debankApiKey, updates.debankApiKey);
        } else {
          localStorage.removeItem(CONFIG_KEYS.debankApiKey);
        }
      }
      if (updates.stockApiKey !== undefined) {
        if (updates.stockApiKey) {
          localStorage.setItem(CONFIG_KEYS.stockApiKey, updates.stockApiKey);
        } else {
          localStorage.removeItem(CONFIG_KEYS.stockApiKey);
        }
      }
      if (updates.useDemoData !== undefined) {
        localStorage.setItem(CONFIG_KEYS.useDemoData, String(updates.useDemoData));
      }
    }

    this.notifyListeners();
  }

  /**
   * Set DeBank API key
   */
  setDebankApiKey(apiKey: string | undefined): void {
    this.setConfig({ debankApiKey: apiKey });
  }

  /**
   * Set Stock API key
   */
  setStockApiKey(apiKey: string | undefined): void {
    this.setConfig({ stockApiKey: apiKey });
  }

  /**
   * Toggle demo data mode
   */
  setUseDemoData(useDemoData: boolean): void {
    this.setConfig({ useDemoData });
  }

  /**
   * Check if any API keys are configured
   */
  hasApiKeys(): boolean {
    return !!(this.config.debankApiKey || this.config.stockApiKey);
  }

  /**
   * Check if DeBank is configured
   */
  isDebankConfigured(): boolean {
    return !!this.config.debankApiKey;
  }

  /**
   * Check if stock API is configured
   */
  isStockApiConfigured(): boolean {
    return !!this.config.stockApiKey;
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(listener: (config: ServiceConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of config changes
   */
  private notifyListeners(): void {
    const config = this.getConfig();
    this.listeners.forEach((listener) => listener(config));
  }

  /**
   * Clear all stored configuration
   */
  clearAll(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CONFIG_KEYS.debankApiKey);
      localStorage.removeItem(CONFIG_KEYS.stockApiKey);
      localStorage.removeItem(CONFIG_KEYS.useDemoData);
    }
    this.config = { ...DEFAULT_CONFIG };
    this.notifyListeners();
  }
}

// Singleton instance
let instance: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance;
}

/**
 * Hook-friendly function to get current config
 */
export function getServiceConfig(): ServiceConfig {
  return getConfigManager().getConfig();
}

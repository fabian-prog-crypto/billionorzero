# Billion or Zero - Architecture Improvements

This document contains comprehensive architecture improvements for the Billion or Zero portfolio management application. Each improvement includes the problem statement, solution, and complete code examples ready to copy-paste.

---

## Table of Contents

1. [Eliminate Code Duplication in PortfolioProvider](#1-eliminate-code-duplication-in-portfolioprovider)
2. [Decouple Services from Zustand Store](#2-decouple-services-from-zustand-store)
3. [Replace Singleton Pattern with Dependency Injection](#3-replace-singleton-pattern-with-dependency-injection)
4. [Add Error Boundaries and Proper Error Handling](#4-add-error-boundaries-and-proper-error-handling)
5. [Implement Proper Caching Layer](#5-implement-proper-caching-layer)
6. [Split the Monolithic PortfolioCalculator](#6-split-the-monolithic-portfoliocalculator)
7. [Add TypeScript Discriminated Unions for Position Types](#7-add-typescript-discriminated-unions-for-position-types)
8. [Implement Optimistic Updates](#8-implement-optimistic-updates)
9. [Add Request Deduplication and Cancellation](#9-add-request-deduplication-and-cancellation)
10. [Separate Read and Write Operations (CQRS-lite)](#10-separate-read-and-write-operations-cqrs-lite)
11. [Add WebSocket Support for Real-Time Prices](#11-add-websocket-support-for-real-time-prices)
12. [Implement Background Sync Worker](#12-implement-background-sync-worker)

---

## 1. Eliminate Code Duplication in PortfolioProvider

### Problem

The `doRefresh()` function and `useRefresh()` hook contain nearly identical logic (~80 lines duplicated). This violates DRY and makes maintenance error-prone.

### Solution

Extract the refresh logic into a single reusable function in `PortfolioService`.

### New File: `src/services/portfolio-refresh.ts`

```typescript
/**
 * Portfolio Refresh Service
 * Single source of truth for portfolio refresh logic
 */

import { Position, Wallet, CexAccount, PriceData } from '@/types';
import { getPortfolioService } from './portfolio-service';
import { getWalletProvider } from './providers/wallet-provider';
import { getPriceProvider } from './providers/price-provider';

export interface RefreshOptions {
  forceRefresh?: boolean;
  wallets: Wallet[];
  accounts: CexAccount[];
  manualPositions: Position[];
  signal?: AbortSignal;
}

export interface RefreshResult {
  success: boolean;
  walletPositions: Position[];
  accountPositions: Position[];
  prices: Record<string, PriceData>;
  errors: RefreshError[];
  timestamp: string;
}

export interface RefreshError {
  source: 'wallet' | 'cex' | 'price' | 'perps';
  message: string;
  walletAddress?: string;
  accountId?: string;
}

export async function executePortfolioRefresh(
  options: RefreshOptions
): Promise<RefreshResult> {
  const { forceRefresh = false, wallets, accounts, manualPositions, signal } = options;

  const errors: RefreshError[] = [];
  const portfolioService = getPortfolioService();
  const walletProvider = getWalletProvider();
  const priceProvider = getPriceProvider();

  // Check for abort
  const checkAbort = () => {
    if (signal?.aborted) {
      throw new Error('Refresh aborted');
    }
  };

  let walletPositions: Position[] = [];
  let accountPositions: Position[] = [];
  let prices: Record<string, PriceData> = {};

  try {
    // 1. Fetch wallet positions
    checkAbort();
    const walletResults = await Promise.allSettled(
      wallets.map(async (wallet) => {
        try {
          return await walletProvider.fetchAllWalletPositions(wallet, forceRefresh);
        } catch (error) {
          errors.push({
            source: 'wallet',
            message: error instanceof Error ? error.message : 'Unknown error',
            walletAddress: wallet.address,
          });
          return [];
        }
      })
    );

    walletPositions = walletResults
      .filter((r): r is PromiseFulfilledResult<Position[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    // 2. Fetch CEX account positions
    checkAbort();
    const accountResults = await Promise.allSettled(
      accounts
        .filter((a) => a.isActive)
        .map(async (account) => {
          try {
            return await portfolioService.fetchCexPositions(account);
          } catch (error) {
            errors.push({
              source: 'cex',
              message: error instanceof Error ? error.message : 'Unknown error',
              accountId: account.id,
            });
            return [];
          }
        })
    );

    accountPositions = accountResults
      .filter((r): r is PromiseFulfilledResult<Position[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    // 3. Collect all positions for price fetching
    checkAbort();
    const allPositions = [...walletPositions, ...accountPositions, ...manualPositions];

    // 4. Fetch prices
    try {
      prices = await priceProvider.getPricesForPositions(allPositions);
    } catch (error) {
      errors.push({
        source: 'price',
        message: error instanceof Error ? error.message : 'Failed to fetch prices',
      });
    }

    return {
      success: errors.length === 0,
      walletPositions,
      accountPositions,
      prices,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Refresh aborted') {
      return {
        success: false,
        walletPositions: [],
        accountPositions: [],
        prices: {},
        errors: [{ source: 'wallet', message: 'Refresh was cancelled' }],
        timestamp: new Date().toISOString(),
      };
    }
    throw error;
  }
}
```

### Updated `src/components/PortfolioProvider.tsx`

```typescript
'use client';

import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { executePortfolioRefresh, RefreshResult, RefreshError } from '@/services/portfolio-refresh';

interface PortfolioContextType {
  isRefreshing: boolean;
  lastRefresh: string | null;
  errors: RefreshError[];
  refresh: (forceRefresh?: boolean) => Promise<RefreshResult>;
}

const PortfolioContext = createContext<PortfolioContextType | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<RefreshError[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    wallets,
    accounts,
    positions,
    isRefreshing,
    lastRefresh,
    setRefreshing,
    setLastRefresh,
    setWalletPositions,
    setAccountPositions,
    setPrices,
  } = usePortfolioStore();

  const refresh = useCallback(async (forceRefresh = false): Promise<RefreshResult> => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setRefreshing(true);
    setErrors([]);

    try {
      const manualPositions = positions.filter(
        (p) => !p.walletAddress && !p.protocol?.startsWith('cex:')
      );

      const result = await executePortfolioRefresh({
        forceRefresh,
        wallets,
        accounts,
        manualPositions,
        signal: abortControllerRef.current.signal,
      });

      // Update store with results
      setWalletPositions(result.walletPositions);
      setAccountPositions(result.accountPositions);
      setPrices(result.prices);
      setLastRefresh(result.timestamp);
      setErrors(result.errors);

      return result;
    } finally {
      setRefreshing(false);
      abortControllerRef.current = null;
    }
  }, [wallets, accounts, positions, setRefreshing, setLastRefresh, setWalletPositions, setAccountPositions, setPrices]);

  return (
    <PortfolioContext.Provider value={{ isRefreshing, lastRefresh, errors, refresh }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within PortfolioProvider');
  }
  return context;
}
```

---

## 2. Decouple Services from Zustand Store

### Problem

`PortfolioProvider` directly manipulates the Zustand store. This couples the UI layer to implementation details.

### Solution

Create a `PortfolioManager` class that encapsulates all store interactions.

### New File: `src/services/portfolio-manager.ts`

```typescript
/**
 * Portfolio Manager
 * Encapsulates all portfolio state management
 * Decouples business logic from storage implementation
 */

import { Position, Wallet, CexAccount, PriceData, NetWorthSnapshot } from '@/types';
import { CustomPrice } from '@/store/portfolioStore';

export interface PortfolioState {
  positions: Position[];
  wallets: Wallet[];
  accounts: CexAccount[];
  prices: Record<string, PriceData>;
  customPrices: Record<string, CustomPrice>;
  snapshots: NetWorthSnapshot[];
  lastRefresh: string | null;
  isRefreshing: boolean;
}

export interface StorageAdapter {
  getState(): PortfolioState;
  setState(partial: Partial<PortfolioState>): void;
  subscribe(listener: (state: PortfolioState) => void): () => void;
}

export class PortfolioManager {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  // === Queries (Read Operations) ===

  getPositions(): Position[] {
    return this.storage.getState().positions;
  }

  getWallets(): Wallet[] {
    return this.storage.getState().wallets;
  }

  getAccounts(): CexAccount[] {
    return this.storage.getState().accounts;
  }

  getPrices(): Record<string, PriceData> {
    return this.storage.getState().prices;
  }

  getCustomPrices(): Record<string, CustomPrice> {
    return this.storage.getState().customPrices;
  }

  getManualPositions(): Position[] {
    const { positions } = this.storage.getState();
    return positions.filter(
      (p) => !p.walletAddress && !p.protocol?.startsWith('cex:')
    );
  }

  getWalletPositions(walletAddress: string): Position[] {
    const { positions } = this.storage.getState();
    return positions.filter((p) => p.walletAddress === walletAddress);
  }

  getCexPositions(accountId: string): Position[] {
    const { positions } = this.storage.getState();
    return positions.filter((p) => p.protocol?.includes(accountId));
  }

  isRefreshing(): boolean {
    return this.storage.getState().isRefreshing;
  }

  getLastRefresh(): string | null {
    return this.storage.getState().lastRefresh;
  }

  // === Commands (Write Operations) ===

  addPosition(position: Omit<Position, 'id' | 'addedAt' | 'updatedAt'>): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newPosition: Position = {
      ...position,
      id,
      addedAt: now,
      updatedAt: now,
    };

    const { positions } = this.storage.getState();
    this.storage.setState({ positions: [...positions, newPosition] });
    return id;
  }

  removePosition(id: string): void {
    const { positions } = this.storage.getState();
    this.storage.setState({
      positions: positions.filter((p) => p.id !== id),
    });
  }

  updatePosition(id: string, updates: Partial<Position>): void {
    const { positions } = this.storage.getState();
    this.storage.setState({
      positions: positions.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      ),
    });
  }

  addWallet(wallet: Omit<Wallet, 'id' | 'addedAt'>): string {
    const id = crypto.randomUUID();
    const newWallet: Wallet = {
      ...wallet,
      id,
      addedAt: new Date().toISOString(),
    };

    const { wallets } = this.storage.getState();
    this.storage.setState({ wallets: [...wallets, newWallet] });
    return id;
  }

  removeWallet(id: string): void {
    const { wallets, positions } = this.storage.getState();
    const wallet = wallets.find((w) => w.id === id);

    this.storage.setState({
      wallets: wallets.filter((w) => w.id !== id),
      positions: wallet
        ? positions.filter((p) => p.walletAddress !== wallet.address)
        : positions,
    });
  }

  updateWallet(id: string, updates: Partial<Wallet>): void {
    const { wallets } = this.storage.getState();
    this.storage.setState({
      wallets: wallets.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    });
  }

  setWalletPositions(walletPositions: Position[]): void {
    const { positions } = this.storage.getState();
    const nonWalletPositions = positions.filter(
      (p) => !p.walletAddress || p.protocol?.startsWith('cex:')
    );
    this.storage.setState({
      positions: [...nonWalletPositions, ...walletPositions],
    });
  }

  setAccountPositions(accountPositions: Position[]): void {
    const { positions } = this.storage.getState();
    const nonCexPositions = positions.filter(
      (p) => !p.protocol?.startsWith('cex:')
    );
    this.storage.setState({
      positions: [...nonCexPositions, ...accountPositions],
    });
  }

  setPrices(prices: Record<string, PriceData>): void {
    this.storage.setState({ prices });
  }

  setCustomPrice(symbol: string, price: number, note?: string): void {
    const { customPrices } = this.storage.getState();
    this.storage.setState({
      customPrices: {
        ...customPrices,
        [symbol.toLowerCase()]: {
          price,
          note,
          setAt: new Date().toISOString(),
        },
      },
    });
  }

  removeCustomPrice(symbol: string): void {
    const { customPrices } = this.storage.getState();
    const { [symbol.toLowerCase()]: _, ...rest } = customPrices;
    this.storage.setState({ customPrices: rest });
  }

  setRefreshing(isRefreshing: boolean): void {
    this.storage.setState({ isRefreshing });
  }

  setLastRefresh(timestamp: string): void {
    this.storage.setState({ lastRefresh: timestamp });
  }

  addSnapshot(snapshot: Omit<NetWorthSnapshot, 'id'>): void {
    const { snapshots } = this.storage.getState();
    this.storage.setState({
      snapshots: [...snapshots, { ...snapshot, id: crypto.randomUUID() }],
    });
  }

  clearAll(): void {
    this.storage.setState({
      positions: [],
      wallets: [],
      accounts: [],
      prices: {},
      customPrices: {},
      snapshots: [],
      lastRefresh: null,
      isRefreshing: false,
    });
  }

  // === Subscriptions ===

  subscribe(listener: (state: PortfolioState) => void): () => void {
    return this.storage.subscribe(listener);
  }
}

// Zustand adapter implementation
import { usePortfolioStore } from '@/store/portfolioStore';

export function createZustandAdapter(): StorageAdapter {
  return {
    getState: () => usePortfolioStore.getState(),
    setState: (partial) => usePortfolioStore.setState(partial),
    subscribe: (listener) => usePortfolioStore.subscribe(listener),
  };
}

// Singleton instance
let portfolioManagerInstance: PortfolioManager | null = null;

export function getPortfolioManager(): PortfolioManager {
  if (!portfolioManagerInstance) {
    portfolioManagerInstance = new PortfolioManager(createZustandAdapter());
  }
  return portfolioManagerInstance;
}
```

---

## 3. Replace Singleton Pattern with Dependency Injection

### Problem

Multiple services use singleton pattern which makes testing difficult and creates hidden dependencies.

### Solution

Use a DI container pattern with factory functions.

### New File: `src/services/container.ts`

```typescript
/**
 * Service Container
 * Dependency injection container for services
 */

import { WalletProvider } from './providers/wallet-provider';
import { PriceProvider } from './providers/price-provider';
import { PerpExchangeService } from './domain/perp-exchange-service';
import { CategoryService } from './domain/category-service';
import { PortfolioService } from './portfolio-service';
import { PortfolioManager, StorageAdapter } from './portfolio-manager';

export interface ServiceConfig {
  debank: {
    apiKey: string;
    useDemoData: boolean;
  };
  prices: {
    finnhubApiKey: string;
    useDemoData: boolean;
  };
  storage: StorageAdapter;
}

export interface ServiceContainer {
  walletProvider: WalletProvider;
  priceProvider: PriceProvider;
  perpExchangeService: PerpExchangeService;
  categoryService: CategoryService;
  portfolioService: PortfolioService;
  portfolioManager: PortfolioManager;
}

export function createServiceContainer(config: ServiceConfig): ServiceContainer {
  // Create services with explicit dependencies
  const categoryService = new CategoryService();

  const perpExchangeService = new PerpExchangeService();

  const priceProvider = new PriceProvider({
    finnhubApiKey: config.prices.finnhubApiKey,
    useDemoData: config.prices.useDemoData,
  });

  const walletProvider = new WalletProvider({
    apiKey: config.debank.apiKey,
    useDemoData: config.debank.useDemoData,
    priceProvider,
    perpExchangeService,
  });

  const portfolioManager = new PortfolioManager(config.storage);

  const portfolioService = new PortfolioService({
    walletProvider,
    priceProvider,
    portfolioManager,
    categoryService,
  });

  return {
    walletProvider,
    priceProvider,
    perpExchangeService,
    categoryService,
    portfolioService,
    portfolioManager,
  };
}

// React Context for services
import { createContext, useContext, ReactNode, useMemo } from 'react';

const ServiceContext = createContext<ServiceContainer | null>(null);

interface ServiceProviderProps {
  children: ReactNode;
  config: ServiceConfig;
}

export function ServiceProvider({ children, config }: ServiceProviderProps) {
  const services = useMemo(() => createServiceContainer(config), [config]);

  return (
    <ServiceContext.Provider value={services}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useServices(): ServiceContainer {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error('useServices must be used within ServiceProvider');
  }
  return context;
}

// Individual service hooks
export function useWalletProvider() {
  return useServices().walletProvider;
}

export function usePriceProvider() {
  return useServices().priceProvider;
}

export function usePortfolioService() {
  return useServices().portfolioService;
}

export function usePortfolioManager() {
  return useServices().portfolioManager;
}

export function useCategoryService() {
  return useServices().categoryService;
}
```

### Updated `src/app/layout.tsx`

```typescript
import { ServiceProvider, ServiceConfig } from '@/services/container';
import { createZustandAdapter } from '@/services/portfolio-manager';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Load config from localStorage or environment
  const config: ServiceConfig = {
    debank: {
      apiKey: process.env.NEXT_PUBLIC_DEBANK_API_KEY || '',
      useDemoData: process.env.NODE_ENV === 'development',
    },
    prices: {
      finnhubApiKey: process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '',
      useDemoData: process.env.NODE_ENV === 'development',
    },
    storage: createZustandAdapter(),
  };

  return (
    <html lang="en">
      <body>
        <ServiceProvider config={config}>
          <AuthProvider>
            <PortfolioProvider>
              {children}
            </PortfolioProvider>
          </AuthProvider>
        </ServiceProvider>
      </body>
    </html>
  );
}
```

---

## 4. Add Error Boundaries and Proper Error Handling

### Problem

Errors are caught and logged, but the app silently falls back to demo data without informing the user.

### Solution

Create proper error handling infrastructure with user-facing error states.

### New File: `src/lib/errors.ts`

```typescript
/**
 * Application Error Types
 * Structured error handling for the application
 */

export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',

  // API errors
  API_ERROR = 'API_ERROR',
  INVALID_API_KEY = 'INVALID_API_KEY',
  UNAUTHORIZED = 'UNAUTHORIZED',

  // Data errors
  INVALID_DATA = 'INVALID_DATA',
  NOT_FOUND = 'NOT_FOUND',

  // Application errors
  REFRESH_FAILED = 'REFRESH_FAILED',
  CALCULATION_ERROR = 'CALCULATION_ERROR',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  source?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  recoverable: boolean;
  retryable: boolean;
}

export function createAppError(
  code: ErrorCode,
  message: string,
  options: Partial<Omit<AppError, 'code' | 'message' | 'timestamp'>> = {}
): AppError {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
    recoverable: options.recoverable ?? true,
    retryable: options.retryable ?? true,
    ...options,
  };
}

export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'timestamp' in error
  );
}

export function errorFromUnknown(error: unknown, source?: string): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error types
    if (error.message.includes('fetch')) {
      return createAppError(ErrorCode.NETWORK_ERROR, 'Network request failed', {
        source,
        details: { originalMessage: error.message },
      });
    }

    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return createAppError(ErrorCode.TIMEOUT, 'Request timed out', {
        source,
        details: { originalMessage: error.message },
      });
    }

    if (error.message.includes('429') || error.message.includes('rate')) {
      return createAppError(ErrorCode.RATE_LIMITED, 'Too many requests, please wait', {
        source,
        retryable: true,
        details: { originalMessage: error.message },
      });
    }

    return createAppError(ErrorCode.API_ERROR, error.message, { source });
  }

  return createAppError(ErrorCode.API_ERROR, 'An unknown error occurred', {
    source,
    details: { error: String(error) },
  });
}

// Error messages for user display
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: 'Unable to connect. Please check your internet connection.',
  [ErrorCode.TIMEOUT]: 'The request took too long. Please try again.',
  [ErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
  [ErrorCode.API_ERROR]: 'Something went wrong. Please try again.',
  [ErrorCode.INVALID_API_KEY]: 'Invalid API key. Please check your settings.',
  [ErrorCode.UNAUTHORIZED]: 'Access denied. Please check your credentials.',
  [ErrorCode.INVALID_DATA]: 'Received invalid data. Please refresh.',
  [ErrorCode.NOT_FOUND]: 'The requested data was not found.',
  [ErrorCode.REFRESH_FAILED]: 'Failed to refresh portfolio data.',
  [ErrorCode.CALCULATION_ERROR]: 'Error calculating portfolio values.',
};

export function getUserFriendlyMessage(error: AppError): string {
  return ERROR_MESSAGES[error.code] || error.message;
}
```

### New File: `src/components/ErrorBoundary.tsx`

```typescript
'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AppError, ErrorCode, createAppError } from '@/lib/errors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: AppError, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: AppError | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error: createAppError(
        ErrorCode.CALCULATION_ERROR,
        error.message,
        { recoverable: true, retryable: true }
      ),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    const appError = createAppError(
      ErrorCode.CALCULATION_ERROR,
      error.message,
      {
        recoverable: true,
        retryable: true,
        details: { componentStack: errorInfo.componentStack },
      }
    );

    this.props.onError?.(appError, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-lg">
          <div className="text-red-600 text-lg font-semibold mb-2">
            Something went wrong
          </div>
          <p className="text-red-500 text-sm mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### New File: `src/components/ErrorDisplay.tsx`

```typescript
'use client';

import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { AppError, getUserFriendlyMessage } from '@/lib/errors';

interface ErrorDisplayProps {
  errors: AppError[];
  onRetry?: () => void;
  onDismiss?: (error: AppError) => void;
}

export function ErrorDisplay({ errors, onRetry, onDismiss }: ErrorDisplayProps) {
  if (errors.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {errors.map((error, index) => (
        <div
          key={`${error.code}-${error.timestamp}-${index}`}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800 font-medium">
              {getUserFriendlyMessage(error)}
            </p>
            {error.source && (
              <p className="text-red-600 text-sm mt-1">
                Source: {error.source}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {error.retryable && onRetry && (
              <button
                onClick={onRetry}
                className="p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded"
                title="Retry"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            {onDismiss && (
              <button
                onClick={() => onDismiss(error)}
                className="p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### New File: `src/store/errorStore.ts`

```typescript
import { create } from 'zustand';
import { AppError } from '@/lib/errors';

interface ErrorState {
  errors: AppError[];
  addError: (error: AppError) => void;
  removeError: (timestamp: string) => void;
  clearErrors: () => void;
  clearErrorsBySource: (source: string) => void;
}

export const useErrorStore = create<ErrorState>((set) => ({
  errors: [],

  addError: (error) =>
    set((state) => ({
      errors: [...state.errors, error].slice(-10), // Keep last 10 errors
    })),

  removeError: (timestamp) =>
    set((state) => ({
      errors: state.errors.filter((e) => e.timestamp !== timestamp),
    })),

  clearErrors: () => set({ errors: [] }),

  clearErrorsBySource: (source) =>
    set((state) => ({
      errors: state.errors.filter((e) => e.source !== source),
    })),
}));
```

---

## 5. Implement Proper Caching Layer

### Problem

Caching is scattered across providers with inconsistent TTLs and no invalidation strategy.

### Solution

Create a unified cache service with configurable TTLs and invalidation.

### New File: `src/services/cache/cache-service.ts`

```typescript
/**
 * Unified Cache Service
 * Centralized caching with TTL, invalidation, and persistence options
 */

export interface CacheOptions {
  ttl: number; // Time to live in milliseconds
  persist?: boolean; // Persist to localStorage
  staleWhileRevalidate?: boolean; // Return stale data while fetching fresh
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export class CacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private stats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private persistenceKey = 'app-cache';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.persistenceKey);
      if (stored) {
        const data = JSON.parse(stored);
        Object.entries(data).forEach(([key, entry]) => {
          this.cache.set(key, entry as CacheEntry<unknown>);
        });
        this.stats.size = this.cache.size;
      }
    } catch (error) {
      console.warn('Failed to load cache from storage:', error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const persistentEntries: Record<string, CacheEntry<unknown>> = {};
      this.cache.forEach((entry, key) => {
        // Only persist entries that haven't expired
        if (!this.isExpired(entry)) {
          persistentEntries[key] = entry;
        }
      });
      localStorage.setItem(this.persistenceKey, JSON.stringify(persistentEntries));
    } catch (error) {
      console.warn('Failed to save cache to storage:', error);
    }
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private isStale(entry: CacheEntry<unknown>): boolean {
    // Consider data stale after 80% of TTL has passed
    return Date.now() - entry.timestamp > entry.ttl * 0.8;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  getWithMeta<T>(key: string): { data: T; isStale: boolean } | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry || this.isExpired(entry)) {
      return null;
    }

    return {
      data: entry.data,
      isStale: this.isStale(entry),
    };
  }

  set<T>(key: string, data: T, options: Partial<CacheOptions> = {}): void {
    const { ttl = DEFAULT_TTL, persist = false } = options;

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    this.stats.size = this.cache.size;

    if (persist) {
      this.saveToStorage();
    }
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    this.stats.size = this.cache.size;
    this.saveToStorage();
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.cache.delete(key));
    this.stats.size = this.cache.size;
    this.saveToStorage();
  }

  invalidateAll(): void {
    this.cache.clear();
    this.stats.size = 0;
    localStorage.removeItem(this.persistenceKey);
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Higher-order function for cached fetches
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: Partial<CacheOptions> = {}
  ): Promise<T> {
    const { staleWhileRevalidate = false } = options;

    const cached = this.getWithMeta<T>(key);

    if (cached && !cached.isStale) {
      return cached.data;
    }

    if (cached && staleWhileRevalidate) {
      // Return stale data immediately, refresh in background
      this.refreshInBackground(key, fetcher, options);
      return cached.data;
    }

    // Fetch fresh data
    const data = await fetcher();
    this.set(key, data, options);
    return data;
  }

  private async refreshInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: Partial<CacheOptions>
  ): Promise<void> {
    try {
      const data = await fetcher();
      this.set(key, data, options);
    } catch (error) {
      console.warn(`Background refresh failed for ${key}:`, error);
    }
  }
}

// Singleton instance
let cacheServiceInstance: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

// Predefined cache keys with TTLs
export const CACHE_KEYS = {
  WALLET_TOKENS: (address: string) => `wallet:tokens:${address.toLowerCase()}`,
  WALLET_PROTOCOLS: (address: string) => `wallet:protocols:${address.toLowerCase()}`,
  PRICE: (symbol: string) => `price:${symbol.toLowerCase()}`,
  COIN_LIST: 'coingecko:coin-list',
} as const;

export const CACHE_TTLS = {
  WALLET_DATA: 5 * 60 * 1000, // 5 minutes
  PRICES: 60 * 1000, // 1 minute
  COIN_LIST: 24 * 60 * 60 * 1000, // 24 hours
} as const;
```

### Usage in WalletProvider

```typescript
import { getCacheService, CACHE_KEYS, CACHE_TTLS } from '../cache/cache-service';

async getWalletTokens(walletAddress: string): Promise<Position[]> {
  const cache = getCacheService();
  const cacheKey = CACHE_KEYS.WALLET_TOKENS(walletAddress);

  return cache.getOrFetch(
    cacheKey,
    async () => {
      const response = await fetch(`/api/debank/tokens?address=${walletAddress}`);
      const data = await response.json();
      return this.transformToPositions(data);
    },
    {
      ttl: CACHE_TTLS.WALLET_DATA,
      staleWhileRevalidate: true,
    }
  );
}
```

---

## 6. Split the Monolithic PortfolioCalculator

### Problem

`portfolio-calculator.ts` is 940 lines with mixed concerns.

### Solution

Split into focused modules.

### New File: `src/services/domain/calculations/price-resolver.ts`

```typescript
/**
 * Price Resolver
 * Single responsibility: Resolve prices for positions
 */

import { Position, PriceData } from '@/types';

export interface CustomPrice {
  price: number;
  note?: string;
  setAt: string;
}

export interface ResolvedPrice {
  price: number;
  source: 'custom' | 'debank' | 'coingecko' | 'finnhub' | 'fallback';
  isStale: boolean;
}

export class PriceResolver {
  constructor(
    private prices: Record<string, PriceData>,
    private customPrices: Record<string, CustomPrice>,
    private coinIdMapper: (symbol: string) => string
  ) {}

  resolve(position: Position): ResolvedPrice {
    // 1. Check for custom price override
    const customPrice = this.customPrices[position.symbol.toLowerCase()];
    if (customPrice) {
      return {
        price: customPrice.price,
        source: 'custom',
        isStale: false,
      };
    }

    // 2. Cash positions always have price = 1
    if (position.type === 'cash') {
      return {
        price: 1,
        source: 'fallback',
        isStale: false,
      };
    }

    // 3. Try DeBank price (most accurate for wallet positions)
    if (position.debankPriceKey) {
      const debankPrice = this.prices[position.debankPriceKey];
      if (debankPrice && debankPrice.price > 0) {
        return {
          price: debankPrice.price,
          source: 'debank',
          isStale: this.isPriceStale(debankPrice),
        };
      }
    }

    // 4. Try CoinGecko for crypto
    if (position.type === 'crypto') {
      const coinId = this.coinIdMapper(position.symbol);
      const geckoPrice = this.prices[coinId];
      if (geckoPrice && geckoPrice.price > 0) {
        return {
          price: geckoPrice.price,
          source: 'coingecko',
          isStale: this.isPriceStale(geckoPrice),
        };
      }
    }

    // 5. Try Finnhub for stocks
    if (position.type === 'stock') {
      const stockPrice = this.prices[position.symbol.toLowerCase()];
      if (stockPrice && stockPrice.price > 0) {
        return {
          price: stockPrice.price,
          source: 'finnhub',
          isStale: this.isPriceStale(stockPrice),
        };
      }
    }

    // 6. Fallback to 0
    return {
      price: 0,
      source: 'fallback',
      isStale: true,
    };
  }

  private isPriceStale(priceData: PriceData): boolean {
    const lastUpdated = new Date(priceData.lastUpdated).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastUpdated < fiveMinutesAgo;
  }
}
```

### New File: `src/services/domain/calculations/exposure-calculator.ts`

```typescript
/**
 * Exposure Calculator
 * Single responsibility: Calculate portfolio exposure metrics
 */

import { AssetWithPrice } from '@/types';
import { isPerpProtocol } from '../category-service';

export type ExposureClassification =
  | 'perp-long'
  | 'perp-short'
  | 'perp-margin'
  | 'spot-long'
  | 'spot-short'
  | 'cash'
  | 'perp-spot'
  | 'borrowed-cash';

export interface ClassifiedAsset {
  asset: AssetWithPrice;
  classification: ExposureClassification;
  absValue: number;
}

export interface ExposureMetrics {
  longExposure: number;
  shortExposure: number;
  grossExposure: number;
  netExposure: number;
  netWorth: number;
  leverage: number;
  cashPosition: number;
  cashPercentage: number;
}

export interface PerpsMetrics {
  collateral: number;
  longNotional: number;
  shortNotional: number;
  netNotional: number;
  grossNotional: number;
  utilizationRate: number;
}

export class ExposureCalculator {
  private stablecoins = new Set([
    'usdc', 'usdt', 'dai', 'busd', 'tusd', 'usdp', 'gusd', 'frax', 'lusd', 'susd',
  ]);

  classifyAsset(asset: AssetWithPrice): ClassifiedAsset {
    const isOnPerpExchange = asset.protocol ? isPerpProtocol(asset.protocol) : false;
    const isDebt = asset.isDebt || asset.value < 0;
    const absValue = Math.abs(asset.value);
    const isPerpTrade = this.detectPerpTrade(asset.name);
    const isStablecoin = this.isStablecoin(asset.symbol);

    let classification: ExposureClassification;

    if (isOnPerpExchange) {
      if (isPerpTrade.isLong) {
        classification = 'perp-long';
      } else if (isPerpTrade.isShort) {
        classification = 'perp-short';
      } else if (isStablecoin) {
        classification = 'perp-margin';
      } else {
        classification = 'perp-spot';
      }
    } else if (isStablecoin) {
      classification = isDebt ? 'borrowed-cash' : 'cash';
    } else {
      classification = isDebt ? 'spot-short' : 'spot-long';
    }

    return { asset, classification, absValue };
  }

  calculateExposureMetrics(classifiedAssets: ClassifiedAsset[]): ExposureMetrics {
    let spotLong = 0;
    let spotShort = 0;
    let perpsLong = 0;
    let perpsShort = 0;
    let cash = 0;
    let grossAssets = 0;
    let totalDebts = 0;

    for (const { classification, absValue, asset } of classifiedAssets) {
      const isDebt = asset.isDebt || asset.value < 0;

      if (!isDebt) {
        grossAssets += absValue;
      } else {
        totalDebts += absValue;
      }

      switch (classification) {
        case 'spot-long':
        case 'perp-spot':
          spotLong += absValue;
          break;
        case 'spot-short':
          spotShort += absValue;
          break;
        case 'perp-long':
          perpsLong += absValue;
          break;
        case 'perp-short':
          perpsShort += absValue;
          break;
        case 'cash':
        case 'perp-margin':
          cash += absValue;
          break;
        case 'borrowed-cash':
          // Borrowed cash doesn't count as short exposure
          break;
      }
    }

    const longExposure = spotLong + perpsLong;
    const shortExposure = spotShort + perpsShort;
    const grossExposure = longExposure + shortExposure;
    const netExposure = longExposure - shortExposure;
    const netWorth = grossAssets - totalDebts;
    const leverage = netWorth > 0 ? grossExposure / netWorth : 0;

    return {
      longExposure,
      shortExposure,
      grossExposure,
      netExposure,
      netWorth,
      leverage,
      cashPosition: cash,
      cashPercentage: grossAssets > 0 ? (cash / grossAssets) * 100 : 0,
    };
  }

  calculatePerpsMetrics(classifiedAssets: ClassifiedAsset[]): PerpsMetrics {
    let collateral = 0;
    let longNotional = 0;
    let shortNotional = 0;

    for (const { classification, absValue } of classifiedAssets) {
      switch (classification) {
        case 'perp-margin':
          collateral += absValue;
          break;
        case 'perp-long':
          longNotional += absValue;
          break;
        case 'perp-short':
          shortNotional += absValue;
          break;
      }
    }

    const grossNotional = longNotional + shortNotional;
    const estimatedMarginUsed = grossNotional / 10; // Assume 10x max leverage
    const utilizationRate = collateral > 0 ? (estimatedMarginUsed / collateral) * 100 : 0;

    return {
      collateral,
      longNotional,
      shortNotional,
      netNotional: longNotional - shortNotional,
      grossNotional,
      utilizationRate: Math.min(100, utilizationRate),
    };
  }

  private detectPerpTrade(name: string): { isPerpTrade: boolean; isLong: boolean; isShort: boolean } {
    const longMatch = / long(\s*\(|$)/i.test(name);
    const shortMatch = / short(\s*\(|$)/i.test(name);
    return {
      isPerpTrade: longMatch || shortMatch,
      isLong: longMatch,
      isShort: shortMatch,
    };
  }

  private isStablecoin(symbol: string): boolean {
    return this.stablecoins.has(symbol.toLowerCase());
  }
}
```

### New File: `src/services/domain/calculations/position-aggregator.ts`

```typescript
/**
 * Position Aggregator
 * Single responsibility: Aggregate positions by various dimensions
 */

import { AssetWithPrice } from '@/types';

export interface AggregatedPosition {
  symbol: string;
  type: string;
  isDebt: boolean;
  totalAmount: number;
  totalValue: number;
  averagePrice: number;
  positionCount: number;
  allocation: number;
}

export class PositionAggregator {
  aggregateBySymbol(positions: AssetWithPrice[]): AggregatedPosition[] {
    const aggregateMap = new Map<string, AggregatedPosition>();

    const totalGrossAssets = positions
      .filter((p) => p.value > 0)
      .reduce((sum, p) => sum + p.value, 0);

    for (const position of positions) {
      const isDebt = position.isDebt || position.value < 0;
      const key = `${position.symbol.toLowerCase()}-${position.type}-${isDebt ? 'debt' : 'asset'}`;

      const existing = aggregateMap.get(key);

      if (existing) {
        existing.totalAmount += position.amount;
        existing.totalValue += position.value;
        existing.positionCount += 1;
        existing.averagePrice = existing.totalValue / existing.totalAmount;
        existing.allocation = totalGrossAssets > 0
          ? (existing.totalValue / totalGrossAssets) * 100
          : 0;
      } else {
        aggregateMap.set(key, {
          symbol: position.symbol,
          type: position.type,
          isDebt,
          totalAmount: position.amount,
          totalValue: position.value,
          averagePrice: position.currentPrice,
          positionCount: 1,
          allocation: totalGrossAssets > 0
            ? (position.value / totalGrossAssets) * 100
            : 0,
        });
      }
    }

    return Array.from(aggregateMap.values()).sort((a, b) => {
      // Assets before debts
      if (!a.isDebt && b.isDebt) return -1;
      if (a.isDebt && !b.isDebt) return 1;
      // Sort by absolute value descending
      return Math.abs(b.totalValue) - Math.abs(a.totalValue);
    });
  }

  aggregateByCategory(
    positions: AssetWithPrice[],
    categoryMapper: (symbol: string, type: string) => string
  ): Map<string, number> {
    const categoryTotals = new Map<string, number>();

    for (const position of positions) {
      const category = categoryMapper(position.symbol, position.type);
      const current = categoryTotals.get(category) || 0;
      categoryTotals.set(category, current + position.value);
    }

    return categoryTotals;
  }

  getConcentrationMetrics(positions: AssetWithPrice[]): {
    top1: number;
    top5: number;
    top10: number;
    hhi: number;
  } {
    const positivePositions = positions.filter((p) => p.value > 0);
    const totalValue = positivePositions.reduce((sum, p) => sum + p.value, 0);

    if (totalValue === 0) {
      return { top1: 0, top5: 0, top10: 0, hhi: 0 };
    }

    const sortedValues = positivePositions
      .map((p) => p.value)
      .sort((a, b) => b - a);

    const top1 = (sortedValues[0] || 0) / totalValue * 100;
    const top5 = sortedValues.slice(0, 5).reduce((sum, v) => sum + v, 0) / totalValue * 100;
    const top10 = sortedValues.slice(0, 10).reduce((sum, v) => sum + v, 0) / totalValue * 100;

    // Herfindahl-Hirschman Index
    const hhi = sortedValues.reduce((sum, value) => {
      const share = (value / totalValue) * 100;
      return sum + share * share;
    }, 0);

    return { top1, top5, top10, hhi: Math.round(hhi) };
  }
}
```

### New File: `src/services/domain/calculations/index.ts`

```typescript
/**
 * Calculations Module
 * Re-exports all calculation services
 */

export * from './price-resolver';
export * from './exposure-calculator';
export * from './position-aggregator';

import { Position, PriceData, AssetWithPrice } from '@/types';
import { PriceResolver, CustomPrice } from './price-resolver';
import { ExposureCalculator } from './exposure-calculator';
import { PositionAggregator } from './position-aggregator';

/**
 * Facade for portfolio calculations
 */
export class PortfolioCalculations {
  private priceResolver: PriceResolver;
  private exposureCalculator: ExposureCalculator;
  private positionAggregator: PositionAggregator;

  constructor(
    prices: Record<string, PriceData>,
    customPrices: Record<string, CustomPrice>,
    coinIdMapper: (symbol: string) => string
  ) {
    this.priceResolver = new PriceResolver(prices, customPrices, coinIdMapper);
    this.exposureCalculator = new ExposureCalculator();
    this.positionAggregator = new PositionAggregator();
  }

  enrichPositions(positions: Position[]): AssetWithPrice[] {
    return positions.map((position) => {
      const resolved = this.priceResolver.resolve(position);
      const rawValue = position.amount * resolved.price;
      const value = position.isDebt ? -rawValue : rawValue;

      return {
        ...position,
        currentPrice: resolved.price,
        value,
        change24h: 0, // Would come from price data
        changePercent24h: 0,
        allocation: 0, // Calculate after all positions are enriched
      };
    });
  }

  calculateExposure(positions: AssetWithPrice[]) {
    const classified = positions.map((p) => this.exposureCalculator.classifyAsset(p));
    return {
      metrics: this.exposureCalculator.calculateExposureMetrics(classified),
      perps: this.exposureCalculator.calculatePerpsMetrics(classified),
      classified,
    };
  }

  aggregatePositions(positions: AssetWithPrice[]) {
    return this.positionAggregator.aggregateBySymbol(positions);
  }

  getConcentration(positions: AssetWithPrice[]) {
    return this.positionAggregator.getConcentrationMetrics(positions);
  }
}
```

---

## 7. Add TypeScript Discriminated Unions for Position Types

### Problem

Position type is loosely typed with optional fields, requiring runtime checks.

### Solution

Use discriminated unions for compile-time safety.

### Updated `src/types/index.ts`

```typescript
/**
 * Improved Type Definitions with Discriminated Unions
 */

// Asset types
export type AssetType = 'crypto' | 'stock' | 'cash' | 'manual';

// Position sources (discriminant)
export type PositionSource = 'wallet' | 'cex' | 'perp' | 'manual';

// Exchange types
export type PerpExchange = 'hyperliquid' | 'lighter' | 'ethereal';
export type CexExchange = 'binance' | 'coinbase' | 'kraken' | 'okx';

// Base position fields (shared by all position types)
interface BasePosition {
  id: string;
  type: AssetType;
  symbol: string;
  name: string;
  amount: number;
  isDebt?: boolean;
  addedAt: string;
  updatedAt: string;
}

// Wallet position (from DeBank/on-chain)
export interface WalletPosition extends BasePosition {
  source: 'wallet';
  walletAddress: string;
  chain: string;
  debankPriceKey: string;
  protocol?: string; // DeFi protocol name (e.g., "Aave", "Morpho")
}

// CEX position (from centralized exchange)
export interface CexPosition extends BasePosition {
  source: 'cex';
  exchange: CexExchange;
  accountId: string;
}

// Perp position (from perpetual exchange)
export interface PerpPosition extends BasePosition {
  source: 'perp';
  exchange: PerpExchange;
  walletAddress: string;
  side: 'long' | 'short';
  entryPrice?: number;
  liquidationPrice?: number;
  leverage?: number;
  unrealizedPnl?: number;
}

// Manual position (user entered)
export interface ManualPosition extends BasePosition {
  source: 'manual';
  costBasis?: number;
  notes?: string;
}

// Discriminated union of all position types
export type Position = WalletPosition | CexPosition | PerpPosition | ManualPosition;

// Type guards for runtime checking
export function isWalletPosition(p: Position): p is WalletPosition {
  return p.source === 'wallet';
}

export function isCexPosition(p: Position): p is CexPosition {
  return p.source === 'cex';
}

export function isPerpPosition(p: Position): p is PerpPosition {
  return p.source === 'perp';
}

export function isManualPosition(p: Position): p is ManualPosition {
  return p.source === 'manual';
}

// Position with calculated price data
export interface AssetWithPrice extends Position {
  currentPrice: number;
  value: number;
  change24h: number;
  changePercent24h: number;
  allocation: number;
  hasCustomPrice?: boolean;
}

// Wallet type
export interface Wallet {
  id: string;
  address: string;
  name: string;
  chains: string[];
  perpExchanges?: PerpExchange[];
  addedAt: string;
}

// CEX Account type
export interface CexAccount {
  id: string;
  exchange: CexExchange;
  name: string;
  apiKey: string;
  apiSecret: string;
  isActive: boolean;
  addedAt: string;
  lastSync?: string;
}

// Price data
export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  lastUpdated: string;
}

// Portfolio summary
export interface PortfolioSummary {
  totalValue: number;
  grossAssets: number;
  totalDebts: number;
  change24h: number;
  changePercent24h: number;
  cryptoValue: number;
  stockValue: number;
  cashValue: number;
  manualValue: number;
  positionCount: number;
  assetCount: number;
  topAssets: AssetWithPrice[];
  assetsByType: Array<{
    type: AssetType;
    value: number;
    percentage: number;
  }>;
}

// Snapshot for historical tracking
export interface NetWorthSnapshot {
  id: string;
  date: string;
  totalValue: number;
  cryptoValue: number;
  stockValue: number;
  cashValue: number;
  manualValue: number;
}
```

### Example Usage

```typescript
// Type-safe position handling
function processPosition(position: Position) {
  // TypeScript knows the exact type after checking source
  switch (position.source) {
    case 'wallet':
      // TypeScript knows this is WalletPosition
      console.log(`Wallet: ${position.walletAddress} on ${position.chain}`);
      console.log(`DeBank key: ${position.debankPriceKey}`);
      break;

    case 'cex':
      // TypeScript knows this is CexPosition
      console.log(`CEX: ${position.exchange} account ${position.accountId}`);
      break;

    case 'perp':
      // TypeScript knows this is PerpPosition
      console.log(`Perp: ${position.side} on ${position.exchange}`);
      if (position.liquidationPrice) {
        console.log(`Liq price: ${position.liquidationPrice}`);
      }
      break;

    case 'manual':
      // TypeScript knows this is ManualPosition
      if (position.costBasis) {
        console.log(`Cost basis: ${position.costBasis}`);
      }
      break;
  }
}

// Or using type guards
function getWalletAddress(position: Position): string | null {
  if (isWalletPosition(position)) {
    return position.walletAddress;
  }
  if (isPerpPosition(position)) {
    return position.walletAddress;
  }
  return null;
}
```

---

## 8. Implement Optimistic Updates

### Problem

The UI shows stale data during refresh, and users see a loading spinner for the entire duration.

### Solution

Show cached data immediately while fetching, update incrementally.

### New File: `src/hooks/useOptimisticRefresh.ts`

```typescript
/**
 * Optimistic Refresh Hook
 * Shows cached data immediately, updates incrementally
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Position, PriceData } from '@/types';
import { getCacheService } from '@/services/cache/cache-service';

interface RefreshState {
  status: 'idle' | 'refreshing' | 'success' | 'error';
  lastRefresh: string | null;
  error: Error | null;
  progress: {
    total: number;
    completed: number;
    currentStep: string;
  };
}

interface OptimisticData {
  positions: Position[];
  prices: Record<string, PriceData>;
  isStale: boolean;
}

export function useOptimisticRefresh(
  fetchFn: () => Promise<{ positions: Position[]; prices: Record<string, PriceData> }>,
  cacheKey: string
) {
  const [state, setState] = useState<RefreshState>({
    status: 'idle',
    lastRefresh: null,
    error: null,
    progress: { total: 0, completed: 0, currentStep: '' },
  });

  const [data, setData] = useState<OptimisticData>({
    positions: [],
    prices: {},
    isStale: true,
  });

  const abortRef = useRef<AbortController | null>(null);
  const cache = getCacheService();

  // Load cached data on mount
  useEffect(() => {
    const cached = cache.getWithMeta<{ positions: Position[]; prices: Record<string, PriceData> }>(cacheKey);
    if (cached) {
      setData({
        positions: cached.data.positions,
        prices: cached.data.prices,
        isStale: cached.isStale,
      });
    }
  }, [cacheKey]);

  const refresh = useCallback(async () => {
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setState((s) => ({
      ...s,
      status: 'refreshing',
      error: null,
      progress: { total: 4, completed: 0, currentStep: 'Starting...' },
    }));

    try {
      // Update progress as we go
      const updateProgress = (step: string, completed: number) => {
        setState((s) => ({
          ...s,
          progress: { ...s.progress, currentStep: step, completed },
        }));
      };

      updateProgress('Fetching wallet data...', 1);

      const result = await fetchFn();

      updateProgress('Processing positions...', 2);

      // Update data
      setData({
        positions: result.positions,
        prices: result.prices,
        isStale: false,
      });

      updateProgress('Caching results...', 3);

      // Cache the result
      cache.set(cacheKey, result, { ttl: 5 * 60 * 1000, persist: true });

      updateProgress('Complete!', 4);

      setState((s) => ({
        ...s,
        status: 'success',
        lastRefresh: new Date().toISOString(),
        progress: { total: 4, completed: 4, currentStep: 'Complete!' },
      }));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      setState((s) => ({
        ...s,
        status: 'error',
        error: error instanceof Error ? error : new Error('Unknown error'),
      }));
    } finally {
      abortRef.current = null;
    }
  }, [fetchFn, cacheKey]);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setState((s) => ({ ...s, status: 'idle' }));
    }
  }, []);

  return {
    data,
    state,
    refresh,
    cancel,
    isRefreshing: state.status === 'refreshing',
    isStale: data.isStale,
  };
}
```

### New Component: `src/components/RefreshProgress.tsx`

```typescript
'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface RefreshProgressProps {
  isRefreshing: boolean;
  progress: {
    total: number;
    completed: number;
    currentStep: string;
  };
  isStale?: boolean;
}

export function RefreshProgress({ isRefreshing, progress, isStale }: RefreshProgressProps) {
  if (!isRefreshing && !isStale) return null;

  const percentage = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border p-4 min-w-[200px]">
      {isRefreshing ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium">Refreshing...</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">{progress.currentStep}</p>
        </>
      ) : isStale ? (
        <div className="flex items-center gap-2 text-amber-600">
          <span className="text-sm">Data may be stale</span>
        </div>
      ) : null}
    </div>
  );
}
```

---

## 9. Add Request Deduplication and Cancellation

### Problem

Multiple components might trigger the same request, and navigating away doesn't cancel in-flight requests.

### Solution

Create a request manager with deduplication and cancellation.

### New File: `src/services/request-manager.ts`

```typescript
/**
 * Request Manager
 * Handles deduplication, cancellation, and retry logic for API requests
 */

type RequestKey = string;

interface PendingRequest<T> {
  promise: Promise<T>;
  abortController: AbortController;
  startTime: number;
}

interface RequestOptions {
  dedupe?: boolean;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: Required<RequestOptions> = {
  dedupe: true,
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

export class RequestManager {
  private pendingRequests = new Map<RequestKey, PendingRequest<unknown>>();
  private requestCounts = new Map<RequestKey, number>();

  async execute<T>(
    key: RequestKey,
    requestFn: (signal: AbortSignal) => Promise<T>,
    options: RequestOptions = {}
  ): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Check for existing request (deduplication)
    if (opts.dedupe) {
      const existing = this.pendingRequests.get(key) as PendingRequest<T> | undefined;
      if (existing) {
        console.log(`[RequestManager] Deduping request: ${key}`);
        return existing.promise;
      }
    }

    // Create abort controller
    const abortController = new AbortController();

    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, opts.timeout);

    // Create the request promise with retry logic
    const promise = this.executeWithRetry(
      key,
      requestFn,
      abortController.signal,
      opts.retries,
      opts.retryDelay
    ).finally(() => {
      clearTimeout(timeoutId);
      this.pendingRequests.delete(key);
    });

    // Store pending request
    this.pendingRequests.set(key, {
      promise,
      abortController,
      startTime: Date.now(),
    });

    // Track request count
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);

    return promise;
  }

  private async executeWithRetry<T>(
    key: RequestKey,
    requestFn: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    retriesLeft: number,
    retryDelay: number
  ): Promise<T> {
    try {
      return await requestFn(signal);
    } catch (error) {
      if (signal.aborted) {
        throw new Error('Request cancelled');
      }

      if (retriesLeft > 0 && this.isRetryable(error)) {
        console.log(`[RequestManager] Retrying ${key}, ${retriesLeft} attempts left`);
        await this.delay(retryDelay);
        return this.executeWithRetry(key, requestFn, signal, retriesLeft - 1, retryDelay * 2);
      }

      throw error;
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      // Retry on network errors and 5xx errors
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return true;
      }
      if (error.message.includes('500') || error.message.includes('502') ||
          error.message.includes('503') || error.message.includes('504')) {
        return true;
      }
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cancel(key: RequestKey): void {
    const pending = this.pendingRequests.get(key);
    if (pending) {
      console.log(`[RequestManager] Cancelling request: ${key}`);
      pending.abortController.abort();
      this.pendingRequests.delete(key);
    }
  }

  cancelAll(): void {
    console.log(`[RequestManager] Cancelling all ${this.pendingRequests.size} requests`);
    this.pendingRequests.forEach((request) => {
      request.abortController.abort();
    });
    this.pendingRequests.clear();
  }

  cancelByPattern(pattern: RegExp): void {
    this.pendingRequests.forEach((request, key) => {
      if (pattern.test(key)) {
        request.abortController.abort();
        this.pendingRequests.delete(key);
      }
    });
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  getStats(): { pending: number; totalRequests: Map<RequestKey, number> } {
    return {
      pending: this.pendingRequests.size,
      totalRequests: new Map(this.requestCounts),
    };
  }
}

// Singleton instance
let requestManagerInstance: RequestManager | null = null;

export function getRequestManager(): RequestManager {
  if (!requestManagerInstance) {
    requestManagerInstance = new RequestManager();
  }
  return requestManagerInstance;
}

// Request key generators
export const REQUEST_KEYS = {
  WALLET_TOKENS: (address: string) => `wallet:tokens:${address}`,
  WALLET_PROTOCOLS: (address: string) => `wallet:protocols:${address}`,
  PRICE: (symbol: string) => `price:${symbol}`,
  PERP_POSITIONS: (exchange: string, address: string) => `perp:${exchange}:${address}`,
  CEX_BALANCE: (exchange: string, accountId: string) => `cex:${exchange}:${accountId}`,
};
```

### Usage Example

```typescript
import { getRequestManager, REQUEST_KEYS } from '@/services/request-manager';

async function fetchWalletTokens(address: string): Promise<Token[]> {
  const requestManager = getRequestManager();

  return requestManager.execute(
    REQUEST_KEYS.WALLET_TOKENS(address),
    async (signal) => {
      const response = await fetch(`/api/debank/tokens?address=${address}`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    { dedupe: true, timeout: 15000, retries: 2 }
  );
}

// Cancel all wallet requests when navigating away
useEffect(() => {
  return () => {
    getRequestManager().cancelByPattern(/^wallet:/);
  };
}, []);
```

---

## 10. Separate Read and Write Operations (CQRS-lite)

### Problem

The store mixes queries (read) with commands (write), making it harder to reason about data flow.

### Solution

Implement CQRS-lite pattern with separate query and command hooks.

### New File: `src/hooks/usePortfolioQueries.ts`

```typescript
/**
 * Portfolio Queries
 * Read-only derived data from the portfolio store
 */

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculatePortfolioSummary,
  calculateExposureData,
  aggregatePositionsBySymbol,
} from '@/services/domain/portfolio-calculator';

export function usePortfolioQueries() {
  const { positions, prices, customPrices, wallets, accounts } = usePortfolioStore();

  // Enriched positions with prices
  const positionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Portfolio summary
  const summary = useMemo(() => {
    return calculatePortfolioSummary(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Exposure data
  const exposure = useMemo(() => {
    return calculateExposureData(positionsWithPrices);
  }, [positionsWithPrices]);

  // Aggregated positions
  const aggregatedPositions = useMemo(() => {
    return aggregatePositionsBySymbol(positionsWithPrices);
  }, [positionsWithPrices]);

  // Wallet-specific positions
  const getWalletPositions = useMemo(() => {
    return (walletAddress: string) => {
      return positionsWithPrices.filter((p) => p.walletAddress === walletAddress);
    };
  }, [positionsWithPrices]);

  // CEX-specific positions
  const getCexPositions = useMemo(() => {
    return (accountId: string) => {
      return positionsWithPrices.filter((p) => p.protocol?.includes(accountId));
    };
  }, [positionsWithPrices]);

  // Manual positions only
  const manualPositions = useMemo(() => {
    return positionsWithPrices.filter(
      (p) => !p.walletAddress && !p.protocol?.startsWith('cex:')
    );
  }, [positionsWithPrices]);

  // Top N positions by value
  const getTopPositions = useMemo(() => {
    return (n: number) => {
      return [...positionsWithPrices]
        .filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, n);
    };
  }, [positionsWithPrices]);

  return {
    // Raw data
    positions,
    wallets,
    accounts,
    prices,
    customPrices,

    // Computed data
    positionsWithPrices,
    summary,
    exposure,
    aggregatedPositions,
    manualPositions,

    // Accessor functions
    getWalletPositions,
    getCexPositions,
    getTopPositions,
  };
}
```

### New File: `src/hooks/usePortfolioCommands.ts`

```typescript
/**
 * Portfolio Commands
 * Write operations that modify the portfolio store
 */

import { useCallback } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { Position, Wallet, CexAccount, PriceData } from '@/types';
import { CustomPrice } from '@/store/portfolioStore';

export function usePortfolioCommands() {
  const store = usePortfolioStore();

  // Position commands
  const addPosition = useCallback(
    (position: Omit<Position, 'id' | 'addedAt' | 'updatedAt'>) => {
      store.addPosition(position);
    },
    [store]
  );

  const updatePosition = useCallback(
    (id: string, updates: Partial<Position>) => {
      store.updatePosition(id, updates);
    },
    [store]
  );

  const removePosition = useCallback(
    (id: string) => {
      store.removePosition(id);
    },
    [store]
  );

  // Wallet commands
  const addWallet = useCallback(
    (wallet: Omit<Wallet, 'id' | 'addedAt'>) => {
      store.addWallet(wallet);
    },
    [store]
  );

  const updateWallet = useCallback(
    (id: string, updates: Partial<Wallet>) => {
      store.updateWallet(id, updates);
    },
    [store]
  );

  const removeWallet = useCallback(
    (id: string) => {
      store.removeWallet(id);
    },
    [store]
  );

  // Account commands
  const addAccount = useCallback(
    (account: Omit<CexAccount, 'id' | 'addedAt'>) => {
      store.addAccount(account);
    },
    [store]
  );

  const updateAccount = useCallback(
    (id: string, updates: Partial<CexAccount>) => {
      store.updateAccount(id, updates);
    },
    [store]
  );

  const removeAccount = useCallback(
    (id: string) => {
      store.removeAccount(id);
    },
    [store]
  );

  // Batch updates
  const setWalletPositions = useCallback(
    (positions: Position[]) => {
      store.setWalletPositions(positions);
    },
    [store]
  );

  const setAccountPositions = useCallback(
    (positions: Position[]) => {
      store.setAccountPositions(positions);
    },
    [store]
  );

  const setPrices = useCallback(
    (prices: Record<string, PriceData>) => {
      store.setPrices(prices);
    },
    [store]
  );

  // Custom price commands
  const setCustomPrice = useCallback(
    (symbol: string, price: number, note?: string) => {
      store.setCustomPrice(symbol, price, note);
    },
    [store]
  );

  const removeCustomPrice = useCallback(
    (symbol: string) => {
      store.removeCustomPrice(symbol);
    },
    [store]
  );

  // Utility commands
  const clearAll = useCallback(() => {
    store.clearAll();
  }, [store]);

  return {
    // Position commands
    addPosition,
    updatePosition,
    removePosition,

    // Wallet commands
    addWallet,
    updateWallet,
    removeWallet,

    // Account commands
    addAccount,
    updateAccount,
    removeAccount,

    // Batch updates
    setWalletPositions,
    setAccountPositions,
    setPrices,

    // Custom price commands
    setCustomPrice,
    removeCustomPrice,

    // Utility
    clearAll,
  };
}
```

### Usage in Components

```typescript
import { usePortfolioQueries } from '@/hooks/usePortfolioQueries';
import { usePortfolioCommands } from '@/hooks/usePortfolioCommands';

function PositionsList() {
  // Queries - read-only computed data
  const { positionsWithPrices, summary, getTopPositions } = usePortfolioQueries();

  // Commands - write operations
  const { removePosition, updatePosition } = usePortfolioCommands();

  const topPositions = getTopPositions(10);

  return (
    <div>
      <h2>Total: ${summary.totalValue.toFixed(2)}</h2>
      {topPositions.map((position) => (
        <PositionRow
          key={position.id}
          position={position}
          onUpdate={(updates) => updatePosition(position.id, updates)}
          onRemove={() => removePosition(position.id)}
        />
      ))}
    </div>
  );
}
```

---

## 11. Add WebSocket Support for Real-Time Prices

### Problem

Prices are fetched on manual refresh, meaning data can be stale.

### Solution

Add optional WebSocket connections for real-time price updates.

### New File: `src/services/realtime/websocket-manager.ts`

```typescript
/**
 * WebSocket Manager
 * Manages WebSocket connections for real-time price updates
 */

export type PriceUpdateCallback = (symbol: string, price: number, change24h: number) => void;

interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private listeners: Set<PriceUpdateCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private subscriptions = new Set<string>();

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Resubscribe to all symbols
        this.subscriptions.forEach((symbol) => {
          this.sendSubscription(symbol);
        });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this.isConnecting = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error('[WS] Connection error:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      console.log('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval! * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle different message types based on exchange format
      if (message.type === 'price' || message.e === 'trade') {
        const { symbol, price, change24h } = this.parsePrice(message);
        this.notifyListeners(symbol, price, change24h);
      }
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
    }
  }

  private parsePrice(message: unknown): { symbol: string; price: number; change24h: number } {
    // Override in subclasses for exchange-specific parsing
    const msg = message as { symbol?: string; s?: string; price?: number; p?: string; change24h?: number };
    return {
      symbol: msg.symbol || msg.s || '',
      price: msg.price || parseFloat(msg.p || '0'),
      change24h: msg.change24h || 0,
    };
  }

  private notifyListeners(symbol: string, price: number, change24h: number): void {
    this.listeners.forEach((callback) => {
      try {
        callback(symbol, price, change24h);
      } catch (error) {
        console.error('[WS] Listener error:', error);
      }
    });
  }

  subscribe(symbol: string): void {
    this.subscriptions.add(symbol);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscription(symbol);
    }
  }

  unsubscribe(symbol: string): void {
    this.subscriptions.delete(symbol);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendUnsubscription(symbol);
    }
  }

  protected sendSubscription(symbol: string): void {
    // Override in subclasses
    this.ws?.send(JSON.stringify({ type: 'subscribe', symbol }));
  }

  protected sendUnsubscription(symbol: string): void {
    // Override in subclasses
    this.ws?.send(JSON.stringify({ type: 'unsubscribe', symbol }));
  }

  onPriceUpdate(callback: PriceUpdateCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
    this.listeners.clear();
  }

  getStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (this.isConnecting) return 'connecting';
    if (this.ws?.readyState === WebSocket.OPEN) return 'connected';
    return 'disconnected';
  }
}

// Binance WebSocket implementation
export class BinanceWebSocket extends WebSocketManager {
  constructor() {
    super({ url: 'wss://stream.binance.com:9443/ws' });
  }

  protected sendSubscription(symbol: string): void {
    const stream = `${symbol.toLowerCase()}usdt@trade`;
    this.ws?.send(JSON.stringify({
      method: 'SUBSCRIBE',
      params: [stream],
      id: Date.now(),
    }));
  }

  protected sendUnsubscription(symbol: string): void {
    const stream = `${symbol.toLowerCase()}usdt@trade`;
    this.ws?.send(JSON.stringify({
      method: 'UNSUBSCRIBE',
      params: [stream],
      id: Date.now(),
    }));
  }
}
```

### New Hook: `src/hooks/useRealtimePrices.ts`

```typescript
/**
 * Real-time Prices Hook
 * Subscribes to WebSocket for live price updates
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePortfolioCommands } from './usePortfolioCommands';
import { BinanceWebSocket, WebSocketManager } from '@/services/realtime/websocket-manager';

interface UseRealtimePricesOptions {
  symbols: string[];
  enabled?: boolean;
}

export function useRealtimePrices({ symbols, enabled = true }: UseRealtimePricesOptions) {
  const wsRef = useRef<WebSocketManager | null>(null);
  const { setPrices } = usePortfolioCommands();
  const priceBufferRef = useRef<Map<string, { price: number; change24h: number }>>(new Map());
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Batch price updates to avoid too many re-renders
  const flushPriceBuffer = useCallback(() => {
    const buffer = priceBufferRef.current;
    if (buffer.size === 0) return;

    const updates: Record<string, { price: number; change24h: number }> = {};
    buffer.forEach((data, symbol) => {
      updates[symbol] = data;
    });
    buffer.clear();

    // Update store with batched prices
    // Note: This would need to merge with existing prices
    console.log('[RT] Flushing price updates:', Object.keys(updates).length);
  }, []);

  const handlePriceUpdate = useCallback((symbol: string, price: number, change24h: number) => {
    priceBufferRef.current.set(symbol, { price, change24h });

    // Debounce flush
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = setTimeout(flushPriceBuffer, 100);
  }, [flushPriceBuffer]);

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;

    // Create WebSocket connection
    wsRef.current = new BinanceWebSocket();
    wsRef.current.connect();

    // Subscribe to price updates
    const unsubscribe = wsRef.current.onPriceUpdate(handlePriceUpdate);

    // Subscribe to symbols
    symbols.forEach((symbol) => {
      wsRef.current?.subscribe(symbol);
    });

    return () => {
      unsubscribe();
      wsRef.current?.disconnect();
      wsRef.current = null;

      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
    };
  }, [enabled, symbols.join(','), handlePriceUpdate]);

  return {
    status: wsRef.current?.getStatus() || 'disconnected',
  };
}
```

---

## 12. Implement Background Sync Worker

### Problem

Price refresh happens in the main thread and blocks UI during heavy calculations.

### Solution

Move portfolio calculations to a Web Worker.

### New File: `src/workers/portfolio-worker.ts`

```typescript
/**
 * Portfolio Web Worker
 * Offloads heavy calculations from the main thread
 */

import {
  calculateAllPositionsWithPrices,
  calculatePortfolioSummary,
  calculateExposureData,
  aggregatePositionsBySymbol,
} from '@/services/domain/portfolio-calculator';
import { Position, PriceData, AssetWithPrice, PortfolioSummary } from '@/types';
import { CustomPrice } from '@/store/portfolioStore';

// Message types
type WorkerRequest =
  | { type: 'CALCULATE_ALL'; positions: Position[]; prices: Record<string, PriceData>; customPrices: Record<string, CustomPrice> }
  | { type: 'CALCULATE_EXPOSURE'; positions: AssetWithPrice[] }
  | { type: 'AGGREGATE_POSITIONS'; positions: AssetWithPrice[] };

type WorkerResponse =
  | { type: 'CALCULATE_ALL_RESULT'; positionsWithPrices: AssetWithPrice[]; summary: PortfolioSummary }
  | { type: 'CALCULATE_EXPOSURE_RESULT'; exposure: ReturnType<typeof calculateExposureData> }
  | { type: 'AGGREGATE_POSITIONS_RESULT'; aggregated: AssetWithPrice[] }
  | { type: 'ERROR'; error: string };

// Worker message handler
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const startTime = performance.now();

  try {
    const request = event.data;
    let response: WorkerResponse;

    switch (request.type) {
      case 'CALCULATE_ALL': {
        const positionsWithPrices = calculateAllPositionsWithPrices(
          request.positions,
          request.prices,
          request.customPrices
        );
        const summary = calculatePortfolioSummary(
          request.positions,
          request.prices,
          request.customPrices
        );
        response = { type: 'CALCULATE_ALL_RESULT', positionsWithPrices, summary };
        break;
      }

      case 'CALCULATE_EXPOSURE': {
        const exposure = calculateExposureData(request.positions);
        response = { type: 'CALCULATE_EXPOSURE_RESULT', exposure };
        break;
      }

      case 'AGGREGATE_POSITIONS': {
        const aggregated = aggregatePositionsBySymbol(request.positions);
        response = { type: 'AGGREGATE_POSITIONS_RESULT', aggregated };
        break;
      }

      default:
        response = { type: 'ERROR', error: 'Unknown request type' };
    }

    const duration = performance.now() - startTime;
    console.log(`[Worker] ${request.type} completed in ${duration.toFixed(2)}ms`);

    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
```

### New File: `src/hooks/usePortfolioWorker.ts`

```typescript
/**
 * Portfolio Worker Hook
 * Offloads calculations to Web Worker
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Position, PriceData, AssetWithPrice, PortfolioSummary } from '@/types';
import { CustomPrice } from '@/store/portfolioStore';
import { ExposureData } from '@/services/domain/portfolio-calculator';

interface WorkerState {
  isCalculating: boolean;
  positionsWithPrices: AssetWithPrice[];
  summary: PortfolioSummary | null;
  exposure: ExposureData | null;
  error: string | null;
}

export function usePortfolioWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<WorkerState>({
    isCalculating: false,
    positionsWithPrices: [],
    summary: null,
    exposure: null,
    error: null,
  });

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/portfolio-worker.ts', import.meta.url)
    );

    workerRef.current.onmessage = (event) => {
      const response = event.data;

      switch (response.type) {
        case 'CALCULATE_ALL_RESULT':
          setState((s) => ({
            ...s,
            isCalculating: false,
            positionsWithPrices: response.positionsWithPrices,
            summary: response.summary,
          }));
          break;

        case 'CALCULATE_EXPOSURE_RESULT':
          setState((s) => ({
            ...s,
            isCalculating: false,
            exposure: response.exposure,
          }));
          break;

        case 'ERROR':
          setState((s) => ({
            ...s,
            isCalculating: false,
            error: response.error,
          }));
          break;
      }
    };

    workerRef.current.onerror = (error) => {
      setState((s) => ({
        ...s,
        isCalculating: false,
        error: error.message,
      }));
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const calculateAll = useCallback(
    (positions: Position[], prices: Record<string, PriceData>, customPrices: Record<string, CustomPrice>) => {
      if (!workerRef.current) return;

      setState((s) => ({ ...s, isCalculating: true, error: null }));

      workerRef.current.postMessage({
        type: 'CALCULATE_ALL',
        positions,
        prices,
        customPrices,
      });
    },
    []
  );

  const calculateExposure = useCallback((positions: AssetWithPrice[]) => {
    if (!workerRef.current) return;

    setState((s) => ({ ...s, isCalculating: true, error: null }));

    workerRef.current.postMessage({
      type: 'CALCULATE_EXPOSURE',
      positions,
    });
  }, []);

  return {
    ...state,
    calculateAll,
    calculateExposure,
  };
}
```

### Next.js Config for Worker Support

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Enable Web Workers
      config.module.rules.push({
        test: /\.worker\.ts$/,
        use: { loader: 'worker-loader' },
      });
    }
    return config;
  },
};

module.exports = nextConfig;
```

---

## Summary

These 12 improvements address the following concerns:

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Eliminate Code Duplication | High | Low |
| 2 | Decouple Services from Store | High | Medium |
| 3 | Dependency Injection | High | Medium |
| 4 | Error Handling | High | Medium |
| 5 | Caching Layer | Medium | Medium |
| 6 | Split PortfolioCalculator | High | High |
| 7 | TypeScript Discriminated Unions | Medium | Medium |
| 8 | Optimistic Updates | Medium | Medium |
| 9 | Request Deduplication | Medium | Low |
| 10 | CQRS-lite Pattern | Medium | Low |
| 11 | WebSocket Support | Low | High |
| 12 | Background Worker | Low | High |

### Recommended Implementation Order

1. **Phase 1 (Quick Wins)**
   - #1 Eliminate Duplication
   - #9 Request Deduplication
   - #10 CQRS-lite

2. **Phase 2 (Core Architecture)**
   - #3 Dependency Injection
   - #2 Decouple from Store
   - #4 Error Handling

3. **Phase 3 (Maintainability)**
   - #6 Split PortfolioCalculator
   - #7 Discriminated Unions
   - #5 Caching Layer

4. **Phase 4 (Performance)**
   - #8 Optimistic Updates
   - #12 Background Worker
   - #11 WebSocket Support

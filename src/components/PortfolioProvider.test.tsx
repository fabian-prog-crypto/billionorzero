/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen, act } from '@testing-library/react'
import { beforeEach } from 'vitest'
import type { Position } from '@/types'

// Mock services
const mockInitialize = vi.fn()
const mockRefreshPortfolio = vi.fn()
const mockGetPricesForPositions = vi.fn()

vi.mock('@/services', () => ({
  getPortfolioService: () => ({
    initialize: mockInitialize,
    refreshPortfolio: mockRefreshPortfolio,
  }),
  createDailySnapshot: vi.fn(() => ({ date: '2026-01-01', netWorth: 100000 })),
  shouldTakeSnapshot: vi.fn(() => false),
  fetchAllCexPositions: vi.fn().mockResolvedValue([]),
  getPriceProvider: () => ({
    getPricesForPositions: mockGetPricesForPositions,
  }),
}))

// Mock store - we need fine-grained control
const mockStoreState = {
  wallets: [] as unknown[],
  positions: [] as unknown[],
  accounts: [] as unknown[],
  prices: {} as Record<string, unknown>,
  snapshots: [] as unknown[],
  isRefreshing: false,
  setRefreshing: vi.fn(),
  setPrices: vi.fn(),
  setFxRates: vi.fn(),
  setWalletPositions: vi.fn(),
  setAccountPositions: vi.fn(),
  setLastRefresh: vi.fn(),
  addSnapshot: vi.fn(),
}

vi.mock('@/store/portfolioStore', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeFunction = (selector?: (state: any) => any) => {
    if (selector) return selector(mockStoreState)
    return mockStoreState
  }
  storeFunction.getState = () => mockStoreState
  storeFunction.setState = vi.fn()
  storeFunction.subscribe = vi.fn()
  return { usePortfolioStore: storeFunction }
})

// Need to import after mocks
import PortfolioProvider, { useRefresh } from './PortfolioProvider'
import { fetchAllCexPositions, shouldTakeSnapshot, createDailySnapshot } from '@/services'

// Helper component to test useRefresh hook
function RefreshButton() {
  const { refresh, isRefreshing } = useRefresh()
  return (
    <div>
      <button onClick={refresh}>Refresh</button>
      <span data-testid="status">{isRefreshing ? 'refreshing' : 'idle'}</span>
    </div>
  )
}

describe('PortfolioProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState.wallets = []
    mockStoreState.positions = []
    mockStoreState.accounts = []
    mockStoreState.prices = {}
    mockStoreState.snapshots = []
    mockStoreState.isRefreshing = false
    mockRefreshPortfolio.mockResolvedValue({
      walletPositions: [],
      prices: {},
      fxRates: {},
      isDemo: false,
    })
    mockGetPricesForPositions.mockResolvedValue({ prices: {} })
  })

  it('renders children', () => {
    render(
      <PortfolioProvider>
        <div>Child Content</div>
      </PortfolioProvider>
    )
    expect(screen.getByText('Child Content')).toBeInTheDocument()
  })

  it('calls portfolioService.initialize on mount', () => {
    render(
      <PortfolioProvider>
        <div>test</div>
      </PortfolioProvider>
    )
    expect(mockInitialize).toHaveBeenCalledTimes(1)
  })

  it('resets stuck refresh state on mount', () => {
    mockStoreState.isRefreshing = true
    render(
      <PortfolioProvider>
        <div>test</div>
      </PortfolioProvider>
    )
    expect(mockStoreState.setRefreshing).toHaveBeenCalledWith(false)
  })

  it('does not reset refresh state if not stuck', () => {
    mockStoreState.isRefreshing = false
    render(
      <PortfolioProvider>
        <div>test</div>
      </PortfolioProvider>
    )
    expect(mockStoreState.setRefreshing).not.toHaveBeenCalled()
  })
})

describe('useRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState.wallets = []
    mockStoreState.positions = []
    mockStoreState.accounts = []
    mockStoreState.prices = {}
    mockStoreState.snapshots = []
    mockStoreState.isRefreshing = false
    mockRefreshPortfolio.mockResolvedValue({
      walletPositions: [],
      prices: {},
      fxRates: {},
      isDemo: false,
    })
    mockGetPricesForPositions.mockResolvedValue({ prices: {} })
  })

  it('returns isRefreshing from store', () => {
    mockStoreState.isRefreshing = true
    render(
      <PortfolioProvider>
        <RefreshButton />
      </PortfolioProvider>
    )
    expect(screen.getByTestId('status')).toHaveTextContent('refreshing')
  })

  it('calls portfolioService.refreshPortfolio when refresh is invoked', async () => {
    render(
      <PortfolioProvider>
        <RefreshButton />
      </PortfolioProvider>
    )
    await act(async () => {
      screen.getByText('Refresh').click()
    })
    expect(mockRefreshPortfolio).toHaveBeenCalledTimes(1)
    expect(mockRefreshPortfolio).toHaveBeenCalledWith([], [], true)
  })

  it('updates store with refresh results', async () => {
    mockRefreshPortfolio.mockResolvedValue({
      walletPositions: [{ id: '1', symbol: 'BTC', amount: 1 }],
      prices: { btc: { price: 50000 } },
      fxRates: { EUR: 0.85 },
      isDemo: false,
    })
    render(
      <PortfolioProvider>
        <RefreshButton />
      </PortfolioProvider>
    )
    await act(async () => {
      screen.getByText('Refresh').click()
    })
    expect(mockStoreState.setPrices).toHaveBeenCalled()
    expect(mockStoreState.setFxRates).toHaveBeenCalledWith({ EUR: 0.85 })
    expect(mockStoreState.setWalletPositions).toHaveBeenCalledWith([{ id: '1', symbol: 'BTC', amount: 1 }])
    expect(mockStoreState.setLastRefresh).toHaveBeenCalled()
  })

  it('prevents concurrent refreshes', async () => {
    let resolveRefresh: () => void
    mockRefreshPortfolio.mockImplementation(
      () => new Promise<unknown>((resolve) => {
        resolveRefresh = () => resolve({
          walletPositions: [],
          prices: {},
          fxRates: {},
          isDemo: false,
        })
      })
    )

    render(
      <PortfolioProvider>
        <RefreshButton />
      </PortfolioProvider>
    )

    // Start first refresh
    await act(async () => {
      screen.getByText('Refresh').click()
    })

    // Try second refresh while first is in progress
    await act(async () => {
      screen.getByText('Refresh').click()
    })

    // Only one call should have been made
    expect(mockRefreshPortfolio).toHaveBeenCalledTimes(1)

    // Resolve the first refresh
    await act(async () => {
      resolveRefresh!()
    })
  })

  it('fetches CEX positions when accounts exist', async () => {
    mockStoreState.accounts = [{ id: 'acc1', exchange: 'binance' }]
    const mockFetchCex = vi.mocked(fetchAllCexPositions)
    mockFetchCex.mockResolvedValue([
      { id: 'cex1', symbol: 'BTC', amount: 0.5, type: 'crypto', protocol: 'cex:binance:acc1' } as unknown as Position,
    ])
    mockGetPricesForPositions.mockResolvedValue({
      prices: { btc: { price: 50000 } },
    })

    render(
      <PortfolioProvider>
        <RefreshButton />
      </PortfolioProvider>
    )
    await act(async () => {
      screen.getByText('Refresh').click()
    })
    expect(mockFetchCex).toHaveBeenCalledWith([{ id: 'acc1', exchange: 'binance' }])
    expect(mockStoreState.setAccountPositions).toHaveBeenCalledWith([
      { id: 'cex1', symbol: 'BTC', amount: 0.5, type: 'crypto', protocol: 'cex:binance:acc1' },
    ])
  })

  it('continues refresh even if CEX fetch fails', async () => {
    mockStoreState.accounts = [{ id: 'acc1', exchange: 'binance' }]
    const mockFetchCex = vi.mocked(fetchAllCexPositions)
    mockFetchCex.mockRejectedValue(new Error('CEX API down'))

    render(
      <PortfolioProvider>
        <RefreshButton />
      </PortfolioProvider>
    )
    await act(async () => {
      screen.getByText('Refresh').click()
    })

    // Refresh should still complete and update prices
    expect(mockStoreState.setPrices).toHaveBeenCalled()
    expect(mockStoreState.setLastRefresh).toHaveBeenCalled()
  })

  it('excludes manual positions from wallet refresh', async () => {
    mockStoreState.positions = [
      { id: '1', symbol: 'BTC', amount: 1, walletAddress: '0x123' },
      { id: '2', symbol: 'GOLD', amount: 10, type: 'manual' },
      { id: '3', symbol: 'BTC', amount: 0.5, protocol: 'cex:binance:acc1' },
      { id: '4', symbol: 'AAPL', amount: 5 },
    ]

    render(
      <PortfolioProvider>
        <RefreshButton />
      </PortfolioProvider>
    )
    await act(async () => {
      screen.getByText('Refresh').click()
    })

    // Only manual positions (no walletAddress, no cex: protocol) should be passed
    const manualPositions = mockRefreshPortfolio.mock.calls[0][0]
    expect(manualPositions).toEqual([
      { id: '2', symbol: 'GOLD', amount: 10, type: 'manual' },
      { id: '4', symbol: 'AAPL', amount: 5 },
    ])
  })

  it('takes daily snapshot when needed', async () => {
    const mockShouldTake = vi.mocked(shouldTakeSnapshot)
    mockShouldTake.mockReturnValue(true)

    render(
      <PortfolioProvider>
        <RefreshButton />
      </PortfolioProvider>
    )
    await act(async () => {
      screen.getByText('Refresh').click()
    })

    expect(mockShouldTake).toHaveBeenCalled()
    expect(vi.mocked(createDailySnapshot)).toHaveBeenCalled()
    expect(mockStoreState.addSnapshot).toHaveBeenCalled()
  })
})

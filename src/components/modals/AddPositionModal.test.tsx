/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach } from 'vitest'

// Mock services
vi.mock('@/services', () => ({
  searchCoins: vi.fn().mockResolvedValue([]),
  searchStocks: vi.fn().mockResolvedValue([]),
  extractCurrencyCode: vi.fn((symbol: string) => {
    const match = symbol.match(/CASH_([A-Z]+)/)
    return match ? match[1] : symbol
  }),
  isCashAccountSlugTaken: vi.fn().mockReturnValue(false),
  toSlug: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
}))

// Mock currencies
vi.mock('@/lib/currencies', () => ({
  FIAT_CURRENCIES: [
    { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
    { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
    { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  ],
  COMMON_CURRENCY_CODES: ['USD', 'EUR', 'GBP'],
  FIAT_CURRENCY_MAP: {
    USD: { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
    EUR: { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
    GBP: { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  },
}))

// Mock utils
vi.mock('@/lib/utils', () => ({
  formatNumber: vi.fn((v: number) => v.toLocaleString()),
  formatCurrency: vi.fn((v: number) => `$${v.toLocaleString()}`),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cn: vi.fn((...args: any[]) => args.filter(Boolean).join(' ')),
}))

// Mock StockIcon
vi.mock('@/components/ui/StockIcon', () => ({
  default: ({ symbol }: { symbol: string }) => <span data-testid="stock-icon">{symbol}</span>,
}))

// Mock store state
const mockAddPosition = vi.fn()
const mockUpdatePrice = vi.fn()
const mockAddAccount = vi.fn().mockReturnValue('new-account-id')

let _accounts: { id: string; name: string; isActive: boolean; connection: { dataSource: string }; slug?: string; addedAt?: string }[] = []

const mockStoreState = {
  addPosition: mockAddPosition,
  updatePrice: mockUpdatePrice,
  addAccount: mockAddAccount,
  manualAccounts: () => _accounts.filter(a => a.connection.dataSource === 'manual'),
  brokerageAccounts: () => _accounts.filter(a => a.connection.dataSource === 'manual' && !a.slug),
  cashAccounts: () => _accounts.filter(a => a.connection.dataSource === 'manual' && a.slug),
  accounts: _accounts,
  positions: [] as unknown[],
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

// Mock useRefresh
const mockRefresh = vi.fn()
vi.mock('@/components/PortfolioProvider', () => ({
  useRefresh: () => ({
    refresh: mockRefresh,
    isRefreshing: false,
  }),
}))

import AddPositionModal from './AddPositionModal'

describe('AddPositionModal', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    _accounts = []
    mockStoreState.accounts = _accounts
    mockStoreState.positions = []
    mockAddAccount.mockReturnValue('new-account-id')
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <AddPositionModal isOpen={false} onClose={mockOnClose} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders with crypto tab by default', () => {
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} />)
    expect(screen.getByRole('heading', { name: 'Add Position' })).toBeInTheDocument()
    // Crypto tab should be active (has accent background)
    const cryptoButton = screen.getByRole('button', { name: 'Crypto' })
    expect(cryptoButton.className).toContain('accent-primary')
    // Search input should mention cryptocurrencies
    expect(screen.getByPlaceholderText('Search cryptocurrencies...')).toBeInTheDocument()
  })

  it('renders with specified defaultTab', () => {
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} defaultTab="manual" />)
    const manualButton = screen.getByRole('button', { name: 'Manual' })
    expect(manualButton.className).toContain('accent-primary')
    // Manual tab shows symbol and name inputs
    expect(screen.getByPlaceholderText('e.g., GOLD')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g., Gold')).toBeInTheDocument()
  })

  it('switches tabs and resets form', async () => {
    const user = userEvent.setup()
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} />)

    // Click on Equity (stock) tab
    await user.click(screen.getByRole('button', { name: 'Equity' }))
    expect(screen.getByPlaceholderText('Search stocks...')).toBeInTheDocument()

    // Click on Cash tab
    await user.click(screen.getByRole('button', { name: 'Cash' }))
    // Cash tab should show currency picker button with USD as default
    expect(screen.getByText('USD')).toBeInTheDocument()

    // Click on Manual tab
    await user.click(screen.getByRole('button', { name: 'Manual' }))
    expect(screen.getByPlaceholderText('e.g., GOLD')).toBeInTheDocument()
  })

  it('cash tab shows currency picker with currencies', async () => {
    const user = userEvent.setup()
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} defaultTab="cash" />)

    // Click the currency button to open picker
    const currencyButton = screen.getByText('USD').closest('button')!
    await user.click(currencyButton)

    // Should show currency options
    expect(screen.getByPlaceholderText('Search currencies...')).toBeInTheDocument()
    // Currencies appear in the list (may appear multiple times: in common + full list)
    expect(screen.getAllByText('US Dollar').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Euro').length).toBeGreaterThan(0)
    expect(screen.getAllByText('British Pound').length).toBeGreaterThan(0)
  })

  it('submits crypto position and calls refresh', async () => {
    const { searchCoins } = await import('@/services')
    vi.mocked(searchCoins).mockResolvedValue([
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: 'https://example.com/btc.png' },
    ])

    const user = userEvent.setup()
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} />)

    // Type search query
    const searchInput = screen.getByPlaceholderText('Search cryptocurrencies...')
    await user.type(searchInput, 'bitcoin')

    // Wait for debounced search
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350))
    })

    // Select result
    await user.click(screen.getByText('Bitcoin'))

    // Fill amount
    const amountInput = screen.getByPlaceholderText('0.00')
    await user.type(amountInput, '1.5')

    // Submit
    await user.click(screen.getByRole('button', { name: 'Add Position' }))

    expect(mockAddPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'crypto',
        symbol: 'btc',
        name: 'Bitcoin',
        amount: 1.5,
      })
    )
    expect(mockRefresh).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('submits stock position and calls refresh', async () => {
    const { searchStocks } = await import('@/services')
    vi.mocked(searchStocks).mockReturnValue([
      { symbol: 'AAPL', description: 'Apple Inc' },
    ])

    const user = userEvent.setup()
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} defaultTab="stock" />)

    const searchInput = screen.getByPlaceholderText('Search stocks...')
    await user.type(searchInput, 'AAPL')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350))
    })

    await user.click(screen.getByText('Apple Inc'))

    // Fill amount - first matching "0.00" placeholder
    const amountInputs = screen.getAllByPlaceholderText('0.00')
    await user.type(amountInputs[0], '10')

    await user.click(screen.getByRole('button', { name: 'Add Position' }))

    expect(mockAddPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stock',
        symbol: 'AAPL',
        name: 'Apple Inc',
        amount: 10,
      })
    )
    expect(mockRefresh).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('submits cash position without calling refresh', async () => {
    _accounts = [{ id: 'ca1', name: 'Revolut', slug: 'revolut', isActive: true, connection: { dataSource: 'manual' } }]
    mockStoreState.accounts = _accounts

    const user = userEvent.setup()
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} defaultTab="cash" />)

    // The account should be auto-selected (only one)
    // Fill balance
    const balanceInput = screen.getByPlaceholderText('0.00')
    await user.type(balanceInput, '5000')

    await user.click(screen.getByRole('button', { name: 'Add Position' }))

    expect(mockAddPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cash',
        amount: 5000,
        costBasis: 5000,
        accountId: 'ca1',
      })
    )
    expect(mockUpdatePrice).toHaveBeenCalled()
    // Cash should NOT trigger refresh
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('closes modal on cancel', async () => {
    const user = userEvent.setup()
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('closes modal on backdrop click', async () => {
    const user = userEvent.setup()
    render(<AddPositionModal isOpen={true} onClose={mockOnClose} />)

    // Click on the backdrop (the outer div with modal-backdrop class)
    const backdrop = document.querySelector('.modal-backdrop')!
    await user.click(backdrop)
    expect(mockOnClose).toHaveBeenCalled()
  })
})

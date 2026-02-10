import { usePortfolioStore } from './portfolioStore'
import {
  makePosition,
  makeCryptoPosition,
  makeCashPosition,
  makeStockPosition,
  resetPositionCounter,
} from '@/__tests__/fixtures'

// Helper to get a clean initial state snapshot for resetting between tests
const getInitialState = () => ({
  positions: [],
  wallets: [],
  accounts: [],
  brokerageAccounts: [],
  cashAccounts: [],
  prices: {},
  customPrices: {},
  fxRates: {},
  transactions: [],
  snapshots: [],
  lastRefresh: null,
  isRefreshing: false,
  hideBalances: false,
  hideDust: false,
  riskFreeRate: 0.05,
})

beforeEach(() => {
  resetPositionCounter()
  usePortfolioStore.setState(getInitialState())
})

// ---------------------------------------------------------------------------
// Position CRUD (6 tests)
// ---------------------------------------------------------------------------
describe('Position CRUD', () => {
  it('addPosition generates id and timestamps automatically', () => {
    const { addPosition } = usePortfolioStore.getState()
    addPosition({ type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1 })

    const positions = usePortfolioStore.getState().positions
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBeTruthy()
    expect(positions[0].addedAt).toBeTruthy()
    expect(positions[0].updatedAt).toBeTruthy()
    expect(positions[0].symbol).toBe('BTC')
    expect(positions[0].amount).toBe(1)
  })

  it('addPosition respects explicit id when provided', () => {
    const { addPosition } = usePortfolioStore.getState()
    addPosition({ id: 'my-custom-id', type: 'stock', symbol: 'AAPL', name: 'Apple', amount: 10 })

    const positions = usePortfolioStore.getState().positions
    expect(positions[0].id).toBe('my-custom-id')
  })

  it('removePosition deletes by id', () => {
    usePortfolioStore.setState({
      positions: [makePosition({ id: 'a' }), makePosition({ id: 'b' })],
    })

    usePortfolioStore.getState().removePosition('a')
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['b'])
  })

  it('updatePosition applies partial fields and refreshes updatedAt', () => {
    usePortfolioStore.setState({
      positions: [makePosition({ id: 'u1', amount: 5, updatedAt: '2024-01-01T00:00:00Z' })],
    })

    usePortfolioStore.getState().updatePosition('u1', { amount: 10, name: 'Updated BTC' })

    const pos = usePortfolioStore.getState().positions[0]
    expect(pos.amount).toBe(10)
    expect(pos.name).toBe('Updated BTC')
    expect(pos.updatedAt).not.toBe('2024-01-01T00:00:00Z')
  })

  it('removing non-existent position does not crash or alter state', () => {
    usePortfolioStore.setState({ positions: [makePosition({ id: 'keep' })] })
    usePortfolioStore.getState().removePosition('nonexistent')
    expect(usePortfolioStore.getState().positions).toHaveLength(1)
  })

  it('positions maintain insertion order', () => {
    const { addPosition } = usePortfolioStore.getState()
    addPosition({ id: 'first', type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1 })
    addPosition({ id: 'second', type: 'crypto', symbol: 'ETH', name: 'Ethereum', amount: 2 })
    addPosition({ id: 'third', type: 'stock', symbol: 'AAPL', name: 'Apple', amount: 3 })

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['first', 'second', 'third'])
  })
})

// ---------------------------------------------------------------------------
// Wallet cascade (5 tests)
// ---------------------------------------------------------------------------
describe('Wallet cascade', () => {
  it('addWallet adds with auto-generated id and addedAt', () => {
    usePortfolioStore.getState().addWallet({
      address: '0xabc',
      name: 'My Wallet',
      chains: ['eth', 'bsc'],
    })

    const wallets = usePortfolioStore.getState().wallets
    expect(wallets).toHaveLength(1)
    expect(wallets[0].id).toBeTruthy()
    expect(wallets[0].addedAt).toBeTruthy()
    expect(wallets[0].address).toBe('0xabc')
    expect(wallets[0].chains).toEqual(['eth', 'bsc'])
  })

  it('removeWallet cascades: deletes positions matching walletAddress', () => {
    usePortfolioStore.setState({
      wallets: [{ id: 'w1', address: '0xabc', name: 'Wallet 1', chains: ['eth'], addedAt: '2024-01-01T00:00:00Z' }],
      positions: [
        makePosition({ id: 'p1', walletAddress: '0xabc' }),
        makePosition({ id: 'p2', walletAddress: '0xdef' }),
      ],
    })

    usePortfolioStore.getState().removeWallet('w1')

    expect(usePortfolioStore.getState().wallets).toHaveLength(0)
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['p2'])
  })

  it('removeWallet preserves positions from other wallets', () => {
    usePortfolioStore.setState({
      wallets: [
        { id: 'w1', address: '0xaaa', name: 'W1', chains: ['eth'], addedAt: '2024-01-01T00:00:00Z' },
        { id: 'w2', address: '0xbbb', name: 'W2', chains: ['eth'], addedAt: '2024-01-01T00:00:00Z' },
      ],
      positions: [
        makePosition({ id: 'p1', walletAddress: '0xaaa' }),
        makePosition({ id: 'p2', walletAddress: '0xbbb' }),
        makePosition({ id: 'p3' }), // manual, no wallet
      ],
    })

    usePortfolioStore.getState().removeWallet('w1')

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['p2', 'p3'])
    expect(usePortfolioStore.getState().wallets).toHaveLength(1)
  })

  it('updateWallet updates fields', () => {
    usePortfolioStore.setState({
      wallets: [{ id: 'w1', address: '0xabc', name: 'Old', chains: ['eth'], addedAt: '2024-01-01T00:00:00Z' }],
    })

    usePortfolioStore.getState().updateWallet('w1', { name: 'New Name', chains: ['eth', 'arb'] })

    const w = usePortfolioStore.getState().wallets[0]
    expect(w.name).toBe('New Name')
    expect(w.chains).toEqual(['eth', 'arb'])
  })

  it('removeWallet with 3 linked positions removes all 3', () => {
    usePortfolioStore.setState({
      wallets: [{ id: 'w1', address: '0xabc', name: 'W1', chains: ['eth'], addedAt: '2024-01-01T00:00:00Z' }],
      positions: [
        makePosition({ id: 'wp1', walletAddress: '0xabc', symbol: 'ETH' }),
        makePosition({ id: 'wp2', walletAddress: '0xabc', symbol: 'USDC' }),
        makePosition({ id: 'wp3', walletAddress: '0xabc', symbol: 'LINK' }),
        makePosition({ id: 'manual1' }), // no walletAddress
      ],
    })

    usePortfolioStore.getState().removeWallet('w1')

    const positions = usePortfolioStore.getState().positions
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBe('manual1')
  })
})

// ---------------------------------------------------------------------------
// CEX Account cascade (4 tests)
// ---------------------------------------------------------------------------
describe('CEX Account cascade', () => {
  it('addAccount adds with auto-generated id', () => {
    usePortfolioStore.getState().addAccount({
      exchange: 'binance',
      name: 'My Binance',
      apiKey: 'key123',
      apiSecret: 'secret123',
      isActive: true,
    })

    const accounts = usePortfolioStore.getState().accounts
    expect(accounts).toHaveLength(1)
    expect(accounts[0].id).toBeTruthy()
    expect(accounts[0].exchange).toBe('binance')
    expect(accounts[0].addedAt).toBeTruthy()
  })

  it('removeAccount cascades: deletes positions with matching cex protocol', () => {
    const accId = 'cex-acc-1'
    usePortfolioStore.setState({
      accounts: [{
        id: accId,
        exchange: 'binance' as const,
        name: 'Binance',
        apiKey: 'k',
        apiSecret: 's',
        isActive: true,
        addedAt: '2024-01-01T00:00:00Z',
      }],
      positions: [
        makePosition({ id: 'cp1', protocol: `cex:binance:${accId}` }),
        makePosition({ id: 'cp2', protocol: `cex:binance:${accId}` }),
        makePosition({ id: 'manual1' }),
      ],
    })

    usePortfolioStore.getState().removeAccount(accId)

    expect(usePortfolioStore.getState().accounts).toHaveLength(0)
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['manual1'])
  })

  it('selective cascade: only removes matching protocol, preserves others', () => {
    usePortfolioStore.setState({
      accounts: [
        { id: 'a1', exchange: 'binance' as const, name: 'B1', apiKey: 'k', apiSecret: 's', isActive: true, addedAt: '2024-01-01T00:00:00Z' },
        { id: 'a2', exchange: 'coinbase' as const, name: 'C1', apiKey: 'k', apiSecret: 's', isActive: true, addedAt: '2024-01-01T00:00:00Z' },
      ],
      positions: [
        makePosition({ id: 'p1', protocol: 'cex:binance:a1' }),
        makePosition({ id: 'p2', protocol: 'cex:coinbase:a2' }),
        makePosition({ id: 'p3' }), // manual
      ],
    })

    usePortfolioStore.getState().removeAccount('a1')

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['p2', 'p3'])
    expect(usePortfolioStore.getState().accounts).toHaveLength(1)
    expect(usePortfolioStore.getState().accounts[0].id).toBe('a2')
  })

  it('updateAccount updates fields', () => {
    usePortfolioStore.setState({
      accounts: [{
        id: 'a1',
        exchange: 'binance' as const,
        name: 'Old Name',
        apiKey: 'k',
        apiSecret: 's',
        isActive: true,
        addedAt: '2024-01-01T00:00:00Z',
      }],
    })

    usePortfolioStore.getState().updateAccount('a1', { name: 'New Name', isActive: false })

    const acc = usePortfolioStore.getState().accounts[0]
    expect(acc.name).toBe('New Name')
    expect(acc.isActive).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Brokerage Account cascade (3 tests)
// ---------------------------------------------------------------------------
describe('Brokerage Account cascade', () => {
  it('addBrokerageAccount adds with auto-generated id', () => {
    usePortfolioStore.getState().addBrokerageAccount({ name: 'Revolut', isActive: true })

    const accounts = usePortfolioStore.getState().brokerageAccounts
    expect(accounts).toHaveLength(1)
    expect(accounts[0].id).toBeTruthy()
    expect(accounts[0].name).toBe('Revolut')
    expect(accounts[0].addedAt).toBeTruthy()
  })

  it('removeBrokerageAccount cascades: deletes positions with matching brokerage protocol', () => {
    const brokerageId = 'brok-1'
    usePortfolioStore.setState({
      brokerageAccounts: [{ id: brokerageId, name: 'IBKR', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
      positions: [
        makeStockPosition({ id: 'bp1', protocol: `brokerage:${brokerageId}` }),
        makeStockPosition({ id: 'bp2', protocol: `brokerage:${brokerageId}` }),
        makePosition({ id: 'manual1' }),
      ],
    })

    usePortfolioStore.getState().removeBrokerageAccount(brokerageId)

    expect(usePortfolioStore.getState().brokerageAccounts).toHaveLength(0)
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['manual1'])
  })

  it('selective: only removes matching brokerage positions', () => {
    usePortfolioStore.setState({
      brokerageAccounts: [
        { id: 'b1', name: 'Revolut', isActive: true, addedAt: '2024-01-01T00:00:00Z' },
        { id: 'b2', name: 'IBKR', isActive: true, addedAt: '2024-01-01T00:00:00Z' },
      ],
      positions: [
        makeStockPosition({ id: 'p1', protocol: 'brokerage:b1' }),
        makeStockPosition({ id: 'p2', protocol: 'brokerage:b2' }),
        makeCryptoPosition({ id: 'p3' }),
      ],
    })

    usePortfolioStore.getState().removeBrokerageAccount('b1')

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['p2', 'p3'])
    expect(usePortfolioStore.getState().brokerageAccounts).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Cash Account (6 tests)
// ---------------------------------------------------------------------------
describe('Cash Account', () => {
  it('addCashAccount generates auto-slug from name', () => {
    const id = usePortfolioStore.getState().addCashAccount({ name: 'My Bank', isActive: true })

    const accounts = usePortfolioStore.getState().cashAccounts
    expect(accounts).toHaveLength(1)
    expect(accounts[0].slug).toBe('my-bank')
    expect(accounts[0].name).toBe('My Bank')
    expect(accounts[0].id).toBe(id)
    expect(accounts[0].addedAt).toBeTruthy()
  })

  it('addCashAccount with duplicate slug returns existing id (merge)', () => {
    const id1 = usePortfolioStore.getState().addCashAccount({ name: 'Revolut', isActive: true })
    const id2 = usePortfolioStore.getState().addCashAccount({ name: 'revolut', isActive: true })

    expect(id1).toBe(id2)
    expect(usePortfolioStore.getState().cashAccounts).toHaveLength(1)
  })

  it('removeCashAccount cascades: deletes positions with matching cash-account protocol', () => {
    const cashId = 'cash-1'
    usePortfolioStore.setState({
      cashAccounts: [{ id: cashId, slug: 'revolut', name: 'Revolut', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
      positions: [
        makeCashPosition({ id: 'cp1', protocol: `cash-account:${cashId}` }),
        makeCashPosition({ id: 'cp2', protocol: `cash-account:${cashId}` }),
        makePosition({ id: 'other1' }),
      ],
    })

    usePortfolioStore.getState().removeCashAccount(cashId)

    expect(usePortfolioStore.getState().cashAccounts).toHaveLength(0)
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['other1'])
  })

  it('cash account slug is immutable via updateCashAccount', () => {
    usePortfolioStore.setState({
      cashAccounts: [{ id: 'c1', slug: 'revolut', name: 'Revolut', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
    })

    // Attempt to change slug through update
    usePortfolioStore.getState().updateCashAccount('c1', { slug: 'hacked-slug', name: 'Updated' } as never)

    const acc = usePortfolioStore.getState().cashAccounts[0]
    expect(acc.slug).toBe('revolut') // slug unchanged
    expect(acc.name).toBe('Updated') // name changed
  })

  it('cash account name is updatable', () => {
    usePortfolioStore.setState({
      cashAccounts: [{ id: 'c1', slug: 'revolut', name: 'Revolut', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
    })

    usePortfolioStore.getState().updateCashAccount('c1', { name: 'Revolut EUR' })

    expect(usePortfolioStore.getState().cashAccounts[0].name).toBe('Revolut EUR')
  })

  it('updateCashAccount applies partial updates', () => {
    usePortfolioStore.setState({
      cashAccounts: [{ id: 'c1', slug: 'revolut', name: 'Revolut', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
    })

    usePortfolioStore.getState().updateCashAccount('c1', { isActive: false })

    const acc = usePortfolioStore.getState().cashAccounts[0]
    expect(acc.isActive).toBe(false)
    expect(acc.name).toBe('Revolut')
  })
})

// ---------------------------------------------------------------------------
// setWalletPositions (4 tests)
// ---------------------------------------------------------------------------
describe('setWalletPositions', () => {
  it('replaces all wallet positions', () => {
    usePortfolioStore.setState({
      positions: [
        makePosition({ id: 'old-w', walletAddress: '0xabc', symbol: 'ETH' }),
      ],
    })

    const newWalletPos = makePosition({ id: 'new-w', walletAddress: '0xabc', symbol: 'BTC' })
    usePortfolioStore.getState().setWalletPositions([newWalletPos])

    const positions = usePortfolioStore.getState().positions
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBe('new-w')
  })

  it('preserves manually-added positions (no walletAddress)', () => {
    const manual = makePosition({ id: 'manual', symbol: 'GOLD' })
    usePortfolioStore.setState({
      positions: [
        manual,
        makePosition({ id: 'wallet-pos', walletAddress: '0xabc' }),
      ],
    })

    const newWalletPos = makePosition({ id: 'new-w', walletAddress: '0xdef' })
    usePortfolioStore.getState().setWalletPositions([newWalletPos])

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toContain('manual')
    expect(ids).toContain('new-w')
    expect(ids).not.toContain('wallet-pos')
  })

  it('preserves CEX positions (protocol starts with cex:)', () => {
    usePortfolioStore.setState({
      positions: [
        makePosition({ id: 'cex-pos', walletAddress: '0xabc', protocol: 'cex:binance:a1' }),
        makePosition({ id: 'wallet-pos', walletAddress: '0xdef' }),
      ],
    })

    usePortfolioStore.getState().setWalletPositions([])

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toContain('cex-pos')
    expect(ids).not.toContain('wallet-pos')
  })

  it('adds new wallet positions alongside preserved ones', () => {
    usePortfolioStore.setState({
      positions: [
        makePosition({ id: 'manual', symbol: 'GOLD' }),
        makePosition({ id: 'cex-pos', walletAddress: '0x1', protocol: 'cex:binance:a1' }),
      ],
    })

    const newPositions = [
      makePosition({ id: 'w1', walletAddress: '0xaaa' }),
      makePosition({ id: 'w2', walletAddress: '0xbbb' }),
    ]
    usePortfolioStore.getState().setWalletPositions(newPositions)

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['manual', 'cex-pos', 'w1', 'w2'])
  })
})

// ---------------------------------------------------------------------------
// setAccountPositions (3 tests)
// ---------------------------------------------------------------------------
describe('setAccountPositions', () => {
  it('replaces CEX positions only', () => {
    usePortfolioStore.setState({
      positions: [
        makePosition({ id: 'old-cex', protocol: 'cex:binance:a1' }),
      ],
    })

    const newCexPos = makePosition({ id: 'new-cex', protocol: 'cex:coinbase:a2' })
    usePortfolioStore.getState().setAccountPositions([newCexPos])

    const positions = usePortfolioStore.getState().positions
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBe('new-cex')
  })

  it('preserves wallet positions', () => {
    usePortfolioStore.setState({
      positions: [
        makePosition({ id: 'wallet-pos', walletAddress: '0xabc' }),
        makePosition({ id: 'cex-pos', protocol: 'cex:binance:a1' }),
      ],
    })

    usePortfolioStore.getState().setAccountPositions([])

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['wallet-pos'])
  })

  it('preserves manual positions', () => {
    usePortfolioStore.setState({
      positions: [
        makePosition({ id: 'manual', symbol: 'GOLD' }),
        makePosition({ id: 'cex-pos', protocol: 'cex:binance:a1' }),
      ],
    })

    const newCex = makePosition({ id: 'new-cex', protocol: 'cex:kraken:a3' })
    usePortfolioStore.getState().setAccountPositions([newCex])

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['manual', 'new-cex'])
  })
})

// ---------------------------------------------------------------------------
// Custom prices (3 tests)
// ---------------------------------------------------------------------------
describe('Custom prices', () => {
  it('setCustomPrice stores with lowercase key and includes setAt', () => {
    usePortfolioStore.getState().setCustomPrice('BTC', 99000, 'Manual OTC price')

    const customPrices = usePortfolioStore.getState().customPrices
    expect(customPrices['btc']).toBeDefined()
    expect(customPrices['btc'].price).toBe(99000)
    expect(customPrices['btc'].note).toBe('Manual OTC price')
    expect(customPrices['btc'].setAt).toBeTruthy()
    // Uppercase key should not exist
    expect(customPrices['BTC']).toBeUndefined()
  })

  it('removeCustomPrice removes the entry', () => {
    usePortfolioStore.getState().setCustomPrice('ETH', 3000)
    usePortfolioStore.getState().removeCustomPrice('ETH')

    expect(usePortfolioStore.getState().customPrices['eth']).toBeUndefined()
  })

  it('custom price includes setAt timestamp', () => {
    const before = new Date().toISOString()
    usePortfolioStore.getState().setCustomPrice('SOL', 150)
    const after = new Date().toISOString()

    const setAt = usePortfolioStore.getState().customPrices['sol'].setAt
    expect(setAt >= before).toBe(true)
    expect(setAt <= after).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// FX rates (2 tests)
// ---------------------------------------------------------------------------
describe('FX rates', () => {
  it('setFxRates stores rates', () => {
    usePortfolioStore.getState().setFxRates({ CHF: 1.12, EUR: 1.08 })

    const rates = usePortfolioStore.getState().fxRates
    expect(rates.CHF).toBe(1.12)
    expect(rates.EUR).toBe(1.08)
  })

  it('setFxRates overrides existing rates completely', () => {
    usePortfolioStore.getState().setFxRates({ CHF: 1.12 })
    usePortfolioStore.getState().setFxRates({ CHF: 1.15, GBP: 1.27 })

    const rates = usePortfolioStore.getState().fxRates
    expect(rates.CHF).toBe(1.15)
    expect(rates.GBP).toBe(1.27)
    // Previous call fully replaced, so EUR should not exist
    expect(rates.EUR).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// clearAll (2 tests)
// ---------------------------------------------------------------------------
describe('clearAll', () => {
  it('resets positions, wallets, accounts to empty', () => {
    // Populate store with data
    usePortfolioStore.setState({
      positions: [makePosition()],
      wallets: [{ id: 'w1', address: '0x1', name: 'W', chains: ['eth'], addedAt: '2024-01-01T00:00:00Z' }],
      accounts: [{ id: 'a1', exchange: 'binance' as const, name: 'B', apiKey: 'k', apiSecret: 's', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
      brokerageAccounts: [{ id: 'b1', name: 'R', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
      cashAccounts: [{ id: 'c1', slug: 'revolut', name: 'Revolut', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
      customPrices: { btc: { price: 99000, setAt: '2024-01-01T00:00:00Z' } },
      transactions: [{ id: 'tx1', type: 'buy' as const, symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' as const, amount: 1, pricePerUnit: 50000, totalValue: 50000, positionId: 'p1', date: '2024-01-01', createdAt: '2024-01-01T00:00:00Z' }],
      snapshots: [{ id: 's1', date: '2024-01-01', totalValue: 100000, cryptoValue: 60000, stockValue: 30000, cashValue: 8000, manualValue: 2000 }],
      lastRefresh: '2024-06-01T00:00:00Z',
      isRefreshing: true,
    })

    usePortfolioStore.getState().clearAll()

    const state = usePortfolioStore.getState()
    expect(state.positions).toEqual([])
    expect(state.wallets).toEqual([])
    expect(state.accounts).toEqual([])
    expect(state.brokerageAccounts).toEqual([])
    expect(state.cashAccounts).toEqual([])
    expect(state.customPrices).toEqual({})
    expect(state.transactions).toEqual([])
    expect(state.snapshots).toEqual([])
    expect(state.lastRefresh).toBeNull()
    expect(state.isRefreshing).toBe(false)
  })

  it('keeps structural defaults (hideBalances, hideDust, riskFreeRate, fxRates)', () => {
    usePortfolioStore.setState({
      hideBalances: true,
      hideDust: true,
      riskFreeRate: 0.03,
      fxRates: { CHF: 1.12 },
    })

    usePortfolioStore.getState().clearAll()

    const state = usePortfolioStore.getState()
    // clearAll does not reset these UI/settings fields
    expect(state.hideBalances).toBe(true)
    expect(state.hideDust).toBe(true)
    expect(state.riskFreeRate).toBe(0.03)
    // fxRates are NOT in the clearAll reset list
    expect(state.fxRates).toEqual({ CHF: 1.12 })
  })
})

// ---------------------------------------------------------------------------
// UI state (3 tests)
// ---------------------------------------------------------------------------
describe('UI state', () => {
  it('toggleHideBalances toggles the flag', () => {
    expect(usePortfolioStore.getState().hideBalances).toBe(false)
    usePortfolioStore.getState().toggleHideBalances()
    expect(usePortfolioStore.getState().hideBalances).toBe(true)
    usePortfolioStore.getState().toggleHideBalances()
    expect(usePortfolioStore.getState().hideBalances).toBe(false)
  })

  it('toggleHideDust toggles the flag', () => {
    expect(usePortfolioStore.getState().hideDust).toBe(false)
    usePortfolioStore.getState().toggleHideDust()
    expect(usePortfolioStore.getState().hideDust).toBe(true)
    usePortfolioStore.getState().toggleHideDust()
    expect(usePortfolioStore.getState().hideDust).toBe(false)
  })

  it('setRiskFreeRate updates the rate', () => {
    expect(usePortfolioStore.getState().riskFreeRate).toBe(0.05)
    usePortfolioStore.getState().setRiskFreeRate(0.04)
    expect(usePortfolioStore.getState().riskFreeRate).toBe(0.04)
  })
})

// ---------------------------------------------------------------------------
// Additional coverage: Snapshots, Prices, Refresh, Transactions
// ---------------------------------------------------------------------------
describe('Snapshots', () => {
  it('addSnapshot adds with auto-generated id', () => {
    usePortfolioStore.getState().addSnapshot({
      date: '2024-06-01',
      totalValue: 150000,
      cryptoValue: 90000,
      stockValue: 40000,
      cashValue: 15000,
      manualValue: 5000,
    })

    const snapshots = usePortfolioStore.getState().snapshots
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].id).toBeTruthy()
    expect(snapshots[0].totalValue).toBe(150000)
  })
})

describe('Price actions', () => {
  it('setPrices replaces all prices', () => {
    usePortfolioStore.getState().setPrices({
      btc: { symbol: 'btc', price: 50000, change24h: 500, changePercent24h: 1, lastUpdated: '2024-01-01T00:00:00Z' },
    })

    expect(usePortfolioStore.getState().prices['btc'].price).toBe(50000)
  })

  it('updatePrice stores with lowercase key', () => {
    usePortfolioStore.getState().updatePrice('BTC', {
      symbol: 'BTC',
      price: 51000,
      change24h: 1000,
      changePercent24h: 2,
      lastUpdated: '2024-01-01T00:00:00Z',
    })

    expect(usePortfolioStore.getState().prices['btc'].price).toBe(51000)
    expect(usePortfolioStore.getState().prices['BTC']).toBeUndefined()
  })
})

describe('Refresh state', () => {
  it('setRefreshing updates isRefreshing', () => {
    usePortfolioStore.getState().setRefreshing(true)
    expect(usePortfolioStore.getState().isRefreshing).toBe(true)
    usePortfolioStore.getState().setRefreshing(false)
    expect(usePortfolioStore.getState().isRefreshing).toBe(false)
  })

  it('setLastRefresh updates timestamp', () => {
    const ts = '2024-06-15T12:00:00Z'
    usePortfolioStore.getState().setLastRefresh(ts)
    expect(usePortfolioStore.getState().lastRefresh).toBe(ts)
  })
})

describe('Transaction actions', () => {
  it('addTransaction adds with auto-generated id and createdAt', () => {
    usePortfolioStore.getState().addTransaction({
      type: 'buy',
      symbol: 'BTC',
      name: 'Bitcoin',
      assetType: 'crypto',
      amount: 0.5,
      pricePerUnit: 50000,
      totalValue: 25000,
      positionId: 'p1',
      date: '2024-06-01',
    })

    const txs = usePortfolioStore.getState().transactions
    expect(txs).toHaveLength(1)
    expect(txs[0].id).toBeTruthy()
    expect(txs[0].createdAt).toBeTruthy()
    expect(txs[0].amount).toBe(0.5)
  })

  it('getTransactionsBySymbol filters case-insensitively', () => {
    usePortfolioStore.setState({
      transactions: [
        { id: 'tx1', type: 'buy' as const, symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' as const, amount: 1, pricePerUnit: 50000, totalValue: 50000, positionId: 'p1', date: '2024-01-01', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'tx2', type: 'buy' as const, symbol: 'ETH', name: 'Ethereum', assetType: 'crypto' as const, amount: 10, pricePerUnit: 3000, totalValue: 30000, positionId: 'p2', date: '2024-01-01', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'tx3', type: 'sell' as const, symbol: 'btc', name: 'Bitcoin', assetType: 'crypto' as const, amount: 0.5, pricePerUnit: 55000, totalValue: 27500, positionId: 'p1', date: '2024-02-01', createdAt: '2024-02-01T00:00:00Z' },
      ],
    })

    const btcTxs = usePortfolioStore.getState().getTransactionsBySymbol('btc')
    expect(btcTxs).toHaveLength(2)
  })

  it('getTransactionsByPosition filters by positionId', () => {
    usePortfolioStore.setState({
      transactions: [
        { id: 'tx1', type: 'buy' as const, symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' as const, amount: 1, pricePerUnit: 50000, totalValue: 50000, positionId: 'p1', date: '2024-01-01', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'tx2', type: 'buy' as const, symbol: 'ETH', name: 'Ethereum', assetType: 'crypto' as const, amount: 10, pricePerUnit: 3000, totalValue: 30000, positionId: 'p2', date: '2024-01-01', createdAt: '2024-01-01T00:00:00Z' },
      ],
    })

    const p1Txs = usePortfolioStore.getState().getTransactionsByPosition('p1')
    expect(p1Txs).toHaveLength(1)
    expect(p1Txs[0].symbol).toBe('BTC')
  })
})

describe('Brokerage Account updateBrokerageAccount', () => {
  it('updates brokerage account fields', () => {
    usePortfolioStore.setState({
      brokerageAccounts: [{ id: 'b1', name: 'Revolut', isActive: true, addedAt: '2024-01-01T00:00:00Z' }],
    })

    usePortfolioStore.getState().updateBrokerageAccount('b1', { name: 'IBKR', isActive: false })

    const acc = usePortfolioStore.getState().brokerageAccounts[0]
    expect(acc.name).toBe('IBKR')
    expect(acc.isActive).toBe(false)
  })
})

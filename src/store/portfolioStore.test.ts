import { usePortfolioStore } from './portfolioStore'
import {
  makePosition,
  makeCryptoPosition,
  makeCashPosition,
  makeStockPosition,
  resetPositionCounter,
} from '@/__tests__/fixtures'
import type { Account, PerpExchange } from '@/types'

// Helper to make Account objects for tests
function makeWalletAccount(overrides: Partial<Account> & { address: string; chains?: string[]; perpExchanges?: PerpExchange[] }): Account {
  return {
    id: overrides.id || 'w1',
    name: overrides.name || 'Wallet',
    isActive: true,
    connection: {
      dataSource: 'debank',
      address: overrides.address,
      chains: overrides.chains || ['eth'],
      perpExchanges: overrides.perpExchanges,
    },
    addedAt: overrides.addedAt || '2024-01-01T00:00:00Z',
    ...('slug' in overrides ? { slug: overrides.slug } : {}),
  }
}

function makeCexAccount(overrides: Partial<Account> & { exchange?: string; apiKey?: string; apiSecret?: string }): Account {
  return {
    id: overrides.id || 'a1',
    name: overrides.name || 'CEX',
    isActive: overrides.isActive ?? true,
    connection: {
      dataSource: (overrides.exchange || 'binance') as 'binance',
      apiKey: overrides.apiKey || 'k',
      apiSecret: overrides.apiSecret || 's',
    },
    addedAt: overrides.addedAt || '2024-01-01T00:00:00Z',
  }
}

function makeManualAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: overrides.id || 'b1',
    name: overrides.name || 'Brokerage',
    isActive: overrides.isActive ?? true,
    connection: { dataSource: 'manual' },
    addedAt: overrides.addedAt || '2024-01-01T00:00:00Z',
    ...('slug' in overrides ? { slug: overrides.slug } : {}),
  }
}

function makeCashAccountObj(overrides: Partial<Account> & { slug?: string } = {}): Account {
  return {
    id: overrides.id || 'c1',
    name: overrides.name || 'Revolut',
    isActive: overrides.isActive ?? true,
    connection: { dataSource: 'manual' },
    slug: overrides.slug || 'revolut',
    addedAt: overrides.addedAt || '2024-01-01T00:00:00Z',
  }
}

// Helper to get a clean initial state snapshot for resetting between tests
const getInitialState = () => ({
  positions: [],
  accounts: [],
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
    addPosition({ assetClass: 'crypto', type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1 })

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
    addPosition({ id: 'my-custom-id', assetClass: 'equity', type: 'stock', symbol: 'AAPL', name: 'Apple', amount: 10, equityType: 'stock' })

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
    addPosition({ id: 'first', assetClass: 'crypto', type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1 })
    addPosition({ id: 'second', assetClass: 'crypto', type: 'crypto', symbol: 'ETH', name: 'Ethereum', amount: 2 })
    addPosition({ id: 'third', assetClass: 'equity', type: 'stock', symbol: 'AAPL', name: 'Apple', amount: 3, equityType: 'stock' })

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['first', 'second', 'third'])
  })
})

// ---------------------------------------------------------------------------
// Wallet cascade (5 tests)
// ---------------------------------------------------------------------------
describe('Wallet cascade', () => {
  it('addAccount adds wallet with auto-generated id and addedAt', () => {
    usePortfolioStore.getState().addAccount({
      name: 'My Wallet',
      isActive: true,
      connection: {
        dataSource: 'debank',
        address: '0xabc',
        chains: ['eth', 'bsc'],
      },
    })

    const wallets = usePortfolioStore.getState().wallets()
    expect(wallets).toHaveLength(1)
    expect(wallets[0].id).toBeTruthy()
    expect(wallets[0].addedAt).toBeTruthy()
    expect((wallets[0].connection as { address: string }).address).toBe('0xabc')
    expect((wallets[0].connection as { chains: string[] }).chains).toEqual(['eth', 'bsc'])
  })

  it('removeAccount cascades: deletes positions matching accountId', () => {
    usePortfolioStore.setState({
      accounts: [makeWalletAccount({ id: 'w1', address: '0xabc', name: 'Wallet 1', chains: ['eth'] })],
      positions: [
        makePosition({ id: 'p1', accountId: 'w1' }),
        makePosition({ id: 'p2', accountId: 'w2' }),
      ],
    })

    usePortfolioStore.getState().removeAccount('w1')

    expect(usePortfolioStore.getState().wallets()).toHaveLength(0)
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['p2'])
  })

  it('removeAccount preserves positions from other wallets', () => {
    usePortfolioStore.setState({
      accounts: [
        makeWalletAccount({ id: 'w1', address: '0xaaa', name: 'W1', chains: ['eth'] }),
        makeWalletAccount({ id: 'w2', address: '0xbbb', name: 'W2', chains: ['eth'] }),
      ],
      positions: [
        makePosition({ id: 'p1', accountId: 'w1' }),
        makePosition({ id: 'p2', accountId: 'w2' }),
        makePosition({ id: 'p3' }), // manual, no wallet
      ],
    })

    usePortfolioStore.getState().removeAccount('w1')

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['p2', 'p3'])
    expect(usePortfolioStore.getState().wallets()).toHaveLength(1)
  })

  it('updateAccount updates fields', () => {
    usePortfolioStore.setState({
      accounts: [makeWalletAccount({ id: 'w1', address: '0xabc', name: 'Old', chains: ['eth'] })],
    })

    usePortfolioStore.getState().updateAccount('w1', { name: 'New Name' })

    const w = usePortfolioStore.getState().wallets()[0]
    expect(w.name).toBe('New Name')
  })

  it('removeAccount with 3 linked positions removes all 3', () => {
    usePortfolioStore.setState({
      accounts: [makeWalletAccount({ id: 'w1', address: '0xabc', name: 'W1', chains: ['eth'] })],
      positions: [
        makePosition({ id: 'wp1', accountId: 'w1', symbol: 'ETH' }),
        makePosition({ id: 'wp2', accountId: 'w1', symbol: 'USDC' }),
        makePosition({ id: 'wp3', accountId: 'w1', symbol: 'LINK' }),
        makePosition({ id: 'manual1' }), // no accountId
      ],
    })

    usePortfolioStore.getState().removeAccount('w1')

    const positions = usePortfolioStore.getState().positions
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBe('manual1')
  })
})

// ---------------------------------------------------------------------------
// CEX Account cascade (4 tests)
// ---------------------------------------------------------------------------
describe('CEX Account cascade', () => {
  it('addAccount adds CEX account with auto-generated id', () => {
    usePortfolioStore.getState().addAccount({
      name: 'My Binance',
      isActive: true,
      connection: {
        dataSource: 'binance',
        apiKey: 'key123',
        apiSecret: 'secret123',
      },
    })

    const cexAccounts = usePortfolioStore.getState().cexAccounts()
    expect(cexAccounts).toHaveLength(1)
    expect(cexAccounts[0].id).toBeTruthy()
    expect((cexAccounts[0].connection as { dataSource: string }).dataSource).toBe('binance')
    expect(cexAccounts[0].addedAt).toBeTruthy()
  })

  it('removeAccount cascades: deletes positions with matching accountId', () => {
    const accId = 'cex-acc-1'
    usePortfolioStore.setState({
      accounts: [makeCexAccount({ id: accId, name: 'Binance', exchange: 'binance' })],
      positions: [
        makePosition({ id: 'cp1', accountId: accId }),
        makePosition({ id: 'cp2', accountId: accId }),
        makePosition({ id: 'manual1' }),
      ],
    })

    usePortfolioStore.getState().removeAccount(accId)

    expect(usePortfolioStore.getState().cexAccounts()).toHaveLength(0)
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['manual1'])
  })

  it('selective cascade: only removes matching accountId, preserves others', () => {
    usePortfolioStore.setState({
      accounts: [
        makeCexAccount({ id: 'a1', name: 'B1', exchange: 'binance' }),
        makeCexAccount({ id: 'a2', name: 'C1', exchange: 'coinbase' }),
      ],
      positions: [
        makePosition({ id: 'p1', accountId: 'a1' }),
        makePosition({ id: 'p2', accountId: 'a2' }),
        makePosition({ id: 'p3' }), // manual
      ],
    })

    usePortfolioStore.getState().removeAccount('a1')

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['p2', 'p3'])
    expect(usePortfolioStore.getState().cexAccounts()).toHaveLength(1)
    expect(usePortfolioStore.getState().cexAccounts()[0].id).toBe('a2')
  })

  it('updateAccount updates fields', () => {
    usePortfolioStore.setState({
      accounts: [makeCexAccount({ id: 'a1', name: 'Old Name', exchange: 'binance' })],
    })

    usePortfolioStore.getState().updateAccount('a1', { name: 'New Name', isActive: false })

    const acc = usePortfolioStore.getState().cexAccounts()[0]
    expect(acc.name).toBe('New Name')
    expect(acc.isActive).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Brokerage Account cascade (3 tests)
// ---------------------------------------------------------------------------
describe('Brokerage Account cascade', () => {
  it('addAccount with manual connection adds with auto-generated id', () => {
    usePortfolioStore.getState().addAccount({ name: 'Revolut', isActive: true, connection: { dataSource: 'manual' } })

    const accounts = usePortfolioStore.getState().manualAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].id).toBeTruthy()
    expect(accounts[0].name).toBe('Revolut')
    expect(accounts[0].addedAt).toBeTruthy()
  })

  it('removeAccount cascades: deletes positions with matching accountId', () => {
    const brokerageId = 'brok-1'
    usePortfolioStore.setState({
      accounts: [makeManualAccount({ id: brokerageId, name: 'IBKR' })],
      positions: [
        makeStockPosition({ id: 'bp1', accountId: brokerageId }),
        makeStockPosition({ id: 'bp2', accountId: brokerageId }),
        makePosition({ id: 'manual1' }),
      ],
    })

    usePortfolioStore.getState().removeAccount(brokerageId)

    expect(usePortfolioStore.getState().manualAccounts()).toHaveLength(0)
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['manual1'])
  })

  it('selective: only removes matching brokerage positions', () => {
    usePortfolioStore.setState({
      accounts: [
        makeManualAccount({ id: 'b1', name: 'Revolut' }),
        makeManualAccount({ id: 'b2', name: 'IBKR' }),
      ],
      positions: [
        makeStockPosition({ id: 'p1', accountId: 'b1' }),
        makeStockPosition({ id: 'p2', accountId: 'b2' }),
        makeCryptoPosition({ id: 'p3' }),
      ],
    })

    usePortfolioStore.getState().removeAccount('b1')

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['p2', 'p3'])
    expect(usePortfolioStore.getState().manualAccounts()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Cash Account (6 tests)
// ---------------------------------------------------------------------------
describe('Cash Account', () => {
  it('addAccount with slug generates auto-slug from name', () => {
    const id = usePortfolioStore.getState().addAccount({ name: 'My Bank', isActive: true, connection: { dataSource: 'manual' }, slug: 'my-bank' })

    const accounts = usePortfolioStore.getState().accounts.filter(a => a.slug)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].slug).toBe('my-bank')
    expect(accounts[0].name).toBe('My Bank')
    expect(accounts[0].id).toBe(id)
    expect(accounts[0].addedAt).toBeTruthy()
  })

  it('addAccount with duplicate slug returns existing id (merge)', () => {
    const id1 = usePortfolioStore.getState().addAccount({ name: 'Revolut', isActive: true, connection: { dataSource: 'manual' }, slug: 'revolut' })
    const id2 = usePortfolioStore.getState().addAccount({ name: 'revolut', isActive: true, connection: { dataSource: 'manual' }, slug: 'revolut' })

    expect(id1).toBe(id2)
    expect(usePortfolioStore.getState().accounts.filter(a => a.slug)).toHaveLength(1)
  })

  it('removeAccount cascades: deletes positions with matching accountId', () => {
    const cashId = 'cash-1'
    usePortfolioStore.setState({
      accounts: [makeCashAccountObj({ id: cashId, slug: 'revolut', name: 'Revolut' })],
      positions: [
        makeCashPosition({ id: 'cp1', accountId: cashId }),
        makeCashPosition({ id: 'cp2', accountId: cashId }),
        makePosition({ id: 'other1' }),
      ],
    })

    usePortfolioStore.getState().removeAccount(cashId)

    expect(usePortfolioStore.getState().accounts.filter(a => a.slug)).toHaveLength(0)
    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['other1'])
  })

  it('cash account slug is immutable via updateAccount', () => {
    usePortfolioStore.setState({
      accounts: [makeCashAccountObj({ id: 'c1', slug: 'revolut', name: 'Revolut' })],
    })

    // Attempt to change slug through update
    usePortfolioStore.getState().updateAccount('c1', { slug: 'hacked-slug', name: 'Updated' } as never)

    const acc = usePortfolioStore.getState().accounts.find(a => a.slug)!
    expect(acc.slug).toBe('revolut') // slug unchanged
    expect(acc.name).toBe('Updated') // name changed
  })

  it('cash account name is updatable', () => {
    usePortfolioStore.setState({
      accounts: [makeCashAccountObj({ id: 'c1', slug: 'revolut', name: 'Revolut' })],
    })

    usePortfolioStore.getState().updateAccount('c1', { name: 'Revolut EUR' })

    expect(usePortfolioStore.getState().accounts.find(a => a.slug)!.name).toBe('Revolut EUR')
  })

  it('updateAccount applies partial updates', () => {
    usePortfolioStore.setState({
      accounts: [makeCashAccountObj({ id: 'c1', slug: 'revolut', name: 'Revolut' })],
    })

    usePortfolioStore.getState().updateAccount('c1', { isActive: false })

    const acc = usePortfolioStore.getState().accounts.find(a => a.slug)!
    expect(acc.isActive).toBe(false)
    expect(acc.name).toBe('Revolut')
  })
})

// ---------------------------------------------------------------------------
// setSyncedPositions for wallet accounts (4 tests)
// ---------------------------------------------------------------------------
describe('setSyncedPositions (wallet)', () => {
  it('replaces all wallet positions', () => {
    usePortfolioStore.setState({
      accounts: [makeWalletAccount({ id: 'w1', address: '0xabc', name: 'W1', chains: ['eth'] })],
      positions: [
        makePosition({ id: 'old-w', accountId: 'w1', symbol: 'ETH' }),
      ],
    })

    const newWalletPos = makePosition({ id: 'new-w', accountId: 'w1', symbol: 'BTC' })
    usePortfolioStore.getState().setSyncedPositions(['w1'], [newWalletPos])

    const positions = usePortfolioStore.getState().positions
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBe('new-w')
  })

  it('preserves manually-added positions (no accountId)', () => {
    const manual = makePosition({ id: 'manual', symbol: 'GOLD' })
    usePortfolioStore.setState({
      accounts: [makeWalletAccount({ id: 'w1', address: '0xabc', name: 'W1', chains: ['eth'] })],
      positions: [
        manual,
        makePosition({ id: 'wallet-pos', accountId: 'w1' }),
      ],
    })

    const newWalletPos = makePosition({ id: 'new-w', accountId: 'w1' })
    usePortfolioStore.getState().setSyncedPositions(['w1'], [newWalletPos])

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toContain('manual')
    expect(ids).toContain('new-w')
    expect(ids).not.toContain('wallet-pos')
  })

  it('preserves CEX positions (accountId linked to cex account)', () => {
    usePortfolioStore.setState({
      accounts: [
        makeWalletAccount({ id: 'w1', address: '0xabc', name: 'W1', chains: ['eth'] }),
        makeCexAccount({ id: 'a1', name: 'Binance', exchange: 'binance' }),
      ],
      positions: [
        makePosition({ id: 'cex-pos', accountId: 'a1' }),
        makePosition({ id: 'wallet-pos', accountId: 'w1' }),
      ],
    })

    usePortfolioStore.getState().setSyncedPositions(['w1'], [])

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toContain('cex-pos')
    expect(ids).not.toContain('wallet-pos')
  })

  it('adds new wallet positions alongside preserved ones', () => {
    usePortfolioStore.setState({
      accounts: [
        makeWalletAccount({ id: 'w1', address: '0xaaa', name: 'W1', chains: ['eth'] }),
        makeCexAccount({ id: 'a1', name: 'Binance', exchange: 'binance' }),
      ],
      positions: [
        makePosition({ id: 'manual', symbol: 'GOLD' }),
        makePosition({ id: 'cex-pos', accountId: 'a1' }),
      ],
    })

    const newPositions = [
      makePosition({ id: 'w1', accountId: 'w1' }),
      makePosition({ id: 'w2', accountId: 'w1' }),
    ]
    usePortfolioStore.getState().setSyncedPositions(['w1'], newPositions)

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['manual', 'cex-pos', 'w1', 'w2'])
  })
})

// ---------------------------------------------------------------------------
// setSyncedPositions for CEX accounts (3 tests)
// ---------------------------------------------------------------------------
describe('setSyncedPositions (CEX)', () => {
  it('replaces CEX positions only', () => {
    usePortfolioStore.setState({
      accounts: [
        makeCexAccount({ id: 'a1', name: 'B1', exchange: 'binance' }),
      ],
      positions: [
        makePosition({ id: 'old-cex', accountId: 'a1' }),
      ],
    })

    const newCexPos = makePosition({ id: 'new-cex', accountId: 'a1' })
    usePortfolioStore.getState().setSyncedPositions(['a1'], [newCexPos])

    const positions = usePortfolioStore.getState().positions
    expect(positions).toHaveLength(1)
    expect(positions[0].id).toBe('new-cex')
  })

  it('preserves wallet positions', () => {
    usePortfolioStore.setState({
      accounts: [
        makeWalletAccount({ id: 'w1', address: '0xabc', name: 'W1', chains: ['eth'] }),
        makeCexAccount({ id: 'a1', name: 'B1', exchange: 'binance' }),
      ],
      positions: [
        makePosition({ id: 'wallet-pos', accountId: 'w1' }),
        makePosition({ id: 'cex-pos', accountId: 'a1' }),
      ],
    })

    usePortfolioStore.getState().setSyncedPositions(['a1'], [])

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['wallet-pos'])
  })

  it('preserves manual positions', () => {
    usePortfolioStore.setState({
      accounts: [
        makeCexAccount({ id: 'a1', name: 'B1', exchange: 'binance' }),
      ],
      positions: [
        makePosition({ id: 'manual', symbol: 'GOLD' }),
        makePosition({ id: 'cex-pos', accountId: 'a1' }),
      ],
    })

    const newCex = makePosition({ id: 'new-cex', accountId: 'a1' })
    usePortfolioStore.getState().setSyncedPositions(['a1'], [newCex])

    const ids = usePortfolioStore.getState().positions.map((p) => p.id)
    expect(ids).toEqual(['manual', 'new-cex'])
  })
})

// ---------------------------------------------------------------------------
// setSyncedPositions: position integrity (prevents data loss)
// ---------------------------------------------------------------------------
describe('setSyncedPositions (position integrity)', () => {
  it('preserves debt positions from other accounts during wallet sync', () => {
    const debtPos = makePosition({
      id: 'debt-usdc',
      accountId: 'w2',
      symbol: 'USDC',
      isDebt: true,
      protocol: 'Morpho',
      amount: 100000,
    })
    usePortfolioStore.setState({
      accounts: [
        makeWalletAccount({ id: 'w1', address: '0xaaa', name: 'W1', chains: ['eth'] }),
        makeWalletAccount({ id: 'w2', address: '0xbbb', name: 'W2', chains: ['eth'] }),
      ],
      positions: [
        makePosition({ id: 'w1-pos', accountId: 'w1' }),
        debtPos,
      ],
    })

    // Sync only w1 — w2's debt must survive
    usePortfolioStore.getState().setSyncedPositions(
      ['w1'],
      [makePosition({ id: 'w1-new', accountId: 'w1' })],
    )

    const positions = usePortfolioStore.getState().positions
    const debtIds = positions.filter(p => p.isDebt).map(p => p.id)
    expect(debtIds).toContain('debt-usdc')
  })

  it('preserves positions from non-synced accounts in a multi-account portfolio', () => {
    // Simulate a real portfolio: 3 wallets, 1 CEX, 1 manual
    usePortfolioStore.setState({
      accounts: [
        makeWalletAccount({ id: 'w1', address: '0x1', name: 'Main', chains: ['eth'] }),
        makeWalletAccount({ id: 'w2', address: '0x2', name: 'DeFi', chains: ['arb'] }),
        makeWalletAccount({ id: 'w3', address: '0x3', name: 'Sol', chains: ['sol'] }),
        makeCexAccount({ id: 'cex1', name: 'Binance', exchange: 'binance' }),
        makeManualAccount({ id: 'manual1', name: 'Brokerage' }),
      ],
      positions: [
        makePosition({ id: 'w1-eth', accountId: 'w1', symbol: 'ETH' }),
        makePosition({ id: 'w2-arb', accountId: 'w2', symbol: 'ARB' }),
        makePosition({ id: 'w3-sol', accountId: 'w3', symbol: 'SOL' }),
        makePosition({ id: 'cex-btc', accountId: 'cex1', symbol: 'BTC' }),
        makePosition({ id: 'manual-aapl', accountId: 'manual1', symbol: 'AAPL' }),
        makePosition({ id: 'debt-1', accountId: 'w2', symbol: 'USDC', isDebt: true }),
      ],
    })

    // Sync only w1 — everything else must survive
    usePortfolioStore.getState().setSyncedPositions(
      ['w1'],
      [makePosition({ id: 'w1-eth-new', accountId: 'w1', symbol: 'ETH' })],
    )

    const ids = usePortfolioStore.getState().positions.map(p => p.id)
    expect(ids).toContain('w2-arb')
    expect(ids).toContain('w3-sol')
    expect(ids).toContain('cex-btc')
    expect(ids).toContain('manual-aapl')
    expect(ids).toContain('debt-1')
    expect(ids).toContain('w1-eth-new')
    expect(ids).not.toContain('w1-eth') // Old w1 position replaced
    expect(ids).toHaveLength(6) // 5 preserved + 1 new
  })

  it('never loses positions with no accountId during any sync', () => {
    const orphan = makePosition({ id: 'orphan', symbol: 'GOLD' })
    // Remove accountId to simulate a truly orphaned position
    delete (orphan as Record<string, unknown>).accountId

    usePortfolioStore.setState({
      accounts: [
        makeWalletAccount({ id: 'w1', address: '0x1', name: 'W1', chains: ['eth'] }),
      ],
      positions: [
        orphan,
        makePosition({ id: 'w1-pos', accountId: 'w1' }),
      ],
    })

    usePortfolioStore.getState().setSyncedPositions(['w1'], [])

    const ids = usePortfolioStore.getState().positions.map(p => p.id)
    expect(ids).toContain('orphan')
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
  it('resets positions and accounts to empty', () => {
    // Populate store with data
    usePortfolioStore.setState({
      positions: [makePosition()],
      accounts: [
        makeWalletAccount({ id: 'w1', address: '0x1', name: 'W', chains: ['eth'] }),
        makeCexAccount({ id: 'a1', name: 'B', exchange: 'binance' }),
        makeManualAccount({ id: 'b1', name: 'R' }),
        makeCashAccountObj({ id: 'c1', slug: 'revolut', name: 'Revolut' }),
      ],
      customPrices: { btc: { price: 99000, setAt: '2024-01-01T00:00:00Z' } },
      transactions: [{ id: 'tx1', type: 'buy' as const, symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' as const, amount: 1, pricePerUnit: 50000, totalValue: 50000, positionId: 'p1', date: '2024-01-01', createdAt: '2024-01-01T00:00:00Z' }],
      snapshots: [{ id: 's1', date: '2024-01-01', totalValue: 100000, cryptoValue: 60000, equityValue: 30000, cashValue: 8000, otherValue: 2000, stockValue: 30000, manualValue: 2000 }],
      lastRefresh: '2024-06-01T00:00:00Z',
      isRefreshing: true,
    })

    usePortfolioStore.getState().clearAll()

    const state = usePortfolioStore.getState()
    expect(state.positions).toEqual([])
    expect(state.accounts).toEqual([])
    expect(state.wallets()).toEqual([])
    expect(state.manualAccounts()).toEqual([])
    expect(state.cexAccounts()).toEqual([])
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
      equityValue: 40000,
      cashValue: 15000,
      otherValue: 5000,
      stockValue: 40000,
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

describe('Brokerage Account updateAccount', () => {
  it('updates brokerage account fields', () => {
    usePortfolioStore.setState({
      accounts: [makeManualAccount({ id: 'b1', name: 'Revolut' })],
    })

    usePortfolioStore.getState().updateAccount('b1', { name: 'IBKR', isActive: false })

    const acc = usePortfolioStore.getState().manualAccounts()[0]
    expect(acc.name).toBe('IBKR')
    expect(acc.isActive).toBe(false)
  })
})

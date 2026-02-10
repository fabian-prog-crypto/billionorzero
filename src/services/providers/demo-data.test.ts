import {
  generateDemoWalletTokens,
  generateDemoDefiPositions,
  getDemoTotalBalance,
  SUPPORTED_CHAINS,
  DEMO_STOCK_PRICES,
  DEMO_CRYPTO_PRICES,
} from './demo-data'

const TEST_ADDRESS = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'

describe('generateDemoWalletTokens', () => {
  it('returns an array of wallet tokens', () => {
    const tokens = generateDemoWalletTokens(TEST_ADDRESS)

    expect(tokens.length).toBeGreaterThan(0)
    for (const token of tokens) {
      expect(token).toHaveProperty('symbol')
      expect(token).toHaveProperty('name')
      expect(token).toHaveProperty('amount')
      expect(token).toHaveProperty('price')
      expect(token).toHaveProperty('value')
      expect(token).toHaveProperty('chain')
      expect(token.amount).toBeGreaterThan(0)
      expect(token.value).toBeGreaterThan(0)
    }
  })

  it('returns tokens sorted by value descending', () => {
    const tokens = generateDemoWalletTokens(TEST_ADDRESS)

    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i - 1].value).toBeGreaterThanOrEqual(tokens[i].value)
    }
  })
})

describe('generateDemoDefiPositions', () => {
  it('returns an array of DeFi positions with protocols', () => {
    const positions = generateDemoDefiPositions(TEST_ADDRESS)

    expect(positions.length).toBeGreaterThan(0)
    for (const pos of positions) {
      expect(pos).toHaveProperty('protocol')
      expect(pos).toHaveProperty('chain')
      expect(pos).toHaveProperty('type')
      expect(pos).toHaveProperty('value')
      expect(pos).toHaveProperty('tokens')
      expect(pos.value).toBeGreaterThan(0)
      expect(pos.tokens.length).toBeGreaterThan(0)
    }
  })
})

describe('getDemoTotalBalance', () => {
  it('returns a positive number', () => {
    const balance = getDemoTotalBalance(TEST_ADDRESS)
    expect(balance).toBeGreaterThan(0)
  })

  it('equals the sum of token values plus position values', () => {
    const tokens = generateDemoWalletTokens(TEST_ADDRESS)
    const positions = generateDemoDefiPositions(TEST_ADDRESS)

    const tokenTotal = tokens.reduce((sum, t) => sum + t.value, 0)
    const positionTotal = positions.reduce((sum, p) => sum + p.value, 0)

    expect(getDemoTotalBalance(TEST_ADDRESS)).toBeCloseTo(
      tokenTotal + positionTotal,
      5
    )
  })
})

describe('deterministic output', () => {
  it('same address always produces same tokens and positions', () => {
    const tokens1 = generateDemoWalletTokens(TEST_ADDRESS)
    const tokens2 = generateDemoWalletTokens(TEST_ADDRESS)
    expect(tokens1).toEqual(tokens2)

    const positions1 = generateDemoDefiPositions(TEST_ADDRESS)
    const positions2 = generateDemoDefiPositions(TEST_ADDRESS)
    expect(positions1).toEqual(positions2)
  })

  it('different addresses produce different amounts', () => {
    const addr2 = '0x1234567890AbCdEf1234567890AbCdEf12345678'
    const balance1 = getDemoTotalBalance(TEST_ADDRESS)
    const balance2 = getDemoTotalBalance(addr2)
    // Very unlikely to be identical for different addresses
    expect(balance1).not.toBe(balance2)
  })
})

describe('exported constants', () => {
  it('SUPPORTED_CHAINS has entries', () => {
    expect(SUPPORTED_CHAINS.length).toBeGreaterThan(0)
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain).toHaveProperty('id')
      expect(chain).toHaveProperty('name')
    }
  })

  it('DEMO_STOCK_PRICES has entries with price/change/changePercent', () => {
    const keys = Object.keys(DEMO_STOCK_PRICES)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(DEMO_STOCK_PRICES[key]).toHaveProperty('price')
      expect(DEMO_STOCK_PRICES[key]).toHaveProperty('change')
      expect(DEMO_STOCK_PRICES[key]).toHaveProperty('changePercent')
    }
  })

  it('DEMO_CRYPTO_PRICES has entries with price/change24h', () => {
    const keys = Object.keys(DEMO_CRYPTO_PRICES)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(DEMO_CRYPTO_PRICES[key]).toHaveProperty('price')
      expect(DEMO_CRYPTO_PRICES[key]).toHaveProperty('change24h')
    }
  })
})

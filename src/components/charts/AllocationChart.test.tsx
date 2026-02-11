/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { AssetWithPrice } from '@/types'
import AllocationChart from './AllocationChart'

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => <div data-testid="pie" data-count={data.length}>{children}</div>,
  Cell: (props: Record<string, unknown>) => <div data-testid="cell" data-fill={props.fill} />,
  Tooltip: () => <div data-testid="tooltip" />,
}))

function makeAsset(symbol: string, value: number, allocation: number): AssetWithPrice {
  return {
    id: `pos-${symbol}`,
    assetClass: 'crypto',
    type: 'crypto',
    symbol,
    name: symbol,
    amount: 1,
    addedAt: '2024-01-01',
    updatedAt: '2024-01-01',
    currentPrice: value,
    value,
    change24h: 0,
    changePercent24h: 0,
    allocation,
  }
}

describe('AllocationChart', () => {
  it('renders empty state when no positive assets', () => {
    render(<AllocationChart assets={[]} />)
    expect(screen.getByText('No assets')).toBeInTheDocument()
  })

  it('renders items correctly with legend', () => {
    const assets = [
      makeAsset('BTC', 50000, 62.5),
      makeAsset('ETH', 30000, 37.5),
    ]
    render(<AllocationChart assets={assets} />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('63%')).toBeInTheDocument()
    expect(screen.getByText('38%')).toBeInTheDocument()
  })

  it('adds "other" bucket when more than 10 assets', () => {
    const assets = Array.from({ length: 12 }, (_, i) =>
      makeAsset(`TOKEN${i}`, 1000 - i * 10, (1000 - i * 10) / 118.34)
    )
    // Total = sum of 1000, 990, 980, ..., 890 = 11340
    // Top 10 shown: 1000+990+980+970+960+950+940+930+920+910 = 9550
    // Other = 11340 - 9550 = 1790
    render(<AllocationChart assets={assets} />)
    expect(screen.getByText('other')).toBeInTheDocument()
  })

  it('displays percentage labels for each item', () => {
    const assets = [
      makeAsset('BTC', 75000, 75),
      makeAsset('ETH', 25000, 25),
    ]
    render(<AllocationChart assets={assets} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('filters out zero and negative value assets', () => {
    const assets = [
      makeAsset('BTC', 50000, 100),
      makeAsset('ZERO', 0, 0),
      { ...makeAsset('DEBT', -1000, -2), value: -1000 },
    ]
    render(<AllocationChart assets={assets} />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.queryByText('ZERO')).not.toBeInTheDocument()
    expect(screen.queryByText('DEBT')).not.toBeInTheDocument()
  })

  it('renders legend items with color indicators', () => {
    const assets = [
      makeAsset('BTC', 60000, 60),
      makeAsset('ETH', 40000, 40),
    ]
    const { container } = render(<AllocationChart assets={assets} />)
    // Each legend item has a colored div indicator
    const colorDots = container.querySelectorAll('.w-2\\.5.h-2\\.5')
    expect(colorDots.length).toBe(2)
    expect((colorDots[0] as HTMLElement).style.backgroundColor).toBe('rgb(139, 115, 85)')
    expect((colorDots[1] as HTMLElement).style.backgroundColor).toBe('rgb(166, 139, 106)')
  })
})

/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { AssetWithPrice } from '@/types'

// Mock calculateExposureData before importing component
vi.mock('@/services', () => ({
  calculateExposureData: vi.fn(() => ({
    simpleBreakdown: [],
    detailedBreakdown: [],
    totalGross: 0,
    totalNet: 0,
  })),
}))

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Cell: (props: Record<string, unknown>) => <div data-testid="cell" data-fill={props.fill} />,
  Tooltip: () => <div data-testid="tooltip" />,
}))

import ExposureChart from './ExposureChart'
import { calculateExposureData } from '@/services'

const mockCalculateExposureData = vi.mocked(calculateExposureData)

function makeAsset(symbol: string, value: number): AssetWithPrice {
  return {
    id: `pos-${symbol}`,
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
    allocation: 0,
  }
}

describe('ExposureChart', () => {
  beforeEach(() => {
    mockCalculateExposureData.mockReturnValue({
      simpleBreakdown: [],
      detailedBreakdown: [],
      totalGross: 0,
      totalNet: 0,
    })
  })

  it('renders empty state when simpleBreakdown is empty', () => {
    render(<ExposureChart assets={[]} />)
    expect(screen.getByText('No assets')).toBeInTheDocument()
  })

  it('renders exposure breakdown with legend items', () => {
    mockCalculateExposureData.mockReturnValue({
      simpleBreakdown: [
        { id: 'btc', label: 'Bitcoin', value: 50000, percentage: 50, color: '#F7931A' },
        { id: 'eth', label: 'Ethereum', value: 30000, percentage: 30, color: '#627EEA' },
        { id: 'cash', label: 'Cash', value: 20000, percentage: 20, color: '#4A7C59' },
      ],
      detailedBreakdown: [],
      totalGross: 100000,
      totalNet: 100000,
    })

    render(<ExposureChart assets={[makeAsset('BTC', 50000)]} />)
    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('Ethereum')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  it('calls calculateExposureData with provided assets', () => {
    const assets = [makeAsset('BTC', 50000), makeAsset('ETH', 30000)]
    render(<ExposureChart assets={assets} />)
    expect(mockCalculateExposureData).toHaveBeenCalledWith(assets)
  })

  it('renders color indicators for each breakdown item', () => {
    mockCalculateExposureData.mockReturnValue({
      simpleBreakdown: [
        { id: 'btc', label: 'Bitcoin', value: 50000, percentage: 100, color: '#F7931A' },
      ],
      detailedBreakdown: [],
      totalGross: 50000,
      totalNet: 50000,
    })

    const { container } = render(<ExposureChart assets={[makeAsset('BTC', 50000)]} />)
    const colorDot = container.querySelector('.w-2\\.5.h-2\\.5') as HTMLElement
    expect(colorDot).not.toBeNull()
    expect(colorDot.style.backgroundColor).toBe('rgb(247, 147, 26)')
  })

  it('does not render chart when breakdown is empty', () => {
    render(<ExposureChart assets={[]} />)
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument()
    expect(screen.getByText('No assets')).toBeInTheDocument()
  })
})

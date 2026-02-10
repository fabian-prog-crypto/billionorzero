/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { NetWorthSnapshot } from '@/types'

// Mock recharts - components don't render in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  AreaChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => <div data-testid="area-chart" data-count={data.length}>{children}</div>,
  Area: (props: Record<string, unknown>) => <div data-testid="area" data-datakey={props.dataKey} />,
  XAxis: (props: Record<string, unknown>) => <div data-testid="x-axis" data-datakey={props.dataKey} />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
}))

// Mock date-fns
vi.mock('date-fns', () => ({
  format: (date: Date, fmt: string) => `${date.toISOString().slice(0, 10)}(${fmt})`,
}))

import NetWorthChart from './NetWorthChart'

function makeSnapshot(date: string, totalValue: number, cryptoValue = 0, stockValue = 0, manualValue = 0): NetWorthSnapshot {
  return {
    id: `snap-${date}`,
    date,
    totalValue,
    cryptoValue,
    stockValue,
    cashValue: 0,
    manualValue,
  }
}

describe('NetWorthChart', () => {
  it('renders empty state when no snapshots are provided', () => {
    render(<NetWorthChart snapshots={[]} />)
    expect(screen.getByText('No historical data yet')).toBeInTheDocument()
  })

  it('renders chart when snapshots are provided', () => {
    const snapshots = [
      makeSnapshot('2024-01-01', 10000, 8000, 2000),
      makeSnapshot('2024-01-02', 11000, 9000, 2000),
    ]
    render(<NetWorthChart snapshots={snapshots} />)
    expect(screen.queryByText('No historical data yet')).not.toBeInTheDocument()
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('passes correct data count to AreaChart', () => {
    const snapshots = [
      makeSnapshot('2024-01-01', 10000),
      makeSnapshot('2024-01-02', 11000),
      makeSnapshot('2024-01-03', 12000),
    ]
    render(<NetWorthChart snapshots={snapshots} />)
    const chart = screen.getByTestId('area-chart')
    expect(chart).toHaveAttribute('data-count', '3')
  })

  it('hides axes and tooltip in minimal mode', () => {
    const snapshots = [makeSnapshot('2024-01-01', 10000)]
    render(<NetWorthChart snapshots={snapshots} minimal />)
    expect(screen.queryByTestId('x-axis')).not.toBeInTheDocument()
    expect(screen.queryByTestId('y-axis')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
  })

  it('shows axes and tooltip in default (non-minimal) mode', () => {
    const snapshots = [makeSnapshot('2024-01-01', 10000)]
    render(<NetWorthChart snapshots={snapshots} />)
    expect(screen.getByTestId('x-axis')).toBeInTheDocument()
    expect(screen.getByTestId('y-axis')).toBeInTheDocument()
    expect(screen.getByTestId('tooltip')).toBeInTheDocument()
  })

  it('applies custom height to empty state', () => {
    const { container } = render(<NetWorthChart snapshots={[]} height={400} />)
    const emptyDiv = container.firstChild as HTMLElement
    expect(emptyDiv.style.height).toBe('400px')
  })

  it('renders Area with dataKey="value"', () => {
    const snapshots = [makeSnapshot('2024-01-01', 10000)]
    render(<NetWorthChart snapshots={snapshots} />)
    const area = screen.getByTestId('area')
    expect(area).toHaveAttribute('data-datakey', 'value')
  })
})

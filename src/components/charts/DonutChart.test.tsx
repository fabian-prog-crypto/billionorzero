/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DonutChart, { DonutChartItem } from './DonutChart'

function makeItem(label: string, value: number, color = '#FF0000', breakdown?: { label: string; value: number }[]): DonutChartItem {
  return { label, value, color, breakdown }
}

describe('DonutChart', () => {
  it('renders without crash with empty data array', () => {
    render(<DonutChart title="Empty" data={[]} />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('renders a single item correctly', () => {
    const data = [makeItem('Bitcoin', 50000, '#F7931A')]
    render(<DonutChart title="Single" data={data} />)
    expect(screen.getByText('Single')).toBeInTheDocument()
    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('$50,000')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('renders SVG paths for multiple items', () => {
    const data = [
      makeItem('Bitcoin', 60000, '#F7931A'),
      makeItem('Ethereum', 40000, '#627EEA'),
    ]
    const { container } = render(<DonutChart title="Multi" data={data} />)
    const paths = container.querySelectorAll('svg path')
    expect(paths.length).toBe(2)
  })

  it('groups extras into "Other" when more items than maxItems', () => {
    const data = [
      makeItem('A', 500),
      makeItem('B', 400),
      makeItem('C', 300),
      makeItem('D', 200),
      makeItem('E', 100),
    ]
    render(<DonutChart title="Grouped" data={data} maxItems={3} />)
    // Top 2 items + Other
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    // The grouped items should not appear individually
    expect(screen.queryByText('D')).not.toBeInTheDocument()
    expect(screen.queryByText('E')).not.toBeInTheDocument()
  })

  it('filters out zero values', () => {
    const data = [
      makeItem('Bitcoin', 50000),
      makeItem('Zero', 0),
    ]
    const { container } = render(<DonutChart title="FilterZero" data={data} />)
    expect(screen.queryByText('Zero')).not.toBeInTheDocument()
    const paths = container.querySelectorAll('svg path')
    expect(paths.length).toBe(1)
  })

  it('hides monetary values when hideValues is true', () => {
    const data = [makeItem('Bitcoin', 50000)]
    render(<DonutChart title="Hidden" data={data} hideValues />)
    // Should show masked values instead of dollar amounts
    const maskedElements = screen.getAllByText('••••')
    expect(maskedElements.length).toBeGreaterThan(0)
    // Should show masked percentages
    const maskedPct = screen.getAllByText('••')
    expect(maskedPct.length).toBeGreaterThan(0)
    // Should not show the actual value
    expect(screen.queryByText('$50,000')).not.toBeInTheDocument()
  })

  it('filters out negative values', () => {
    const data = [
      makeItem('Bitcoin', 50000),
      makeItem('Debt', -1000),
    ]
    const { container } = render(<DonutChart title="NoNeg" data={data} />)
    expect(screen.queryByText('Debt')).not.toBeInTheDocument()
    const paths = container.querySelectorAll('svg path')
    expect(paths.length).toBe(1)
  })

  it('sorts items descending by value', () => {
    const data = [
      makeItem('Small', 100, '#AAA'),
      makeItem('Large', 900, '#BBB'),
      makeItem('Medium', 500, '#CCC'),
    ]
    const { container } = render(<DonutChart title="Sorted" data={data} />)
    // Legend items should be ordered: Large, Medium, Small
    const legendLabels = container.querySelectorAll('.text-\\[12px\\].truncate')
    const texts = Array.from(legendLabels).map((el) => el.textContent)
    expect(texts).toEqual(['Large', 'Medium', 'Small'])
  })

  it('calculates total value correctly', () => {
    const data = [
      makeItem('A', 30000),
      makeItem('B', 20000),
    ]
    // Total = 50000. A = 60%, B = 40%
    render(<DonutChart title="Total" data={data} />)
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('shows percentages correctly for multiple items', () => {
    const data = [
      makeItem('A', 750),
      makeItem('B', 250),
    ]
    render(<DonutChart title="Pct" data={data} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('applies custom size prop to SVG dimensions', () => {
    const data = [makeItem('A', 100)]
    const { container } = render(<DonutChart title="Sized" data={data} size={200} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '200')
    expect(svg).toHaveAttribute('height', '200')
  })

  it('uses default size of 120 when size prop is omitted', () => {
    const data = [makeItem('A', 100)]
    const { container } = render(<DonutChart title="Default" data={data} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '120')
    expect(svg).toHaveAttribute('height', '120')
  })

  it('groups correctly with maxItems=3 and 5 items', () => {
    const data = [
      makeItem('A', 500),
      makeItem('B', 400),
      makeItem('C', 300),
      makeItem('D', 200),
      makeItem('E', 100),
    ]
    render(<DonutChart title="Max3" data={data} maxItems={3} />)
    // Should show top 2 + Other (maxItems-1 top items + Other)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    // Other value = 300 + 200 + 100 = 600 -> $600
    expect(screen.getByText('$600')).toBeInTheDocument()
  })

  it('renders the title in the chart', () => {
    render(<DonutChart title="My Portfolio" data={[]} />)
    expect(screen.getByText('My Portfolio')).toBeInTheDocument()
  })

  it('uses default maxItems of 5', () => {
    const data = [
      makeItem('A', 600),
      makeItem('B', 500),
      makeItem('C', 400),
      makeItem('D', 300),
      makeItem('E', 200),
      makeItem('F', 100),
    ]
    render(<DonutChart title="Default5" data={data} />)
    // Default maxItems=5 so top 4 + Other
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    // E and F should be grouped into Other
    expect(screen.queryByText('E')).not.toBeInTheDocument()
    expect(screen.queryByText('F')).not.toBeInTheDocument()
  })

  it('shows breakdown data on hover when item has breakdown', async () => {
    const user = userEvent.setup()
    const data = [
      makeItem('Crypto', 10000, '#F00', [
        { label: 'BTC', value: 7000 },
        { label: 'ETH', value: 3000 },
      ]),
    ]
    render(<DonutChart title="Breakdown" data={data} />)
    // Hover over the legend item to trigger hover state
    const legendItem = screen.getByText('Crypto').closest('div[class*="cursor-pointer"]')!
    await user.hover(legendItem)
    // The tooltip should show breakdown items
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('$7,000')).toBeInTheDocument()
    expect(screen.getByText('$3,000')).toBeInTheDocument()
  })
})

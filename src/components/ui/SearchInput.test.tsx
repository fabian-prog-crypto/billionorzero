/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchInput from './SearchInput'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Search: (props: Record<string, unknown>) => <svg data-testid="search-icon" {...props} />,
  X: (props: Record<string, unknown>) => <svg data-testid="x-icon" {...props} />,
}))

describe('SearchInput', () => {
  it('renders the input with default placeholder', () => {
    render(<SearchInput value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  it('renders with custom placeholder', () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Find assets..." />)
    expect(screen.getByPlaceholderText('Find assets...')).toBeInTheDocument()
  })

  it('calls onChange when user types', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<SearchInput value="" onChange={handleChange} />)
    const input = screen.getByPlaceholderText('Search...')
    await user.type(input, 'btc')
    expect(handleChange).toHaveBeenCalledWith('b')
    expect(handleChange).toHaveBeenCalledWith('t')
    expect(handleChange).toHaveBeenCalledWith('c')
    expect(handleChange).toHaveBeenCalledTimes(3)
  })

  it('shows clear button when value is non-empty and clears on click', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<SearchInput value="test" onChange={handleChange} />)
    // Clear button should be visible
    const clearButton = screen.getByRole('button')
    expect(clearButton).toBeInTheDocument()
    await user.click(clearButton)
    expect(handleChange).toHaveBeenCalledWith('')
  })

  it('does not show clear button when value is empty', () => {
    render(<SearchInput value="" onChange={() => {}} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(
      <EmptyState
        icon={<svg data-testid="test-icon" />}
        title="No items found"
        description="Try adding some items to get started."
      />
    )
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
    expect(screen.getByText('No items found')).toBeInTheDocument()
    expect(screen.getByText('Try adding some items to get started.')).toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    render(
      <EmptyState
        icon={<svg />}
        title="Empty"
        description="Nothing here"
        action={<button>Add Item</button>}
      />
    )
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument()
  })

  it('does not render action when not provided', () => {
    render(
      <EmptyState
        icon={<svg />}
        title="Empty"
        description="Nothing here"
      />
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('applies size class correctly', () => {
    const { container } = render(
      <EmptyState
        icon={<svg />}
        title="Small"
        description="Small empty state"
        size="sm"
      />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('py-12')
  })

  it('defaults to large size', () => {
    const { container } = render(
      <EmptyState
        icon={<svg />}
        title="Default"
        description="Default size"
      />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('py-20')
  })
})

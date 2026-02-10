/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeEach } from 'vitest'

// Mock passkey module
const mockIsPasskeyRegistered = vi.fn()
vi.mock('@/lib/passkey', () => ({
  isPasskeyRegistered: () => mockIsPasskeyRegistered(),
  isPasskeySupported: vi.fn(() => true),
  authenticateWithPasskey: vi.fn(),
  registerPasskey: vi.fn(),
}))

// Mock the store state
const mockAuthState = {
  isAuthenticated: false,
  _hasHydrated: false,
  isPasskeyEnabled: false,
  loginTimestamp: null as number | null,
  setAuthenticated: vi.fn(),
  setPasskeyEnabled: vi.fn(),
  setHasHydrated: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@/store/authStore', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeFunction = (selector?: (state: any) => any) => {
    if (selector) return selector(mockAuthState)
    return mockAuthState
  }
  storeFunction.getState = () => mockAuthState
  storeFunction.setState = vi.fn()
  storeFunction.subscribe = vi.fn()
  return { useAuthStore: storeFunction }
})

// Mock LoginScreen to avoid its internal dependencies
vi.mock('./LoginScreen', () => ({
  default: () => <div data-testid="login-screen">Login Screen</div>,
}))

import AuthProvider from './AuthProvider'

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState.isAuthenticated = false
    mockAuthState._hasHydrated = false
    mockAuthState.isPasskeyEnabled = false
    mockAuthState.loginTimestamp = null
    mockIsPasskeyRegistered.mockReturnValue(false)
  })

  it('shows spinner during hydration (_hasHydrated=false)', () => {
    mockAuthState._hasHydrated = false
    const { container } = render(
      <AuthProvider>
        <div>App Content</div>
      </AuthProvider>
    )
    // Should show spinning loader
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
    // Should not show children
    expect(screen.queryByText('App Content')).not.toBeInTheDocument()
  })

  it('auto-authenticates new users (no passkey, not authenticated)', () => {
    mockAuthState._hasHydrated = true
    mockAuthState.isAuthenticated = false
    mockIsPasskeyRegistered.mockReturnValue(false)

    render(
      <AuthProvider>
        <div>App Content</div>
      </AuthProvider>
    )

    expect(mockAuthState.setPasskeyEnabled).toHaveBeenCalledWith(false)
    expect(mockAuthState.setAuthenticated).toHaveBeenCalledWith(true)
  })

  it('shows LoginScreen when passkey enabled but not authenticated', () => {
    mockAuthState._hasHydrated = true
    mockAuthState.isAuthenticated = false
    mockIsPasskeyRegistered.mockReturnValue(true)

    render(
      <AuthProvider>
        <div>App Content</div>
      </AuthProvider>
    )

    expect(screen.getByTestId('login-screen')).toBeInTheDocument()
    expect(screen.queryByText('App Content')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    mockAuthState._hasHydrated = true
    mockAuthState.isAuthenticated = true

    render(
      <AuthProvider>
        <div>App Content</div>
      </AuthProvider>
    )

    expect(screen.getByText('App Content')).toBeInTheDocument()
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument()
  })

  it('sets passkey enabled when passkey is registered', () => {
    mockAuthState._hasHydrated = true
    mockAuthState.isAuthenticated = true
    mockIsPasskeyRegistered.mockReturnValue(true)

    render(
      <AuthProvider>
        <div>App Content</div>
      </AuthProvider>
    )

    expect(mockAuthState.setPasskeyEnabled).toHaveBeenCalledWith(true)
  })

  it('does not auto-authenticate when passkey is registered', () => {
    mockAuthState._hasHydrated = true
    mockAuthState.isAuthenticated = false
    mockIsPasskeyRegistered.mockReturnValue(true)

    render(
      <AuthProvider>
        <div>App Content</div>
      </AuthProvider>
    )

    // Should NOT call setAuthenticated(true) because passkey exists
    expect(mockAuthState.setAuthenticated).not.toHaveBeenCalledWith(true)
  })
})

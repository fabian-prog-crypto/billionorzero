import { useAuthStore } from './authStore'

// Helper to reset between tests
const getInitialState = () => ({
  isAuthenticated: false,
  isPasskeyEnabled: false,
  loginTimestamp: null,
  _hasHydrated: false,
})

beforeEach(() => {
  useAuthStore.setState(getInitialState())
})

describe('setAuthenticated', () => {
  it('sets loginTimestamp to Date.now() when true', () => {
    const before = Date.now()
    useAuthStore.getState().setAuthenticated(true)
    const after = Date.now()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.loginTimestamp).toBeGreaterThanOrEqual(before)
    expect(state.loginTimestamp).toBeLessThanOrEqual(after)
  })

  it('clears loginTimestamp when false', () => {
    useAuthStore.getState().setAuthenticated(true)
    expect(useAuthStore.getState().loginTimestamp).not.toBeNull()

    useAuthStore.getState().setAuthenticated(false)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.loginTimestamp).toBeNull()
  })
})

describe('logout', () => {
  it('clears auth state', () => {
    useAuthStore.getState().setAuthenticated(true)
    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.loginTimestamp).toBeNull()
  })
})

describe('setPasskeyEnabled', () => {
  it('toggles passkey flag to true', () => {
    useAuthStore.getState().setPasskeyEnabled(true)
    expect(useAuthStore.getState().isPasskeyEnabled).toBe(true)
  })

  it('toggles passkey flag to false', () => {
    useAuthStore.getState().setPasskeyEnabled(true)
    useAuthStore.getState().setPasskeyEnabled(false)
    expect(useAuthStore.getState().isPasskeyEnabled).toBe(false)
  })
})

describe('setHasHydrated', () => {
  it('sets _hasHydrated to true', () => {
    useAuthStore.getState().setHasHydrated(true)
    expect(useAuthStore.getState()._hasHydrated).toBe(true)
  })
})

describe('session expiry on rehydrate', () => {
  it('auto-logs out when session is older than 30 days', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000

    // Simulate stored state with expired session
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: {
          isAuthenticated: true,
          isPasskeyEnabled: false,
          loginTimestamp: thirtyOneDaysAgo,
        },
        version: 0,
      })
    )

    // Trigger rehydration by calling persist.rehydrate
    return useAuthStore.persist.rehydrate().then(() => {
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.loginTimestamp).toBeNull()
      expect(state._hasHydrated).toBe(true)
    })
  })

  it('stays authenticated when session is within 30 days', () => {
    const oneDayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000

    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: {
          isAuthenticated: true,
          isPasskeyEnabled: false,
          loginTimestamp: oneDayAgo,
        },
        version: 0,
      })
    )

    return useAuthStore.persist.rehydrate().then(() => {
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.loginTimestamp).toBe(oneDayAgo)
      expect(state._hasHydrated).toBe(true)
    })
  })
})

describe('partialize', () => {
  it('only persists isAuthenticated, isPasskeyEnabled, and loginTimestamp', () => {
    useAuthStore.getState().setAuthenticated(true)
    useAuthStore.getState().setPasskeyEnabled(true)
    useAuthStore.getState().setHasHydrated(true)

    // Read what was persisted
    const stored = JSON.parse(localStorage.getItem('auth-storage') || '{}')
    const keys = Object.keys(stored.state || {})

    expect(keys).toContain('isAuthenticated')
    expect(keys).toContain('isPasskeyEnabled')
    expect(keys).toContain('loginTimestamp')
    expect(keys).not.toContain('_hasHydrated')
  })
})

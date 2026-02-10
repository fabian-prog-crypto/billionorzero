import { useThemeStore, applyTheme } from './themeStore'

// Mock document.documentElement.setAttribute
const setAttributeMock = vi.fn()

beforeEach(() => {
  useThemeStore.setState({ theme: 'system' })
  setAttributeMock.mockClear()

  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: setAttributeMock,
    },
  })
})

describe('setTheme', () => {
  it('updates theme to dark', () => {
    useThemeStore.getState().setTheme('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('updates theme to light', () => {
    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('updates theme to system', () => {
    useThemeStore.getState().setTheme('dark')
    useThemeStore.getState().setTheme('system')
    expect(useThemeStore.getState().theme).toBe('system')
  })
})

describe('default theme', () => {
  it('defaults to system', () => {
    // After the beforeEach reset
    expect(useThemeStore.getState().theme).toBe('system')
  })
})

describe('applyTheme', () => {
  it('sets data-theme to light for light theme', () => {
    applyTheme('light')
    expect(setAttributeMock).toHaveBeenCalledWith('data-theme', 'light')
  })

  it('sets data-theme to dark for dark theme', () => {
    applyTheme('dark')
    expect(setAttributeMock).toHaveBeenCalledWith('data-theme', 'dark')
  })

  it('queries matchMedia for system theme and applies dark when prefers dark', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    })

    applyTheme('system')
    expect(setAttributeMock).toHaveBeenCalledWith('data-theme', 'dark')
  })

  it('queries matchMedia for system theme and applies light when prefers light', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    })

    applyTheme('system')
    expect(setAttributeMock).toHaveBeenCalledWith('data-theme', 'light')
  })
})

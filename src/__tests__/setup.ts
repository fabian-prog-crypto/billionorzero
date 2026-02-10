// Global test setup — localStorage mock + cleanup

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

vi.stubGlobal('localStorage', localStorageMock)

// Ensure window is defined for client-side checks
if (typeof globalThis.window === 'undefined') {
  vi.stubGlobal('window', globalThis)
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

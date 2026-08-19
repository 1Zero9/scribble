import '@testing-library/jest-dom/vitest';

// Scribble must never make a network request. Any attempt to do so during a
// test fails loudly rather than silently succeeding.
const forbidden = () => {
  throw new Error('Scribble attempted a network request. This is not permitted.');
};

globalThis.fetch = forbidden as unknown as typeof fetch;

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

import { useSyncExternalStore } from 'react'
import type { Scheme } from './fields'

const query = window.matchMedia('(prefers-color-scheme: dark)')

const subscribe = (onChange: () => void) => {
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

// deck.gl draws to WebGL, so mark colors can't come from CSS variables;
// track the OS color scheme in JS instead.
export function useColorScheme(): Scheme {
  return useSyncExternalStore(subscribe, () => (query.matches ? 'dark' : 'light'))
}

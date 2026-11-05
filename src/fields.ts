import type { Sample } from './types'

export type Scheme = 'light' | 'dark'

export interface Category {
  value: string
  label: string
  color: Record<Scheme, string>
}

export interface Field {
  key: 'subtype' | 'idh' | 'disease' | 'grade'
  label: string
  categories: Category[]
}

// Categorical slots, light and dark steps, in a fixed order validated for
// color-vision deficiency on adjacent pairs.
const SLOTS: Record<Scheme, string>[] = [
  { light: '#2a78d6', dark: '#3987e5' }, // blue
  { light: '#eb6834', dark: '#d95926' }, // orange
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#eda100', dark: '#c98500' }, // yellow
  { light: '#e87ba4', dark: '#d55181' }, // magenta
  { light: '#008300', dark: '#008300' }, // green
  { light: '#6250d6', dark: '#9085e9' }, // violet
]

export const UNKNOWN: Category = {
  value: '',
  label: 'Unknown',
  color: { light: '#c3c2b7', dark: '#52514e' },
}

const categorical = (values: [string, string][]): Category[] =>
  values.map(([value, label], i) => ({ value, label, color: SLOTS[i] }))

export const FIELDS: Field[] = [
  {
    key: 'subtype',
    label: 'Pan-glioma subtype',
    // IDH-mutant subtypes first, then IDH-wildtype.
    categories: categorical([
      ['Codel', 'Codel (IDH-mut, 1p/19q)'],
      ['G-CIMP-high', 'G-CIMP-high (IDH-mut)'],
      ['G-CIMP-low', 'G-CIMP-low (IDH-mut)'],
      ['Classic-like', 'Classic-like (IDH-wt)'],
      ['Mesenchymal-like', 'Mesenchymal-like (IDH-wt)'],
      ['LGm6-GBM', 'LGm6-GBM (IDH-wt)'],
      ['PA-like', 'PA-like (IDH-wt)'],
    ]),
  },
  {
    key: 'idh',
    label: 'IDH status',
    categories: categorical([
      ['Mutant', 'IDH-mutant'],
      ['Wildtype', 'IDH-wildtype'],
    ]),
  },
  {
    key: 'disease',
    label: 'Disease',
    categories: categorical([
      ['LGG', 'Lower-grade glioma'],
      ['GBM', 'Glioblastoma'],
    ]),
  },
  {
    key: 'grade',
    label: 'WHO grade',
    // Ordered, so one hue stepped by grade rather than categorical hues.
    categories: [
      { value: 'G2', label: 'Grade 2', color: { light: '#86b6ef', dark: '#184f95' } },
      { value: 'G3', label: 'Grade 3', color: { light: '#2a78d6', dark: '#3987e5' } },
      { value: 'G4', label: 'Grade 4', color: { light: '#104281', dark: '#9ec5f4' } },
    ],
  },
]

export function categoryOf(field: Field, sample: Sample): Category {
  const value = sample[field.key]
  return field.categories.find((c) => c.value === value) ?? UNKNOWN
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

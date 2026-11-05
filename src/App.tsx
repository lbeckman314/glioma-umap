import { useEffect, useState } from 'react'
import { Scatter } from './Scatter'
import { FIELDS, UNKNOWN, categoryOf, type Field, type Scheme } from './fields'
import { useColorScheme } from './useColorScheme'
import type { Payload, Sample } from './types'

export default function App() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [field, setField] = useState<Field>(FIELDS[0])
  const [highlight, setHighlight] = useState<string | null>(null)
  const scheme = useColorScheme()

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/umap.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main>
      <header>
        <h1>Glioma UMAP</h1>
        <p>
          {data ? data.meta.samples : '…'} TCGA primary brain tumors placed by gene expression. Nearby tumors have
          similar expression profiles; the axes have no units.
        </p>
      </header>

      <div className="controls">
        <label>
          Color by{' '}
          <select
            value={field.key}
            onChange={(e) => {
              setField(FIELDS.find((f) => f.key === e.target.value)!)
              setHighlight(null)
            }}
          >
            {FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert">Could not load data: {error}</p>}
      {data && (
        <div className="figure">
          <Scatter samples={data.samples} field={field} scheme={scheme} highlight={highlight} />
          <Legend samples={data.samples} field={field} scheme={scheme} onHighlight={setHighlight} />
        </div>
      )}

      <footer>
        Data: TCGA GBM/LGG RNA-seq, clinical and survival data from{' '}
        <a href="https://xenabrowser.net/">UCSC Xena</a>; pan-glioma subtypes from{' '}
        <a href="https://doi.org/10.1016/j.cell.2015.12.028">Ceccarelli et al. 2016</a>.
      </footer>
    </main>
  )
}

interface LegendProps {
  samples: Sample[]
  field: Field
  scheme: Scheme
  onHighlight: (value: string | null) => void
}

// Hovering or focusing an entry highlights its tumors, so categories never
// rely on color alone.
function Legend({ samples, field, scheme, onHighlight }: LegendProps) {
  const counts = new Map<string, number>()
  for (const s of samples) {
    const value = categoryOf(field, s).value
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const entries = [...field.categories, UNKNOWN].filter((c) => counts.has(c.value))

  return (
    <ul className="legend" aria-label={`${field.label} legend`}>
      {entries.map((c) => (
        <li
          key={c.value}
          tabIndex={0}
          onMouseEnter={() => onHighlight(c.value)}
          onMouseLeave={() => onHighlight(null)}
          onFocus={() => onHighlight(c.value)}
          onBlur={() => onHighlight(null)}
        >
          <span className="swatch" style={{ background: c.color[scheme] }} />
          <span className="label">{c.label}</span>
          <span className="count">{counts.get(c.value)}</span>
        </li>
      ))}
    </ul>
  )
}

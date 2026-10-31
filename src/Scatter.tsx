import { useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { OrthographicView, type OrthographicViewState, type PickingInfo } from '@deck.gl/core'
import { ScatterplotLayer } from '@deck.gl/layers'
import { categoryOf, hexToRgb, type Field, type Scheme } from './fields'
import type { Sample } from './types'

const SURFACE: Record<Scheme, string> = { light: '#fcfcfb', dark: '#1a1a19' }
const VIEW = new OrthographicView({ id: 'umap' })

interface Props {
  samples: Sample[]
  field: Field
  scheme: Scheme
  highlight: string | null
}

// Center the points and zoom so they fill the container with some margin.
function fitView(samples: Sample[], width: number, height: number): OrthographicViewState {
  const xs = samples.map((s) => s.x)
  const ys = samples.map((s) => s.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const scale = 0.9 * Math.min(width / (maxX - minX), height / (maxY - minY))
  return { target: [(minX + maxX) / 2, (minY + maxY) / 2, 0], zoom: Math.log2(scale) }
}

export function Scatter({ samples, field, scheme, highlight }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [viewState, setViewState] = useState<OrthographicViewState | null>(null)
  const [hover, setHover] = useState<PickingInfo<Sample> | null>(null)

  useEffect(() => {
    const { width, height } = container.current!.getBoundingClientRect()
    setViewState(fitView(samples, width, height))
  }, [samples])

  // Draw unknowns first so labeled tumors sit on top of them.
  const ordered = useMemo(
    () => [...samples].sort((a, b) => Number(a[field.key] !== null) - Number(b[field.key] !== null)),
    [samples, field],
  )

  const layer = new ScatterplotLayer<Sample>({
    id: 'tumors',
    data: ordered,
    getPosition: (s) => [s.x, s.y],
    getRadius: 4,
    radiusUnits: 'pixels',
    getFillColor: (s) => {
      const category = categoryOf(field, s)
      const alpha = highlight === null || highlight === category.value ? 255 : 40
      return [...hexToRgb(category.color[scheme]), alpha]
    },
    stroked: true,
    getLineColor: [...hexToRgb(SURFACE[scheme]), 255],
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    pickable: true,
    updateTriggers: { getFillColor: [field.key, scheme, highlight], getLineColor: scheme },
  })

  return (
    <div className="scatter" ref={container}>
      {viewState && (
        <DeckGL
          views={VIEW}
          viewState={viewState}
          onViewStateChange={({ viewState }) => setViewState(viewState as OrthographicViewState)}
          controller
          layers={[layer]}
          pickingRadius={4}
          onHover={(info) => setHover(info.object ? info : null)}
        />
      )}
      {hover && <Tooltip info={hover} field={field} />}
    </div>
  )
}

function Tooltip({ info, field }: { info: PickingInfo<Sample>; field: Field }) {
  const s = info.object!
  const survival =
    s.os_days === null ? '—' : `${(s.os_days / 365.25).toFixed(1)} yr${s.os_event === 1 ? ' (deceased)' : ''}`
  const rows: [string, string | number | null][] = [
    [field.label, categoryOf(field, s).label],
    ['Disease', s.disease],
    ['Histology', s.histology],
    ['Grade', s.grade],
    ['Age', s.age],
    ['Gender', s.gender],
    ['Overall survival', survival],
  ]
  return (
    <div className="tooltip" style={{ left: info.x, top: info.y }}>
      <div className="tooltip-title">{s.id}</div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

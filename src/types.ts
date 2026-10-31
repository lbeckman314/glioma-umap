// Shape of public/data/umap.json, written by pipeline/build.py.

export interface Sample {
  id: string
  x: number
  y: number
  disease: 'GBM' | 'LGG' | null
  subtype: string | null
  idh: 'Mutant' | 'Wildtype' | null
  grade: 'G2' | 'G3' | 'G4' | null
  histology: string | null
  gender: string | null
  age: number | null
  os_days: number | null
  os_event: 0 | 1 | null
}

export interface Payload {
  meta: {
    samples: number
    genes: number
    pca_components: number
    umap: { n_neighbors: number; min_dist: number; random_state: number }
    sources: Record<string, string>
  }
  samples: Sample[]
}

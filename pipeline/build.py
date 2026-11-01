"""Build the UMAP embedding of TCGA glioma (GBM + LGG) tumors.

Downloads public data from UCSC Xena, embeds primary tumors by gene
expression, and writes per-sample coordinates plus clinical fields to JSON
for the web app.

    python pipeline/build.py                # writes public/data/umap.json
    python pipeline/build.py --compare      # also writes docs/n_neighbors.png
"""

import argparse
import json
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import umap

ROOT = Path(__file__).resolve().parent.parent

TCGA_HUB = "https://tcga-xena-hub.s3.us-east-1.amazonaws.com/download"
PANCAN_HUB = "https://tcga-pancan-atlas-hub.s3.us-east-1.amazonaws.com/download"

SOURCES = {
    # log2(RSEM normalized count + 1), genes x samples
    "expression": f"{TCGA_HUB}/TCGA.GBMLGG.sampleMap%2FHiSeqV2.gz",
    "clinical": f"{TCGA_HUB}/TCGA.GBMLGG.sampleMap%2FGBMLGG_clinicalMatrix",
    # TCGA Clinical Data Resource survival endpoints (Liu et al., Cell 2018)
    "survival": f"{TCGA_HUB}/survival%2FGBMLGG_survival.txt",
    # PanCanAtlas molecular subtypes, incl. pan-glioma (Ceccarelli et al., Cell 2016)
    "subtype": f"{PANCAN_HUB}/TCGASubtype.20170308.tsv.gz",
}

# Pan-glioma DNA methylation subtypes split cleanly by IDH status
# (Ceccarelli et al., Cell 2016, Figure 2).
IDH_MUTANT = {"Codel", "G-CIMP-high", "G-CIMP-low"}
IDH_WILDTYPE = {"Classic-like", "Mesenchymal-like", "LGm6-GBM", "PA-like"}

N_GENES = 2000
N_COMPONENTS = 50
SEED = 42


def fetch(name: str, cache_dir: Path) -> Path:
    url = SOURCES[name]
    path = cache_dir / url.rsplit("/", 1)[-1].replace("%2F", "_")
    if not path.exists():
        print(f"Downloading {name}: {url}")
        cache_dir.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(path)
    return path


def read_tsv(path: Path, **kwargs) -> pd.DataFrame:
    return pd.read_csv(path, sep="\t", index_col=0, low_memory=False, **kwargs)


def load(cache_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (expression: samples x genes, annotations: samples x fields)."""
    expr = read_tsv(fetch("expression", cache_dir)).T
    clinical = read_tsv(fetch("clinical", cache_dir))
    survival = read_tsv(fetch("survival", cache_dir))
    subtype = read_tsv(fetch("subtype", cache_dir))

    # Primary tumors only: sample type code "01" in TCGA-XX-XXXX-01.
    expr = expr[expr.index.str.endswith("-01")]

    glioma = subtype["Subtype_Selected"].str.removeprefix("GBM_LGG.")
    glioma = glioma[subtype["Subtype_Selected"].str.startswith("GBM_LGG.")]
    glioma = glioma.where(glioma != "NA")
    idh = glioma.map(
        lambda s: "Mutant" if s in IDH_MUTANT else "Wildtype" if s in IDH_WILDTYPE else None
    )

    disease = clinical["_primary_disease"].map(
        {"glioblastoma multiforme": "GBM", "brain lower grade glioma": "LGG"}
    )
    grade = clinical["neoplasm_histologic_grade"].where(
        clinical["neoplasm_histologic_grade"].isin(["G2", "G3"])
    )
    # TCGA only grades LGG; every GBM is WHO grade 4.
    grade = grade.mask(disease == "GBM", "G4")

    annotations = pd.DataFrame(
        {
            "disease": disease,
            "subtype": glioma,
            "idh": idh,
            "grade": grade,
            "histology": clinical["histological_type"],
            "gender": clinical["gender"].str.title(),
            "age": clinical["age_at_initial_pathologic_diagnosis"],
            "os_days": survival["OS.time"],
            "os_event": survival["OS"],
        }
    ).reindex(expr.index)
    return expr, annotations


def reduce(expr: pd.DataFrame) -> np.ndarray:
    """Top variable genes -> per-gene z-score -> PCA."""
    top = expr.var().nlargest(N_GENES).index
    scaled = StandardScaler().fit_transform(expr[top])
    return PCA(n_components=N_COMPONENTS, random_state=SEED).fit_transform(scaled)


def embed(pcs: np.ndarray, n_neighbors: int = 15, min_dist: float = 0.1) -> np.ndarray:
    reducer = umap.UMAP(
        n_neighbors=n_neighbors, min_dist=min_dist, random_state=SEED
    )
    return reducer.fit_transform(pcs)


def to_records(coords: np.ndarray, annotations: pd.DataFrame) -> list[dict]:
    df = annotations.copy()
    df.insert(0, "id", df.index)
    df.insert(1, "x", coords[:, 0].round(4))
    df.insert(2, "y", coords[:, 1].round(4))
    df["age"] = df["age"].astype("Int64")
    df["os_days"] = df["os_days"].astype("Int64")
    df["os_event"] = df["os_event"].astype("Int64")
    df = df.astype(object).where(df.notna(), None)
    return df.to_dict(orient="records")


def compare_neighbors(pcs: np.ndarray, annotations: pd.DataFrame, out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    values = [5, 15, 50]
    colors = annotations["subtype"].fillna("Unknown")
    categories = sorted(colors.unique(), key=lambda c: (c == "Unknown", c))
    palette = dict(zip(categories, plt.get_cmap("tab10").colors))
    palette["Unknown"] = "#c8c8c8"

    fig, axes = plt.subplots(1, len(values), figsize=(15, 5))
    for ax, n in zip(axes, values):
        coords = embed(pcs, n_neighbors=n)
        for category in categories:
            mask = (colors == category).to_numpy()
            ax.scatter(*coords[mask].T, s=6, color=palette[category], label=category)
        ax.set_title(f"n_neighbors = {n}")
        ax.set_xticks([])
        ax.set_yticks([])
    axes[-1].legend(markerscale=3, fontsize=8, loc="center left", bbox_to_anchor=(1, 0.5))
    fig.suptitle("TCGA glioma primary tumors, colored by pan-glioma subtype")
    fig.tight_layout()
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=120)
    print(f"Wrote {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "data" / "umap.json")
    parser.add_argument("--compare", action="store_true", help="also plot n_neighbors 5/15/50")
    args = parser.parse_args()

    expr, annotations = load(args.cache_dir)
    print(f"{len(expr)} primary tumors x {expr.shape[1]} genes")
    pcs = reduce(expr)
    coords = embed(pcs)

    payload = {
        "meta": {
            "samples": len(expr),
            "genes": N_GENES,
            "pca_components": N_COMPONENTS,
            "umap": {"n_neighbors": 15, "min_dist": 0.1, "random_state": SEED},
            "sources": SOURCES,
        },
        "samples": to_records(coords, annotations),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"Wrote {args.out} ({args.out.stat().st_size // 1024} KiB)")

    if args.compare:
        compare_neighbors(pcs, annotations, ROOT / "docs" / "n_neighbors.png")


if __name__ == "__main__":
    main()

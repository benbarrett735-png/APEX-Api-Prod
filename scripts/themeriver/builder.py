import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from typing import Dict, Any
from core.validators import validate_themeriver

# Color scheme from user's sample
colors = ["#4080FF", "#57A9FB", "#37D4CF", "#23C343", "#FBE842", "#FF9A2E", "#A9AEB8"]

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_themeriver(payload)
    x_labels = payload["x"]
    series = payload["series"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 880))
    height = int(opt.get("height", 640))
    dpi = int(opt.get("dpi", 300))
    grid = bool(opt.get("grid", True))
    rot = int(opt.get("label_rotation", 0))
    baseline = opt.get("baseline", "wiggle")  # "wiggle" or "sym"
    alpha = float(opt.get("alpha", 0.8))
    
    # Set font
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False
    
    # Prepare data
    X = np.arange(len(x_labels))
    Y = []
    for s in series:
        Y.append(np.array([float(v) for v in s["values"]], dtype=float))
    Y = np.vstack(Y)
    
    # Create figure
    fig, ax = plt.subplots(figsize=(width/dpi, height/dpi), dpi=dpi)
    
    # Stackplot with user's styling
    polys = ax.stackplot(
        X, Y, 
        colors=colors[:Y.shape[0]], 
        baseline=baseline, 
        alpha=alpha,
        labels=[s["name"] for s in series]
    )
    
    # Smooth edges
    for p in polys:
        p.set_linewidth(0)
    
    # Styling from user's sample
    ax.set_title(title, fontsize=16)
    ax.set_xlim(X.min(), X.max())
    ax.set_xticks(X)
    ax.set_xticklabels(x_labels, rotation=rot)
    
    # Grid
    ax.grid(True, linestyle="--", alpha=0.6, color="lightgray")
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")
    
    # Legend if multiple series
    if len(series) > 1:
        ax.legend(loc="upper left", fontsize=10)
    
    plt.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from typing import Dict, Any
from core.validators import validate_heatmap
from core.base_style import apply_theme, figsize

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_heatmap(payload)
    x = payload["x"]; y = payload["y"]; M = np.array(payload["values"], dtype=float)
    title = payload.get("title", ""); opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 880)); height = int(opt.get("height", 640)); dpi = int(opt.get("dpi", 300))  # Higher DPI
    grid = bool(opt.get("grid", True)); square = bool(opt.get("square", False))
    vmin = opt.get("vmin", None); vmax = opt.get("vmax", None)
    show_cbar = bool(opt.get("show_colorbar", False))
    rot = int(opt.get("label_rotation", 0))
    show_values = bool(opt.get("show_values", True))  # Show cell values by default
    
    # Use viridis colormap by default (modern look), but allow override
    cmap_name = opt.get("cmap", "viridis")
    if cmap_name in ["orange", "nomad"]:
        # Legacy orange colormap
        cmap_low = opt.get("cmap_low", "#FEF3E7")
        cmap_mid = opt.get("cmap_mid", "#F59E0B")
        cmap_high = opt.get("cmap_high", "#D97706")
        cmap = LinearSegmentedColormap.from_list("NomadOrange", [cmap_low, cmap_mid, cmap_high], N=256)
    else:
        cmap = cmap_name  # Use matplotlib's built-in colormaps

    fig, ax = plt.subplots(figsize=figsize(width, height, dpi), dpi=dpi)
    apply_theme(ax, grid=False)  # we'll draw cell gridlines ourselves
    ax.set_title(title)

    aspect = "equal" if square else "auto"
    im = ax.imshow(M, cmap=cmap, vmin=vmin, vmax=vmax, origin="lower", aspect=aspect)

    # Add numbers in cells (modern heatmap style)
    if show_values:
        for i in range(len(y)):
            for j in range(len(x)):
                text = ax.text(j, i, f'{M[i, j]:.1f}',
                             ha="center", va="center", color="white", fontsize=10, weight="bold")

    # axes & labels
    ax.set_xticks(range(len(x))); ax.set_xticklabels(x, rotation=rot)
    ax.set_yticks(range(len(y))); ax.set_yticklabels(y)

    # subtle white gridlines between cells
    ax.set_xticks(np.arange(-.5, len(x), 1), minor=True)
    ax.set_yticks(np.arange(-.5, len(y), 1), minor=True)
    ax.grid(which="minor", color="white", linestyle="-", linewidth=1.2, alpha=0.8)
    ax.tick_params(which="minor", bottom=False, left=False)

    # optional background grid (very subtle) on major ticks, to match your style loosely
    if grid:
        ax.grid(which="major", color="#E5E7EB", linestyle="-", linewidth=1, alpha=0.25)

    if show_cbar:
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

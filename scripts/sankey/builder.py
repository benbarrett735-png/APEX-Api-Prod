import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch, FancyBboxPatch
from typing import Dict, Any, List
from core.validators import validate_sankey

# Color scheme from user's sample
colors = ["#4080FF", "#57A9FB", "#37D4CF", "#23C343", "#FBE842", "#FF9A2E", "#A9AEB8"]

def _stack_positions(sizes: List[float], padding_px: float) -> List[float]:
    y = 0.0
    ys = []
    for h in sizes:
        ys.append(y)
        y += h + padding_px
    return ys

def _bezier_ribbon(x0, y0, x1, y1, w0, w1, bend):
    cx0 = x0 + bend * (x1 - x0)
    cx1 = x1 - bend * (x1 - x0)
    verts = [
        (x0, y0 + w0), (cx0, y0 + w0), (cx1, y1 + w1), (x1, y1 + w1),
        (x1, y1), (cx1, y1), (cx0, y0), (x0, y0),
        (x0, y0 + w0)
    ]
    codes = [Path.MOVETO, Path.CURVE4, Path.CURVE4, Path.CURVE4,
             Path.LINETO, Path.CURVE4, Path.CURVE4, Path.CURVE4,
             Path.CLOSEPOLY]
    return Path(verts, codes)

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_sankey(payload)
    nodes = payload["nodes"]
    links = payload["links"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 880))
    height = int(opt.get("height", 640))
    dpi = int(opt.get("dpi", 300))
    grid = bool(opt.get("grid", True))
    node_width_frac = float(opt.get("node_width", 0.035))
    node_pad = float(opt.get("node_padding", 6.0))
    bend = float(opt.get("curvature", 0.35))
    alpha = float(opt.get("alpha", 0.7))  # Increased alpha for visibility

    # Build column map
    by_col = {}
    for n in nodes:
        by_col.setdefault(n["col"], []).append(n)
    cols_sorted = sorted(by_col.keys())
    col_index = {c: i for i, c in enumerate(cols_sorted)}
    ncols = len(cols_sorted)

    # Sum flows per node
    in_sums = {n["id"]: 0.0 for n in nodes}
    out_sums = {n["id"]: 0.0 for n in nodes}
    for e in links:
        out_sums[e["source"]] += float(e["value"])
        in_sums[e["target"]] += float(e["value"])

    node_size_units = {n["id"]: max(in_sums[n["id"]], out_sums[n["id"]], 0.0) for n in nodes}
    max_in_col = {c: sum(node_size_units[n["id"]] for n in by_col[c]) for c in cols_sorted}
    global_max = max(max_in_col.values()) if max_in_col else 1.0

    usable_h_px = height * 0.85
    unit_to_px = usable_h_px / global_max

    # Create figure with styling
    fig, ax = plt.subplots(figsize=(width/dpi, height/dpi), dpi=dpi)
    ax.set_title(title, fontsize=16, pad=15)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, usable_h_px)
    ax.axis("off")
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")

    # Grid
    if grid:
        for val in np.arange(0, usable_h_px, usable_h_px/10):
            ax.axhline(val, color="lightgray", linewidth=1, alpha=0.3, linestyle="--")

    # X positions
    x_positions = np.linspace(0.1, 0.9, ncols)
    node_w = node_width_frac * 1.2

    # Node layout
    node_layout = {}
    for c in cols_sorted:
        nodes_c = by_col[c]
        heights_px = [node_size_units[n["id"]] * unit_to_px for n in nodes_c]
        ys = _stack_positions(heights_px, node_pad * 1.5)
        
        if heights_px:
            total = ys[-1] + heights_px[-1]
            y_offset = (usable_h_px - total) / 2.0
        else:
            y_offset = usable_h_px / 2.0
            
        for n, h, y in zip(nodes_c, heights_px, ys):
            node_layout[n["id"]] = {"x0": x_positions[col_index[c]], "y0": y + y_offset, "h": h}

    # Track offsets
    out_offset = {n["id"]: 0.0 for n in nodes}
    in_offset = {n["id"]: 0.0 for n in nodes}

    # Draw links with colors
    for i, e in enumerate(links):
        s = node_layout[e["source"]]
        t = node_layout[e["target"]]
        x0 = s["x0"] + node_w/2.0
        x1 = t["x0"] - node_w/2.0
        h_px = float(e["value"]) * unit_to_px
        y0 = s["y0"] + out_offset[e["source"]]
        y1 = t["y0"] + in_offset[e["target"]]
        
        path = _bezier_ribbon(x0, y0, x1, y1, h_px, h_px, bend)
        color = e.get("color", colors[i % len(colors)])
        patch = PathPatch(path, facecolor=color, edgecolor="none", alpha=alpha, zorder=1)
        ax.add_patch(patch)
        
        out_offset[e["source"]] += h_px
        in_offset[e["target"]] += h_px

    # Draw nodes
    for i, n in enumerate(nodes):
        lay = node_layout[n["id"]]
        node_color = n.get("color", "#E5E7EB")
        rect = FancyBboxPatch(
            (lay["x0"] - node_w/2.0, lay["y0"]), 
            node_w, lay["h"],
            boxstyle="round,pad=0,rounding_size=2",
            linewidth=1, 
            facecolor=node_color, 
            edgecolor="#9CA3AF", 
            zorder=2
        )
        ax.add_patch(rect)
        
        if n.get("label", ""):
            ax.text(lay["x0"], lay["y0"] + lay["h"]/2.0, n["label"],
                   ha="center", va="center", fontsize=10, color="#111827", 
                   weight="bold", zorder=3)

    plt.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

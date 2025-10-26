import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from typing import Dict, Any
from core.base_style import apply_theme, figsize, PALETTE_DEFAULT
from core.utils import resolve_colors, nice_upper_bound, coerce_numeric_array
from core.validators import validate_bar

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_bar(payload)
    x = payload["x"]
    series = payload["series"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 880))
    height = int(opt.get("height", 640))
    dpi = int(opt.get("dpi", 300))  # Higher DPI for better quality
    legend = bool(opt.get("legend", False))
    grid = bool(opt.get("grid", True))
    rot = int(opt.get("label_rotation", 0))
    colors_opt = opt.get("colors")
    stacked = bool(opt.get("stacked", False))

    colors = resolve_colors(len(series), colors_opt, PALETTE_DEFAULT)

    fig, ax = plt.subplots(figsize=figsize(width, height, dpi), dpi=dpi)
    apply_theme(ax, grid=grid)

    n = len(x)
    idx = np.arange(n)
    ymax = 0.0

    if len(series) == 1 or stacked:
        bottom = np.zeros(n)
        for i, s in enumerate(series):
            vals = coerce_numeric_array(s["values"])
            ymax = max(ymax, float(np.nanmax(vals + bottom)))
            ax.bar(idx, vals, bottom=bottom if stacked else None, color=colors[i], alpha=0.9, edgecolor="none",
                   label=s["name"])
            if stacked:
                bottom += vals
        ax.set_xticks(idx, x)
    else:
        # grouped bars
        m = len(series)
        total_width = 0.8
        bar_w = total_width / m
        offsets = np.linspace(-total_width/2 + bar_w/2, total_width/2 - bar_w/2, m)
        for i, s in enumerate(series):
            vals = coerce_numeric_array(s["values"])
            ymax = max(ymax, float(np.nanmax(vals)))
            ax.bar(idx + offsets[i], vals, width=bar_w, color=colors[i], alpha=0.9, edgecolor="none", label=s["name"])
        ax.set_xticks(idx, x)

    yopt = (opt.get("y_axis") or {})
    step = yopt.get("tick_step", 10)
    upper = yopt.get("max", None)
    lower = yopt.get("min", 0)
    if upper is None:
        upper = nice_upper_bound(ymax, step)
    ax.set_ylim(bottom=lower if lower is not None else 0, top=upper)

    ax.set_title(title)
    
    # Ensure x-axis labels are always rotated to prevent overlap
    rotation = max(rot, 45)  # Always rotate at least 45 degrees
    ax.tick_params(axis='x', rotation=rotation)
    
    # Set tick label alignment for better readability
    for label in ax.get_xticklabels():
        label.set_ha('right')
        label.set_rotation(rotation)
    
    # Add axis labels
    x_axis_label = opt.get("x_axis_label", "")
    y_axis_label = opt.get("y_axis_label", "")
    if x_axis_label:
        ax.set_xlabel(x_axis_label)
    if y_axis_label:
        ax.set_ylabel(y_axis_label)
    
    if legend and len(series) > 1:
        ax.legend(frameon=False, loc="upper left")

    # fig.tight_layout()  # Disabled due to font issues
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path


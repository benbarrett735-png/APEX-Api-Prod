import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from typing import Dict, Any
from charts.core.base_style import apply_theme, figsize, PALETTE_DEFAULT
from charts.core.utils import resolve_colors, nice_upper_bound, coerce_numeric_array
from charts.core.validators import validate_line

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_line(payload)
    x = payload["x"]
    series = payload["series"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 800))
    height = int(opt.get("height", 600))
    dpi = int(opt.get("dpi", 300))  # Higher DPI for better quality
    legend = bool(opt.get("legend", False))
    grid = bool(opt.get("grid", True))
    rot = int(opt.get("label_rotation", 0))
    colors_opt = opt.get("colors")
    show_points = bool(opt.get("show_points", True))  # Default to True for modern look
    fill_under = bool(opt.get("fill_under", len(series) == 1))  # default True if single series

    colors = resolve_colors(len(series), colors_opt, PALETTE_DEFAULT)

    fig, ax = plt.subplots(figsize=figsize(width, height, dpi), dpi=dpi)
    apply_theme(ax, grid=grid)

    ymax = 0.0
    for i, s in enumerate(series):
        y = coerce_numeric_array(s["values"])
        ymax = max(ymax, float(np.nanmax(y)))
        # Plot line with markers by default
        marker_style = 'o' if show_points else None
        line, = ax.plot(x, y, linewidth=3.0, color=colors[i], label=s["name"], 
                       solid_capstyle="round", marker=marker_style, markersize=8)
        if fill_under and len(series) == 1:
            ax.fill_between(x, 0, y, alpha=0.12, color=colors[i])

    # y-axis nice bounds (match sample vibe: round to step 10 when possible)
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


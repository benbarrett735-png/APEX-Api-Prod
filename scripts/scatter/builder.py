import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from typing import Dict, Any
from core.base_style import apply_theme, figsize, PALETTE_DEFAULT
from core.utils import resolve_colors
from core.validators import validate_scatter

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_scatter(payload)
    x = payload["x"]
    series = payload["series"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 800))
    height = int(opt.get("height", 600))
    dpi = int(opt.get("dpi", 300))  # Higher DPI for better quality
    legend = bool(opt.get("legend", True))
    grid = bool(opt.get("grid", True))
    colors_opt = opt.get("colors")
    rot = int(opt.get("label_rotation", 0))

    colors = resolve_colors(len(series), colors_opt, PALETTE_DEFAULT)

    fig, ax = plt.subplots(figsize=figsize(width, height, dpi), dpi=dpi)
    apply_theme(ax, grid=grid)

    # For scatter plots, x should be numeric values, not categories
    x_values = np.array(x, dtype=float)

    for i, s in enumerate(series):
        y_values = np.array(s["values"], dtype=float)
        
        # Ensure x and y have the same length
        min_len = min(len(x_values), len(y_values))
        x_plot = x_values[:min_len]
        y_plot = y_values[:min_len]
        
        ax.scatter(
            x_plot, 
            y_plot, 
            c=colors[i % len(colors)],
            label=s["name"],
            alpha=0.7,  # Soft transparency for modern look
            s=100  # Larger point size for better visibility
        )

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
    return out_path

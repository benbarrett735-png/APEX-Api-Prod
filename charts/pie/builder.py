import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from typing import Dict, Any
from charts.core.base_style import apply_theme, figsize, PALETTE_DEFAULT
from charts.core.utils import resolve_colors
from charts.core.validators import validate_pie

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_pie(payload)
    x = payload["x"]
    series = payload["series"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 800))
    height = int(opt.get("height", 600))
    dpi = int(opt.get("dpi", 300))  # Higher DPI for better quality
    legend = bool(opt.get("legend", True))
    colors_opt = opt.get("colors")

    # For pie charts, we typically use the first series
    if not series or len(series) == 0:
        raise ValueError("No series data provided for pie chart")
    
    first_series = series[0]
    values = first_series.get("values", [])
    labels = x if len(x) == len(values) else [f"Item {i+1}" for i in range(len(values))]

    colors = resolve_colors(len(values), colors_opt, PALETTE_DEFAULT)

    fig, ax = plt.subplots(figsize=figsize(width, height, dpi), dpi=dpi)
    apply_theme(ax, grid=False)  # No grid for pie charts

    # Create full pie chart (no donut hole for cleaner modern look)
    wedges, texts, autotexts = ax.pie(
        values,
        labels=labels,
        colors=colors,
        autopct='%1.1f%%',
        startangle=90
    )

    # Style the text
    for autotext in autotexts:
        autotext.set_color('white')
        autotext.set_fontweight('bold')
        autotext.set_fontsize(10)

    for text in texts:
        text.set_fontsize(11)

    ax.set_title(title)
    
    # Add legend if requested
    if legend and len(values) > 1:
        ax.legend(wedges, labels, title="Categories", loc="center left", bbox_to_anchor=(1, 0, 0.5, 1))

    # fig.tight_layout()  # Disabled due to font issues
    fig.savefig(out_path, bbox_inches="tight")
    return out_path

import numpy as np
import matplotlib.pyplot as plt
from typing import Dict, Any
from charts.core.base_style import apply_theme, figsize
from charts.core.validators import validate_stackedbar

def resolve_colors(n_series, colors_opt, default_colors):
    """Resolve colors for the series"""
    if colors_opt and len(colors_opt) >= n_series:
        return colors_opt[:n_series]
    # Extend default colors if needed
    colors = default_colors[:]
    while len(colors) < n_series:
        colors.extend(default_colors)
    return colors[:n_series]

def nice_upper_bound(value, step):
    """Calculate a nice upper bound for the axis"""
    if value <= 0:
        return step
    return step * ((int(value / step) + 1) if value % step == 0 else int(value / step) + 1)

def coerce_numeric_array(values):
    """Convert array to numeric, handling any string numbers"""
    return np.array([float(v) for v in values], dtype=float)

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_stackedbar(payload)
    x = payload["x"]; series = payload["series"]; title = payload.get("title","")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 880)); height = int(opt.get("height", 640)); dpi = int(opt.get("dpi", 300))
    grid = bool(opt.get("grid", True)); rot = int(opt.get("label_rotation", 0))
    yopt = opt.get("y_axis", {}) or {}; y_min = yopt.get("min", 0); y_max = yopt.get("max", None); step = yopt.get("tick_step", 10)
    bar_w = float(opt.get("bar_width", 0.75)); legend = bool(opt.get("legend", False))
    colors = resolve_colors(len(series), opt.get("colors"), [ "#4080FF", "#57A9FB", "#37D4CF", "#23C343", "#FBE842", "#FF9A2E", "#A9AEB8" ])

    n = len(x); idx = np.arange(n); bottom = np.zeros(n); ymax = 0.0

    fig, ax = plt.subplots(figsize=figsize(width,height,dpi), dpi=dpi)
    apply_theme(ax, grid=grid); ax.set_title(title)

    for i, s in enumerate(series):
        vals = coerce_numeric_array(s["values"])
        ymax = max(ymax, float(np.nanmax(vals + bottom)))
        ax.bar(idx, vals, bottom=bottom, width=bar_w, color=colors[i], edgecolor="none", alpha=0.95, label=s["name"])
        bottom += vals

    if y_max is None:
        y_max = nice_upper_bound(max(ymax,1.0), step)
    ax.set_ylim(bottom=y_min if y_min is not None else 0, top=y_max)

    ax.set_xticks(idx); ax.set_xticklabels(x, rotation=rot)
    if legend and len(series) > 1:
        ax.legend(frameon=False, loc="upper left")

    fig.tight_layout(); fig.savefig(out_path, bbox_inches="tight"); plt.close(fig)
    return out_path

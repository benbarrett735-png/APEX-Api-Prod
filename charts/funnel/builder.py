import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon
from typing import Dict, Any
from charts.core.validators import validate_funnel
from charts.core.base_style import figsize

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_funnel(payload)
    stages = payload["stages"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 880)); height = int(opt.get("height", 640)); dpi = int(opt.get("dpi", 300))
    normalize = bool(opt.get("normalize", True))
    bar_h = float(opt.get("bar_height", 0.12))
    gap = float(opt.get("gap", 0.06))
    round_px = float(opt.get("round_px", 8))
    color_top = opt.get("color_top", "#4080FF")
    color_other = opt.get("color_others", "#57A9FB")
    text_color = opt.get("text_color", "#1D4ED8")
    show_sil = bool(opt.get("show_funnel_silhouette", True))
    sil_color = opt.get("silhouette_color", "#93C5FD")
    sil_alpha = float(opt.get("silhouette_alpha", 0.18))

    vals = np.array([float(s["value"]) for s in stages], dtype=float)
    base = vals[0] if normalize else np.max(vals)
    widths = np.clip(vals / base, 0.02, 1.0)  # fractions of full width

    # canvas
    fig, ax = plt.subplots(figsize=figsize(width, height, dpi), dpi=dpi)
    fig.set_facecolor("white"); ax.set_facecolor("white")
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.axis("off")
    if title:
        ax.set_title(title, pad=12)

    # compute vertical positions (top to bottom)
    total_h = len(stages) * bar_h + (len(stages) - 1) * gap
    top_y = (1 - total_h) / 2.0 + (len(stages) - 1) * (bar_h + gap)
    ys = [top_y - i * (bar_h + gap) for i in range(len(stages))]

    # background silhouette (trapezoids)
    if show_sil and len(stages) >= 2:
        for i in range(len(stages) - 1):
            w1 = widths[i]; w2 = widths[i + 1]
            cy1 = ys[i] + bar_h / 2.0
            cy2 = ys[i + 1] + bar_h / 2.0
            poly = Polygon([
                (0.5 - w1/2, cy1), (0.5 + w1/2, cy1),
                (0.5 + w2/2, cy2), (0.5 - w2/2, cy2)
            ], closed=True, facecolor=sil_color, edgecolor="none", alpha=sil_alpha, zorder=0)
            ax.add_patch(poly)

    # bars
    for i, (stage, w, y) in enumerate(zip(stages, widths, ys)):
        x0 = 0.5 - w/2.0
        color = color_top if i == 0 else color_other
        rect = FancyBboxPatch((x0, y), w, bar_h,
                              boxstyle=f"round,pad=0,rounding_size={round_px}",
                              linewidth=0, facecolor=color, zorder=2)
        ax.add_patch(rect)
        ax.text(0.5, y + bar_h/2.0, stage["label"], ha="center", va="center",
                fontsize=12, color=text_color, zorder=3)

    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

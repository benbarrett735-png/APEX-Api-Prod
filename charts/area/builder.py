import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from typing import Dict, Any
from charts.core.validators import validate_area

# Color scheme from user's sample
colors = ["#4080FF", "#57A9FB", "#37D4CF", "#23C343", "#FBE842", "#FF9A2E", "#A9AEB8"]

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_area(payload)
    x = payload["x"]
    series = payload["series"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 800))
    height = int(opt.get("height", 600))
    dpi = int(opt.get("dpi", 300))
    legend = bool(opt.get("legend", False))
    stacked = bool(opt.get("stacked", True))
    
    # Set font (fallback to sans-serif)
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False

    # Create figure with exact styling from user's sample
    fig, ax = plt.subplots(figsize=(width/dpi, height/dpi), dpi=dpi)
    
    # Prepare data arrays
    Y = []
    for s in series:
        Y.append(np.array([float(v) for v in s["values"]], dtype=float))
    
    # Use stackplot exactly as in user's sample
    ax.stackplot(x, *Y, labels=[s["name"] for s in series], colors=colors[:len(Y)], alpha=0.8)
    
    # Styling from user's sample
    ax.set_title(title, fontsize=16)
    ax.set_xlabel(opt.get("x_axis_label", ""), fontsize=12)
    ax.set_ylabel(opt.get("y_axis_label", ""), fontsize=12)
    
    if legend and len(series) > 1:
        ax.legend(loc='upper left', fontsize=10)
    
    # Grid styling from user's sample
    ax.grid(True, linestyle='--', alpha=0.6, color='lightgray')
    ax.set_facecolor('white')
    fig.patch.set_facecolor('white')
    
    # Rotate x labels
    plt.tick_params(axis='x', rotation=45)
    plt.tight_layout()
    
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

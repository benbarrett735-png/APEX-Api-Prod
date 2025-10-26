import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd
from typing import Dict, Any
from core.validators import validate_bubble

# Color scheme from user's sample
colors = ["#4080FF", "#57A9FB", "#37D4CF", "#23C343", "#FBE842", "#FF9A2E", "#A9AEB8"]

def build(payload: Dict, out_path: str) -> str:
    validate_bubble(payload)
    x = payload["x"]
    series = payload["series"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 800))
    height = int(opt.get("height", 600))
    dpi = int(opt.get("dpi", 300))
    legend = bool(opt.get("legend", True))
    
    # Set font
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False
    
    # Build DataFrame for bubble chart
    data_rows = []
    for i, s in enumerate(series):
        for j, (x_val, y_val) in enumerate(zip(x, s["values"])):
            size = s.get("sizes", [100] * len(x))[j] if j < len(s.get("sizes", [])) else 100
            data_rows.append({
                "X_Value": float(x_val) if isinstance(x_val, (int, float)) else j,
                "Y_Value": float(y_val),
                "Size": size,
                "Color_Group": s["name"]
            })
    
    df = pd.DataFrame(data_rows)
    
    # Create figure
    fig, ax = plt.subplots(figsize=(width/dpi, height/dpi), dpi=dpi)
    
    # Plot bubbles for each group (like user's sample with seaborn style)
    for i, group in enumerate(df["Color_Group"].unique()):
        group_data = df[df["Color_Group"] == group]
        ax.scatter(
            group_data["X_Value"],
            group_data["Y_Value"],
            s=group_data["Size"],
            c=colors[i % len(colors)],
            alpha=0.7,
            edgecolors="w",
            linewidth=0.5,
            label=group
        )
    
    # Styling from user's sample
    ax.set_title(title, fontsize=16)
    ax.set_xlabel(opt.get("x_axis_label", "X Value"), fontsize=12)
    ax.set_ylabel(opt.get("y_axis_label", "Y Value"), fontsize=12)
    ax.grid(True, linestyle=":", alpha=0.6, color="lightgray")
    
    if legend:
        ax.legend(bbox_to_anchor=(1.05, 1), loc="upper left", fontsize=10)
    
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")
    
    plt.tight_layout()
    fig.savefig(out_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    return out_path

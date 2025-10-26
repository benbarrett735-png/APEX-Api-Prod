import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from typing import Dict, Any
from core.validators import validate_radar

# Color scheme from user's sample
colors = ["#4080FF", "#57A9FB", "#37D4CF", "#23C343", "#FBE842", "#FF9A2E", "#A9AEB8"]

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_radar(payload)
    labels = payload["axes"]
    series = payload["series"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 880))
    height = int(opt.get("height", 640))
    dpi = int(opt.get("dpi", 300))
    
    # Set font
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False
    
    N = len(labels)
    angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
    angles_closed = angles + [angles[0]]
    
    # Create polar plot
    fig = plt.figure(figsize=(width/dpi, height/dpi), dpi=dpi)
    ax = fig.add_subplot(111, polar=True)
    
    # Styling
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")
    
    # Set theta offset and direction
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    
    # Grid styling - dashed like user's sample
    ax.grid(True, color="lightgray", linewidth=1.0, alpha=0.6, linestyle="--")
    ax.spines["polar"].set_color("lightgray")
    
    # Set labels
    ax.set_thetagrids(np.degrees(angles), labels, fontsize=10)
    
    # Calculate max value for radial axis
    rmax = 0
    for s in series:
        rmax = max(rmax, max(float(v) for v in s["values"]))
    rmax = int(np.ceil(rmax / 10)) * 10  # Round up to nearest 10
    
    ax.set_ylim(0, rmax)
    ax.set_rgrids(np.linspace(rmax/5, rmax, 5), angle=90, fontsize=8)
    
    # Plot each series
    for i, s in enumerate(series):
        vals = [float(v) for v in s["values"]]
        vals_closed = vals + [vals[0]]
        color = colors[i % len(colors)]
        
        ax.plot(angles_closed, vals_closed, color=color, linewidth=2.5, label=s["name"])
        ax.fill(angles_closed, vals_closed, color=color, alpha=0.25)
    
    # Title and legend
    ax.set_title(title, pad=20, fontsize=16)
    if len(series) > 1:
        ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.1), fontsize=10)
    
    plt.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

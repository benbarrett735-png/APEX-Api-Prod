import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from typing import Dict, Any, List, Tuple
from core.validators import validate_treemap
from core.base_style import figsize

def _squarify(values: List[float], x: float, y: float, w: float, h: float, padding: float) -> List[Tuple[float,float,float,float]]:
    """
    Pure Python squarified treemap (Bruls et al.). Returns list of (x,y,w,h).
    """
    vals = np.array(values, dtype=float)
    vals = vals / vals.sum() * (w*h)
    rects = []
    def worst_ratio(row, W):
        if not row: return float('inf')
        s = sum(row); m = max(row); n = min(row)
        return max((W**2)*m/(s**2), (s**2)/(W**2*n))  # aspect ratio
    def layout(row, x, y, W, H, horizontal=True):
        s = sum(row)
        if horizontal:
            hh = s / W
            xx = x
            for r in row:
                ww = r / hh
                rects.append((xx+padding, y+padding, ww-2*padding, hh-2*padding))
                xx += ww
            return x, y+hh, W, H-hh
        else:
            ww = s / H
            yy = y
            for r in row:
                hh = r / ww
                rects.append((x+padding, yy+padding, ww-2*padding, hh-2*padding))
                yy += hh
            return x+ww, y, W-ww, H
    row = []; i = 0
    cur_x, cur_y, cur_w, cur_h = x, y, w, h
    horizontal = True
    while i < len(vals):
        v = vals[i]
        if not row or worst_ratio(row+[v], min(cur_w, cur_h)) <= worst_ratio(row, min(cur_w, cur_h)):
            row.append(v); i += 1
        else:
            cur_x, cur_y, cur_w, cur_h = layout(row, cur_x, cur_y, cur_w, cur_h, horizontal)
            row = []; horizontal = not horizontal
    if row:
        layout(row, cur_x, cur_y, cur_w, cur_h, horizontal)
    return rects

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_treemap(payload)
    items = payload["items"]
    opt = payload.get("options", {}) or {}
    width = int(opt.get("width", 880)); height = int(opt.get("height", 640)); dpi = int(opt.get("dpi", 300))
    padding = float(opt.get("padding_px", 6.0))
    # Create a vibrant color palette matching Plotly style
    default_palette = {
        "Machine Learning": "#4080FF",      # Blue
        "Deep Learning": "#23C343",         # Green  
        "NLP": "#FBE842",                   # Yellow
        "Computer Vision": "#FF9A2E",       # Orange
        "Robotics": "#8B5CF6",              # Purple
        "Cloud AI": "#37D4CF",              # Cyan
        "Research": "#57A9FB",              # Light Blue
        "Applications": "#FF9A2E",          # Orange
        "Infrastructure": "#4080FF",        # Blue
        "Data Science": "#37D4CF",          # Teal
        "AI Tools": "#A9AEB8",              # Gray
        "Platforms": "#23C343"              # Green
    }
    palette = opt.get("palette", default_palette)
    radius = float(opt.get("border_radius", 6.0))
    title = payload.get("title", "")

    vals = [float(it["value"]) for it in items]
    rects = _squarify(vals, 0, 0, 1, 1, padding=padding/ max(width,height))  # normalized coords

    fig, ax = plt.subplots(figsize=figsize(width, height, dpi), dpi=dpi)
    fig.set_facecolor("white"); ax.set_facecolor("white")
    ax.set_xlim(0,1); ax.set_ylim(0,1); ax.axis("off")
    if title: ax.set_title(title, pad=12)

    # Get all available colors
    available_colors = list(palette.values())
    
    for i, ((rx, ry, rw, rh), it) in enumerate(zip(rects, items)):
        # Smart color assignment - try to match group first, then cycle through colors
        group = it.get("group", "")
        if group and group in palette:
            color = palette[group]
        else:
            # Cycle through available colors for variety
            color = available_colors[i % len(available_colors)]
        
        # Convert radius from px to data units ~ approximate
        scale = 1.0 / width
        patch = FancyBboxPatch((rx, ry), rw, rh, boxstyle=f"round,pad=0,rounding_size={radius*scale}",
                               facecolor=color, edgecolor="white", linewidth=2)
        ax.add_patch(patch)
        
        # Add text labels if rectangle is large enough
        if rw > 0.05 and rh > 0.05:  # Only show text if rectangle is big enough
            text_x = rx + rw/2
            text_y = ry + rh/2
            # Calculate font size based on rectangle size
            font_size = max(10, min(16, int(rw * width / 6)))
            
            # Better text styling with shadow effect
            ax.text(text_x + 0.002, text_y - 0.002, it["label"], ha="center", va="center", 
                   fontsize=font_size, color="black", weight="bold", alpha=0.8)
            ax.text(text_x, text_y, it["label"], ha="center", va="center", 
                   fontsize=font_size, color="white", weight="bold")

    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

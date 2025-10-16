import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Wedge
from typing import Dict, Any, Tuple, List
from charts.core.validators import validate_sunburst
from charts.core.base_style import figsize

def _hex_to_rgb(h): h = h.lstrip("#"); return tuple(int(h[i:i+2],16)/255 for i in (0,2,4))
def _lerp(a,b,t): return tuple(a[i]*(1-t)+b[i]*t for i in range(3))
def _rgb_to_hex(c): return "#" + "".join(f"{int(255*x):02X}" for x in c)

def _layout(node, start, span, depth, ring_thick, gap_rad, max_depth, slices):
    """ Recursively compute (inner_r, outer_r, theta1, theta2, label) for each node """
    if max_depth is not None and depth > max_depth: return
    inner = node["inner"]; outer = inner + ring_thick
    theta1 = start + gap_rad/2; theta2 = start + span - gap_rad/2
    slices.append((inner, outer, theta1, theta2, node["label"], depth, node["value"]))
    if "children" in node and node["children"]:
        total = sum(ch["value"] for ch in node["children"])
        a = start
        for ch in node["children"]:
            frac = ch["value"]/total if total > 0 else 0
            ch["inner"] = outer
            _layout(ch, a, span*frac, depth+1, ring_thick, gap_rad, max_depth, slices)
            a += span*frac

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_sunburst(payload)
    root = payload["root"]
    opt = payload.get("options", {}) or {}
    width = int(opt.get("width", 880)); height = int(opt.get("height", 640)); dpi = int(opt.get("dpi", 300))
    start_angle = float(opt.get("start_angle", 90))
    ring_thickness = float(opt.get("ring_thickness", 0.18))
    inner_frac = float(opt.get("inner_hole_frac", 0.38))
    gap_deg = float(opt.get("gap_deg", 1.5)); gap_rad = np.deg2rad(gap_deg)
    max_depth = opt.get("max_depth", None)
    show_labels = bool(opt.get("show_labels", False))
    c_base = _hex_to_rgb(opt.get("colors_base", "#4080FF"))  # Blue base
    c_str = _hex_to_rgb(opt.get("colors_strong", "#23C343"))  # Green strong

    # Normalize radii to unit circle
    root["inner"] = inner_frac
    slices = []
    _layout(root, np.deg2rad(start_angle), 2*np.pi, 0, ring_thickness, gap_rad, max_depth, slices)

    fig, ax = plt.subplots(figsize=figsize(width, height, dpi), dpi=dpi, subplot_kw=dict(aspect="equal"))
    fig.set_facecolor("white"); ax.set_facecolor("white"); ax.axis("off")

    max_depth_observed = max(d for *_, d, __ in slices)
    for inner, outer, t1, t2, lbl, depth, val in slices:
        t = depth / max(1, max_depth_observed)
        color = _rgb_to_hex(_lerp(c_base, c_str, min(1, t)))
        w = Wedge(center=(0,0), r=outer, theta1=np.rad2deg(t1), theta2=np.rad2deg(t2),
                  width=(outer-inner), facecolor=color, edgecolor="white", linewidth=1.2)
        ax.add_patch(w)
        if show_labels and (t2 - t1) > np.deg2rad(10):
            ang = (t1 + t2)/2
            r = (inner+outer)/2
            ax.text(r*np.cos(ang), r*np.sin(ang), lbl, ha="center", va="center", fontsize=9, color="#374151")

    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

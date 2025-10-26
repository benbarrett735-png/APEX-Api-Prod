import numpy as np
import matplotlib.pyplot as plt
from typing import Dict, Any
from core.validators import validate_candlestick
from core.base_style import apply_theme, figsize

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_candlestick(payload)
    x_labels = payload["x"]; rows = payload["ohlc"]
    opt = payload.get("options", {}) or {}; title = payload.get("title","")

    width = int(opt.get("width", 880)); height = int(opt.get("height", 640)); dpi = int(opt.get("dpi", 300))
    grid = bool(opt.get("grid", True)); rot = int(opt.get("label_rotation", 0))
    yopt = opt.get("y_axis", {}) or {}; y_min = yopt.get("min", 0); y_max = yopt.get("max", None); step = yopt.get("tick_step", 10)
    w = float(opt.get("candle_width", 0.55)); color_up = opt.get("color_up","#23C343"); color_dn = opt.get("color_down","#FF9A2E")
    wick_lw = float(opt.get("wick_linewidth", 2.0)); body_lw = float(opt.get("body_linewidth", 0.0))

    x_index = {lab:i for i,lab in enumerate(x_labels)}
    xs, opens, highs, lows, closes = [],[],[],[],[]
    for r in rows:
        xs.append(x_index[r["x"]]); opens.append(float(r["open"])); highs.append(float(r["high"]))
        lows.append(float(r["low"])); closes.append(float(r["close"]))
    xs = np.array(xs); opens=np.array(opens); highs=np.array(highs); lows=np.array(lows); closes=np.array(closes)
    ymax = float(highs.max())

    fig, ax = plt.subplots(figsize=figsize(width,height,dpi), dpi=dpi)
    apply_theme(ax, grid=grid)
    ax.set_title(title)
    
    # Add axis labels
    ax.set_xlabel("Date", fontsize=12, fontweight='bold')
    ax.set_ylabel("Price ($)", fontsize=12, fontweight='bold')

    for i, x in enumerate(xs):
        o, h, l, c = opens[i], highs[i], lows[i], closes[i]
        up = c >= o
        col = color_up if up else color_dn
        # wick
        ax.vlines(x, l, h, color=col, linewidth=wick_lw, zorder=2)
        # body
        y0 = min(o,c); height_body = abs(c-o)
        ax.add_patch(plt.Rectangle((x - w/2, y0), w, max(height_body, 0.001),
                                   facecolor=col, edgecolor=col if body_lw>0 else "none",
                                   linewidth=body_lw, zorder=3, alpha=0.9))

    if y_max is None:
        # Simple upper bound calculation
        y_max = step * ((int(ymax / step) + 1) if ymax % step == 0 else int(ymax / step) + 1)
    ax.set_ylim(bottom=y_min if y_min is not None else 0, top=y_max)

    ax.set_xlim(-0.5, len(x_labels)-0.5)
    ax.set_xticks(range(len(x_labels)))
    ax.set_xticklabels(x_labels, rotation=45, ha='right')

    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight"); plt.close(fig)
    return out_path

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Ellipse, Polygon
from typing import Dict, Any, List, Tuple
from core.validators import validate_flow
from core.base_style import figsize

def _auto_lanes(nodes, edges, lane_override):
    # iterative longest-path layering, tolerant to cycles; overrides take precedence
    id_to_idx = {n["id"]: i for i,n in enumerate(nodes)}
    preds = {n["id"]: [] for n in nodes}
    for e in edges:
        preds[e["to"]].append(e["from"])
    lane = {n["id"]: lane_override.get(n["id"], 0) for n in nodes} if lane_override else {n["id"]: 0 for n in nodes}
    for _ in range(12):  # converge
        changed = False
        for n in nodes:
            if n["id"] in (lane_override or {}): continue
            if preds[n["id"]]:
                m = max(lane[p] for p in preds[n["id"]])
                if lane[n["id"]] <= m:
                    lane[n["id"]] = m + 1; changed = True
        if not changed: break
    return lane

def _route_polyline(x0,y0,x1,y1,sep=40, backward=False):
    # orthogonal routing: three segments forward, five segments for backward/loop
    pts = []
    if not backward:
        mid = (x0 + x1)/2
        pts = [(x0,y0), (mid,y0), (mid,y1), (x1,y1)]
    else:
        # loopback: up, left, down, right to target
        up = max(y0,y1) + 60
        left = min(x0, x1) - 60
        pts = [(x0,y0), (x0, up), (left, up), (left, y1), (x1, y1)]
    return pts

def _arrow(ax, pts, color, width):
    # draw polyline segments; arrowhead on final segment
    for i in range(len(pts)-1):
        ax.plot([pts[i][0], pts[i+1][0]], [pts[i][1], pts[i+1][1]], color=color, linewidth=width)
    
    # Add simple arrowhead at the end
    if len(pts) >= 2:
        end_x, end_y = pts[-1]
        prev_x, prev_y = pts[-2]
        dx = end_x - prev_x
        dy = end_y - prev_y
        length = (dx*dx + dy*dy)**0.5
        if length > 0:
            # Normalize direction
            dx /= length
            dy /= length
            # Arrowhead size
            arrow_size = 8
            # Arrowhead points
            arrow_x1 = end_x - arrow_size * dx + arrow_size * 0.5 * dy
            arrow_y1 = end_y - arrow_size * dy - arrow_size * 0.5 * dx
            arrow_x2 = end_x - arrow_size * dx - arrow_size * 0.5 * dy
            arrow_y2 = end_y - arrow_size * dy + arrow_size * 0.5 * dx
            
            # Draw arrowhead
            ax.plot([end_x, arrow_x1], [end_y, arrow_y1], color=color, linewidth=width)
            ax.plot([end_x, arrow_x2], [end_y, arrow_y2], color=color, linewidth=width)

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_flow(payload)
    nodes = payload["nodes"]; edges = payload["edges"]; opt = payload.get("options", {}) or {}; title = payload.get("title","")

    width = int(opt.get("width", 880)); height = int(opt.get("height", 640)); dpi = int(opt.get("dpi", 300))
    grid = bool(opt.get("grid", False))
    lane_gap = float(opt.get("lane_spacing_px", 240)); row_gap = float(opt.get("row_spacing_px", 120))
    route_style = opt.get("route_style", "orthogonal")
    arrow_color = opt.get("arrow_color", "#9CA3AF"); arrow_w = float(opt.get("arrow_width",1.8))
    label_fs = int(opt.get("label_font_size", 10))
    lane_override = opt.get("lane_override", {}) or {}
    type_styles = opt.get("type_styles", {
        "start":   {"shape":"ellipse","fill":"#23C343","text":"#FFFFFF"},
        "end":     {"shape":"ellipse","fill":"#FF9A2E","text":"#FFFFFF"},
        "process": {"shape":"roundrect","fill":"#FBE842","text":"#374151"},
        "decision":{"shape":"diamond","fill":"#4080FF","text":"#FFFFFF"},
    })

    # sizes (px)
    sizes = {"roundrect":(140,44),"ellipse":(120,50),"diamond":(130,70)}
    margin = 40

    # lanes
    lanes = _auto_lanes(nodes, edges, lane_override)
    by_lane = {}
    for n in nodes:
        by_lane.setdefault(lanes[n["id"]], []).append(n)

    # y placement per lane
    coords = {}
    for ln in sorted(by_lane.keys()):
        items = by_lane[ln]
        y = margin + (height*0.1)  # vertical offset
        for n in items:
            coords[n["id"]] = [margin + ln*lane_gap, y]
            y += row_gap

    fig, ax = plt.subplots(figsize=figsize(width,height,dpi), dpi=dpi)
    fig.set_facecolor("white"); ax.set_facecolor("white")
    if grid:
        ax.grid(True, color="#E5E7EB", linewidth=1, alpha=0.3)
    else:
        ax.grid(False)
    ax.set_xlim(0,width); ax.set_ylim(0,height); ax.invert_yaxis()
    ax.axis("off"); 
    if title: ax.set_title(title, pad=10)

    # draw edges first
    for e in edges:
        x0,y0 = coords[e["from"]]; x1,y1 = coords[e["to"]]
        # adjust to node edge depending on type width/height
        def bbox(nid):
            n = next(n for n in nodes if n["id"]==nid)
            shape = type_styles.get(n["type"], {}).get("shape","roundrect")
            w,h = sizes["roundrect"]
            if shape=="ellipse": w,h = sizes["ellipse"]
            if shape=="diamond": w,h = sizes["diamond"]
            return w,h
        w0,h0 = bbox(e["from"]); w1,h1 = bbox(e["to"])
        sx = x0 + w0/2; sy = y0
        tx = x1 - w1/2; ty = y1
        backward = lanes[e["to"]] <= lanes[e["from"]]
        pts = _route_polyline(sx, sy, tx, ty, backward=backward)
        _arrow(ax, pts, arrow_color, arrow_w)
        if "label" in e and e["label"]:
            mid = pts[len(pts)//2]
            ax.text(mid[0]+6, mid[1]-6, e["label"], fontsize=label_fs, color="#6B7280")

    # draw nodes on top
    for n in nodes:
        x,y = coords[n["id"]]
        style = type_styles.get(n["type"], type_styles["process"])
        fill = n.get("fill", style["fill"]); textc = style.get("text","#111827")
        shape = style["shape"]; tx,ty = x,y
        if shape=="roundrect":
            w,h = sizes["roundrect"]
            ax.add_patch(FancyBboxPatch((x-w/2, y-h/2), w, h,
                boxstyle="round,pad=0,rounding_size=10", linewidth=0, facecolor=fill))
        elif shape=="ellipse":
            w,h = sizes["ellipse"]
            ax.add_patch(Ellipse((x, y), w, h, facecolor=fill, edgecolor="none"))
        elif shape=="diamond":
            w,h = sizes["diamond"]
            pts = [(x, y-h/2),(x+w/2,y),(x,y+h/2),(x-w/2,y)]
            ax.add_patch(Polygon(pts, closed=True, facecolor=fill, edgecolor="none"))
        ax.text(tx, ty, n["label"], ha="center", va="center", fontsize=11, color=textc)

    fig.savefig(out_path, bbox_inches="tight"); plt.close(fig)
    return out_path

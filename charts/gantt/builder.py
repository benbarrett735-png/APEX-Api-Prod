import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import pandas as pd
import datetime as dt
from typing import Dict, Any
from charts.core.validators import validate_gantt

# Color scheme from user's sample
colors = ["#4080FF", "#57A9FB", "#37D4CF", "#23C343", "#FBE842", "#FF9A2E", "#A9AEB8"]

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_gantt(payload)
    tasks = payload["tasks"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 900))
    height = int(opt.get("height", 560))
    dpi = int(opt.get("dpi", 300))
    
    # Set font
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False
    
    # Build DataFrame like user's sample
    df_gantt = pd.DataFrame(tasks)
    df_gantt["Start"] = pd.to_datetime(df_gantt["start"])
    df_gantt["End"] = pd.to_datetime(df_gantt["end"])
    df_gantt["Duration"] = df_gantt["End"] - df_gantt["Start"]
    df_gantt["Task"] = df_gantt["label"]
    
    # Create category mapping for colors (if Category exists, otherwise use single color)
    if "category" in df_gantt.columns:
        categories = df_gantt["category"].unique()
        category_colors = {cat: colors[i % len(colors)] for i, cat in enumerate(categories)}
    else:
        category_colors = {None: colors[0]}
        df_gantt["category"] = None
    
    # Create figure with exact styling from user's sample
    fig, ax = plt.subplots(figsize=(width/dpi, height/dpi), dpi=dpi)
    
    # Plot bars for each task (like user's sample)
    for i, row in df_gantt.iterrows():
        color = category_colors.get(row.get("category"), colors[0])
        ax.barh(row["Task"], row["Duration"], left=row["Start"], color=color)
    
    # Formatting from user's sample
    ax.set_xlabel("Date", fontsize=12)
    ax.set_ylabel("Task", fontsize=12)
    ax.set_title(title, fontsize=16)
    
    # Set x-axis limits
    start_date = df_gantt["Start"].min() - pd.Timedelta(days=2)
    end_date = df_gantt["End"].max() + pd.Timedelta(days=2)
    ax.set_xlim(start_date, end_date)
    
    # Format x-axis ticks as dates
    ax.xaxis.set_major_formatter(plt.matplotlib.dates.DateFormatter("%Y-%m-%d"))
    plt.xticks(rotation=45, ha="right")
    
    # Invert y-axis to have first task at top
    ax.invert_yaxis()
    
    # Grid and background from user's sample
    ax.grid(True, linestyle="--", alpha=0.6, color="lightgray")
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")
    
    plt.tight_layout()
    fig.savefig(out_path, bbox_inches="tight")
    plt.close(fig)
    return out_path

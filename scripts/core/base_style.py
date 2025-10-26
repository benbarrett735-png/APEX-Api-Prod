import matplotlib
# Set backend before importing pyplot to avoid font issues
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

# Set a safe font to avoid font rendering issues
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica', 'Liberation Sans']
plt.rcParams['font.size'] = 10
plt.rcParams['axes.titlesize'] = 14  # Larger title
plt.rcParams['axes.labelsize'] = 12  # Larger labels
plt.rcParams['xtick.labelsize'] = 10  # Larger ticks
plt.rcParams['ytick.labelsize'] = 10

# NEW Professional color palette (cooler tones)
PALETTE_DEFAULT = [
    "#4080FF", "#57A9FB", "#37D4CF", "#23C343", 
    "#FBE842", "#FF9A2E", "#A9AEB8", "#8B5CF6",
    "#14B8A6", "#F97316"
]

GRID_COLOR = "lightgray"  # More visible grid
AXIS_COLOR = "#E5E7EB"

def apply_theme(ax, grid=True):
    fig = ax.figure
    fig.set_facecolor("white")
    ax.set_facecolor("white")
    # Light, minimal spines
    for spine in ax.spines.values():
        spine.set_visible(True)
        spine.set_linewidth(1.0)
        spine.set_edgecolor(AXIS_COLOR)
    # Grid - dashed with more visibility
    if grid:
        ax.grid(True, axis="both", linestyle="--", linewidth=1.0, alpha=0.6, color=GRID_COLOR)
    else:
        ax.grid(False)
    # Ticks
    ax.tick_params(axis="both", which="major", labelsize=10, color="black")
    # Titles
    ax.title.set_fontsize(14)
    # Note: set_pad is not available in all matplotlib versions
    try:
        ax.title.set_pad(12)
    except AttributeError:
        pass  # Skip if not available

def figsize(width_px: int, height_px: int, dpi: int):
    return (width_px / dpi, height_px / dpi)


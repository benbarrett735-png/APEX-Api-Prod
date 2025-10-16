import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from typing import Dict, Any
from charts.core.validators import validate_wordcloud

# Color scheme from user's sample
colors = ["#4080FF", "#57A9FB", "#37D4CF", "#23C343", "#FBE842", "#FF9A2E", "#A9AEB8"]

def build(payload: Dict[str, Any], out_path: str) -> str:
    validate_wordcloud(payload)
    words = payload["words"]
    title = payload.get("title", "")
    opt = payload.get("options", {}) or {}

    width = int(opt.get("width", 880))
    height = int(opt.get("height", 640))
    dpi = int(opt.get("dpi", 300))
    
    # Set font
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False
    
    # Try to use wordcloud library (from user's sample)
    try:
        from wordcloud import WordCloud
        
        # Build text from words
        text_data = " ".join([f"{w['text']} " * int(w['weight']) for w in words])
        
        # Generate wordcloud with user's styling
        wordcloud = WordCloud(
            width=width,
            height=height,
            background_color='white',
            colormap='viridis',  # User's sample uses viridis
            max_words=200,
            min_font_size=10,
            random_state=42
        ).generate(text_data)
        
        # Display
        fig, ax = plt.subplots(figsize=(width/dpi, height/dpi), dpi=dpi)
        ax.imshow(wordcloud, interpolation='bilinear')
        ax.axis("off")
        ax.set_title(title, fontsize=16, pad=10)
        
        fig.patch.set_facecolor("white")
        plt.tight_layout()
        fig.savefig(out_path, dpi=dpi, bbox_inches="tight")
        plt.close(fig)
        
    except ImportError:
        # Fallback: simple text-based visualization
        import numpy as np
        
        fig, ax = plt.subplots(figsize=(width/dpi, height/dpi), dpi=dpi)
        ax.set_xlim(0, width)
        ax.set_ylim(0, height)
        ax.axis("off")
        ax.set_facecolor("white")
        fig.patch.set_facecolor("white")
        
        # Sort by weight
        words_sorted = sorted(words, key=lambda w: float(w["weight"]), reverse=True)
        
        # Place words in a grid
        cx, cy = width/2, height/2
        rng = np.random.default_rng(42)
        
        for i, w in enumerate(words_sorted[:20]):  # Limit to top 20
            fontsize = 10 + (float(w["weight"]) / max(float(ww["weight"]) for ww in words_sorted) * 60)
            color = colors[i % len(colors)]
            
            # Spiral placement
            angle = i * 0.5
            radius = i * 15
            x = cx + radius * np.cos(angle)
            y = cy + radius * np.sin(angle)
            
            ax.text(x, y, w["text"], fontsize=fontsize, color=color, 
                   ha="center", va="center", rotation=rng.choice([0, 90]))
        
        ax.set_title(title, fontsize=16, pad=10)
        plt.tight_layout()
        fig.savefig(out_path, dpi=dpi, bbox_inches="tight")
        plt.close(fig)
    
    return out_path

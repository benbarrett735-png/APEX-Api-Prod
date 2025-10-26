import math, numpy as np
from typing import List, Optional

def resolve_colors(n: int, colors_opt: Optional[List[str]], defaults: List[str]) -> List[str]:
    if colors_opt and len(colors_opt) >= n:
        return colors_opt[:n]
    return (defaults * ((n + len(defaults) - 1) // len(defaults)))[:n]

def nice_upper_bound(max_val: float, tick_step: Optional[float]) -> float:
    if tick_step and tick_step > 0:
        # round up to nearest multiple of tick_step
        return math.ceil(max_val / tick_step) * tick_step
    # heuristic: choose step from {1,2,5} * 10^k
    if max_val <= 0: return 1.0
    magnitude = 10 ** math.floor(math.log10(max_val))
    for step in [1, 2, 5, 10]:
        if max_val <= step * magnitude:
            return step * magnitude
    return 10 * magnitude

def coerce_numeric_array(vals):
    out = []
    for v in vals:
        if isinstance(v, (int, float)):
            out.append(float(v))
        else:
            try:
                out.append(float(str(v).replace(",","").strip()))
            except Exception:
                raise ValueError(f"Non-numeric value encountered: {v!r}")
    return np.array(out, dtype=float)


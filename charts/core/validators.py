def require(cond: bool, msg: str):
    if not cond:
        raise ValueError(msg)

def validate_common(payload: dict):
    require("x" in payload, "Missing: x")
    require(isinstance(payload["x"], list) and len(payload["x"]) > 0, "x must be a non-empty list of strings")
    require(all(isinstance(s, str) for s in payload["x"]), "x labels must be strings")
    require("series" in payload and isinstance(payload["series"], list) and len(payload["series"]) > 0,
            "series must be a non-empty list")

    L = len(payload["x"])
    for idx, s in enumerate(payload["series"]):
        require("name" in s and isinstance(s["name"], str), f"series[{idx}] missing name")
        require("values" in s and isinstance(s["values"], list), f"series[{idx}] missing values")
        require(len(s["values"]) == L, f"series[{idx}].values length {len(s['values'])} != x length {L}")

def validate_line(payload: dict):
    validate_common(payload)
    # nothing extra; options validated in builder

def validate_area(payload: dict):
    validate_common(payload)
    # nothing extra

def validate_bar(payload: dict):
    validate_common(payload)
    # nothing extra

def validate_pie(payload: dict):
    validate_common(payload)
    # For pie/donut charts, we typically use the first series
    require(len(payload["series"]) >= 1, "Pie/donut charts need at least one series")
    first_series = payload["series"][0]
    require("values" in first_series and isinstance(first_series["values"], list), "First series missing values")
    require(len(first_series["values"]) > 0, "First series values cannot be empty")

def validate_scatter(payload: dict):
    require("x" in payload, "Missing: x")
    require(isinstance(payload["x"], list) and len(payload["x"]) > 0, "x must be a non-empty list")
    require("series" in payload and isinstance(payload["series"], list) and len(payload["series"]) > 0,
            "series must be a non-empty list")
    
    # For scatter plots, x values should be numeric
    for idx, x_val in enumerate(payload["x"]):
        require(isinstance(x_val, (int, float)), f"x[{idx}] must be numeric for scatter plot")
    
    for idx, s in enumerate(payload["series"]):
        require("name" in s and isinstance(s["name"], str), f"series[{idx}] missing name")
        require("values" in s and isinstance(s["values"], list), f"series[{idx}] missing values")
        require(len(s["values"]) == len(payload["x"]), f"series[{idx}].values length {len(s['values'])} != x length {len(payload['x'])}")
        # Y values should also be numeric
        for jdx, y_val in enumerate(s["values"]):
            require(isinstance(y_val, (int, float)), f"series[{idx}].values[{jdx}] must be numeric for scatter plot")

def validate_bubble(payload: dict):
    require("x" in payload, "Missing: x")
    require(isinstance(payload["x"], list) and len(payload["x"]) > 0, "x must be a non-empty list")
    require("series" in payload and isinstance(payload["series"], list) and len(payload["series"]) > 0,
            "series must be a non-empty list")
    
    # For bubble plots, x values should be numeric
    for idx, x_val in enumerate(payload["x"]):
        require(isinstance(x_val, (int, float)), f"x[{idx}] must be numeric for bubble plot")
    
    for idx, s in enumerate(payload["series"]):
        require("name" in s and isinstance(s["name"], str), f"series[{idx}] missing name")
        require("values" in s and isinstance(s["values"], list), f"series[{idx}] missing values")
        require(len(s["values"]) == len(payload["x"]), f"series[{idx}].values length {len(s['values'])} != x length {len(payload['x'])}")
        # Y values should also be numeric
        for jdx, y_val in enumerate(s["values"]):
            require(isinstance(y_val, (int, float)), f"series[{idx}].values[{jdx}] must be numeric for bubble plot")
        # Optional sizes array for bubble sizes
        if "sizes" in s:
            require(isinstance(s["sizes"], list), f"series[{idx}].sizes must be a list")
            require(len(s["sizes"]) == len(payload["x"]), f"series[{idx}].sizes length {len(s['sizes'])} != x length {len(payload['x'])}")
            for jdx, size_val in enumerate(s["sizes"]):
                require(isinstance(size_val, (int, float)) and size_val > 0, f"series[{idx}].sizes[{jdx}] must be positive numeric for bubble plot")

def validate_funnel(payload: dict):
    require("stages" in payload and isinstance(payload["stages"], list) and payload["stages"],
            "funnel: missing stages")
    for i, s in enumerate(payload["stages"]):
        require("label" in s and "value" in s, f"stages[{i}] requires label and value")
        try:
            float(s["value"])
        except Exception:
            raise ValueError(f"stages[{i}].value must be numeric")

def validate_heatmap(payload: dict):
    require("x" in payload and isinstance(payload["x"], list) and payload["x"], "heatmap: missing x")
    require("y" in payload and isinstance(payload["y"], list) and payload["y"], "heatmap: missing y")
    require("values" in payload and isinstance(payload["values"], list) and payload["values"],
            "heatmap: missing values")
    rows = len(payload["y"]); cols = len(payload["x"])
    require(all(isinstance(r, list) and len(r) == cols for r in payload["values"]),
            f"heatmap: values must be a {rows}x{cols} 2D list")
    for r in payload["values"]:
        for v in r:
            try: float(v)
            except Exception:
                raise ValueError("heatmap: all values must be numeric")

def validate_radar(payload: dict):
    require("axes" in payload and isinstance(payload["axes"], list) and payload["axes"], "radar: missing axes")
    require("series" in payload and isinstance(payload["series"], list) and payload["series"], "radar: missing series")
    L = len(payload["axes"])
    for i, s in enumerate(payload["series"]):
        require("name" in s and "values" in s, f"series[{i}] needs name, values")
        require(len(s["values"]) == L, f"series[{i}].values length {len(s['values'])} != axes length {L}")
        for v in s["values"]:
            try: float(v)
            except Exception:
                raise ValueError(f"series[{i}].values must be numeric")

def validate_sankey(payload: dict):
    require("nodes" in payload and isinstance(payload["nodes"], list) and payload["nodes"], "sankey: missing nodes")
    require("links" in payload and isinstance(payload["links"], list) and payload["links"], "sankey: missing links")
    cols = {}
    for i, n in enumerate(payload["nodes"]):
        require("id" in n and "col" in n, f"nodes[{i}] needs id and col")
        require(isinstance(n["col"], int) and n["col"] >= 0, f"nodes[{i}].col must be int>=0")
        cols[n["id"]] = n["col"]
        if "label" not in n: n["label"] = ""
    for j, e in enumerate(payload["links"]):
        require("source" in e and "target" in e and "value" in e, f"links[{j}] needs source,target,value")
        require(e["source"] in cols and e["target"] in cols, f"links[{j}] references unknown node")
        require(abs(cols[e["source"]] - cols[e["target"]]) == 1,
                f"links[{j}] must connect adjacent columns")
        try: float(e["value"])
        except Exception: raise ValueError(f"links[{j}].value must be numeric")

def validate_sunburst(payload: dict):
    require("root" in payload and isinstance(payload["root"], dict), "sunburst: missing root")
    # minimal recursive checks
    def walk(node):
        require("label" in node and "value" in node, "sunburst: each node needs label,value")
        try: float(node["value"])
        except Exception: raise ValueError("sunburst: value must be numeric")
        if "children" in node:
            require(isinstance(node["children"], list), "sunburst: children must be list")
            for ch in node["children"]: walk(ch)
    walk(payload["root"])

def validate_treemap(payload: dict):
    require("items" in payload and isinstance(payload["items"], list) and payload["items"],
            "treemap: missing items")
    for i, it in enumerate(payload["items"]):
        require("label" in it and "value" in it, f"items[{i}] needs label,value")
        try:
            v = float(it["value"])
            require(v > 0, f"items[{i}].value must be >0")
        except Exception:
            raise ValueError(f"items[{i}].value must be numeric")

def validate_candlestick(payload: dict):
    require("x" in payload and isinstance(payload["x"], list) and payload["x"], "candlestick: missing x")
    X = set(payload["x"])
    require("ohlc" in payload and isinstance(payload["ohlc"], list) and payload["ohlc"], "candlestick: missing ohlc")
    for i, r in enumerate(payload["ohlc"]):
        for k in ("x","open","high","low","close"):
            require(k in r, f"ohlc[{i}] missing {k}")
        require(r["x"] in X, f"ohlc[{i}].x not in x")
        o,h,l,c = float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"])
        require(l <= o <= h and l <= c <= h, f"ohlc[{i}] must satisfy low ≤ open/close ≤ high")

def validate_flow(payload: dict):
    require("nodes" in payload and isinstance(payload["nodes"], list) and payload["nodes"], "flow: missing nodes")
    require("edges" in payload and isinstance(payload["edges"], list), "flow: missing edges")
    ids = set()
    for i,n in enumerate(payload["nodes"]):
        require("id" in n and "label" in n and "type" in n, f"nodes[{i}] need id,label,type")
        ids.add(n["id"])
    for j,e in enumerate(payload["edges"]):
        require("from" in e and "to" in e, f"edges[{j}] need from,to")
        require(e["from"] in ids and e["to"] in ids, f"edges[{j}] references unknown node")

def validate_gantt(payload: dict):
    import datetime as _dt
    require("tasks" in payload and isinstance(payload["tasks"], list) and payload["tasks"], "gantt: missing tasks")
    def _p(s): return _dt.date.fromisoformat(s)
    for i,t in enumerate(payload["tasks"]):
        require("label" in t and "start" in t and "end" in t, f"tasks[{i}] need label,start,end")
        start, end = _p(t["start"]), _p(t["end"])
        require(end >= start, f"tasks[{i}] end must be >= start")

def validate_stackedbar(payload: dict):
    require("x" in payload and isinstance(payload["x"], list) and payload["x"], "stackedbar: missing x")
    require("series" in payload and isinstance(payload["series"], list) and payload["series"],
            "stackedbar: missing series")
    L = len(payload["x"])
    for i, s in enumerate(payload["series"]):
        require("name" in s and "values" in s, f"series[{i}] needs name, values")
        require(len(s["values"]) == L, f"series[{i}].values length {len(s['values'])} != x length {L}")
        for v in s["values"]:
            try: float(v)
            except Exception: raise ValueError(f"series[{i}] values must be numeric")

def validate_themeriver(payload: dict):
    # same shape as stackedbar
    validate_stackedbar(payload)

def validate_wordcloud(payload: dict):
    require("words" in payload and isinstance(payload["words"], list) and payload["words"],
            "wordcloud: missing words")
    for i, w in enumerate(payload["words"]):
        require("text" in w and "weight" in w, f"words[{i}] needs text, weight")
        try: float(w["weight"])
        except Exception: raise ValueError(f"words[{i}].weight must be numeric")


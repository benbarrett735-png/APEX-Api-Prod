# Quick Test: 8 Remaining Charts

Test these charts with "ai usage in the world" in your UI:

## ✅ Standard Charts (Should Work)
1. **AREA** - Like LINE (already working)
2. **BUBBLE** - Like SCATTER (already working)  
3. **STACKBAR** - Standard x/series
4. **THEMERIVER** - Standard x/series

## ⚠️ Special Charts (Just Fixed)
5. **FLOW** - Just strengthened prompt with examples
6. **CANDLESTICK** - Just strengthened prompt with examples

## 🔄 Hierarchical Charts (Have Normalization)
7. **SUNBURST** - Has normalization fallback
8. **WORDCLOUD** - Has normalization fallback

---

## Quick cURL Tests (if API running on localhost:3000)

```bash
# 1. AREA
curl -X POST http://localhost:3000/charts/generate -H "Content-Type: application/json" -d '{"chartType":"area","data":{},"goal":"ai usage in the world"}'

# 2. BUBBLE
curl -X POST http://localhost:3000/charts/generate -H "Content-Type: application/json" -d '{"chartType":"bubble","data":{},"goal":"ai usage in the world"}'

# 3. STACKBAR
curl -X POST http://localhost:3000/charts/generate -H "Content-Type: application/json" -d '{"chartType":"stackbar","data":{},"goal":"ai usage in the world"}'

# 4. THEMERIVER
curl -X POST http://localhost:3000/charts/generate -H "Content-Type: application/json" -d '{"chartType":"themeriver","data":{},"goal":"ai usage in the world"}'

# 5. FLOW (just fixed)
curl -X POST http://localhost:3000/charts/generate -H "Content-Type: application/json" -d '{"chartType":"flow","data":{},"goal":"ai usage in the world"}'

# 6. CANDLESTICK (just fixed)
curl -X POST http://localhost:3000/charts/generate -H "Content-Type: application/json" -d '{"chartType":"candlestick","data":{},"goal":"ai usage in the world"}'

# 7. SUNBURST
curl -X POST http://localhost:3000/charts/generate -H "Content-Type: application/json" -d '{"chartType":"sunburst","data":{},"goal":"ai usage in the world"}'

# 8. WORDCLOUD
curl -X POST http://localhost:3000/charts/generate -H "Content-Type: application/json" -d '{"chartType":"wordcloud","data":{},"goal":"ai usage in the world"}'
```

---

## Expected Results

All should return:
```json
{"success": true, "chart_url": "/api/charts/serve/xxxxx.png"}
```

If any fail, check the error message.


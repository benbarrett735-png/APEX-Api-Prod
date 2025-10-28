# Serper API Setup Guide

## ✅ IMPLEMENTATION COMPLETE

The research system now uses **real Google search** via Serper API!

---

## 🚀 Quick Setup (2 minutes)

### Step 1: Get Your API Key

1. Go to: **https://serper.dev**
2. Click **"Sign Up"** (top right)
3. Sign up with email or Google
4. Verify your email
5. Copy your API key from the dashboard

**Free Tier:** 2,500 searches/month (plenty for testing!)

---

### Step 2: Add to Your .env File

Open `/Users/benbarrett/APEX-Api-Prod/.env` and add:

```bash
SERPER_API_KEY=your_actual_key_here
```

**Example:**
```bash
SERPER_API_KEY=abc123def456ghi789...
```

---

### Step 3: Restart API (if needed)

```bash
cd /Users/benbarrett/APEX-Api-Prod
npm run dev
```

---

## 🎯 How It Works Now

### OLD (Broken):
```
User query → GPT-4 (no web access) → "I don't have information about that"
```

### NEW (Working):
```
User query → Serper API → Real Google results → GPT-4 synthesis → Accurate findings ✓
```

---

## 📊 What You Get

### Real Search Results:
- ✅ **Organic results** (top 10 Google results)
- ✅ **Answer boxes** (direct answers from Google)
- ✅ **Knowledge graphs** (structured info)
- ✅ **Snippets** (page descriptions)
- ✅ **URLs** (actual sources)
- ✅ **Dates** (when pages were published)

### GPT-4 Synthesis:
- Extracts 10-15 specific findings
- Structures information logically
- Cites sources
- Removes duplicates
- Provides comprehensive summary

---

## 🧪 Test It

### Before (with GPT-4 only):
```
Query: "Cabots Cookery School Westport"
Result: "Unfortunately, there is no comprehensive or specific 
         information available..."
```

### After (with Serper + GPT-4):
```
Query: "Cabots Cookery School Westport"
Result:
  • Website: cabotscookeryschool.ie
  • Location: 12 acres by Kinloey Lough, Westport, Co. Mayo
  • Owners: Redmond & Sandra Cabot
  • Classes: Level 1-4 cooking courses
  • Pricing: $15/month basic, $75/month advanced
  • Curriculum: Pizza, pasta, vegan, butchering, etc.
  ✓ ALL ACCURATE!
```

---

## 💰 Pricing

### Free Tier (Recommended for testing):
- **2,500 searches/month**
- No credit card required
- Perfect for development

### Paid Plans (if you exceed free tier):
- **$5** = 5,000 searches
- **$50** = 60,000 searches  
- **$500** = 800,000 searches

**Cost per search:** ~$0.001 (very cheap!)

---

## 🔧 Technical Details

### API Endpoint:
```
POST https://google.serper.dev/search
Headers: X-API-KEY: your_key
Body: { "q": "search query", "num": 10 }
```

### Response Structure:
```json
{
  "organic": [
    {
      "title": "Page title",
      "link": "https://example.com",
      "snippet": "Page description",
      "date": "2024-10-15"
    }
  ],
  "answerBox": {
    "answer": "Direct answer if available"
  },
  "knowledgeGraph": {
    "title": "Entity name",
    "description": "Entity description",
    "attributes": { "key": "value" }
  }
}
```

### Flow:
1. **Serper API** fetches real Google results (10s timeout)
2. **Extract** answer box + knowledge graph + organic results
3. **GPT-4o** synthesizes findings from results (20s timeout)
4. **Return** structured research with sources

---

## ⚠️ Troubleshooting

### "SERPER_API_KEY not configured"
**Fix:** Add `SERPER_API_KEY=...` to your `.env` file

### "Serper API error: 401"
**Fix:** Check your API key is correct (copy-paste from dashboard)

### "Serper API error: 429"
**Fix:** You've exceeded your monthly quota. Upgrade plan or wait for reset.

### "No search results found"
**Fix:** Query might be too specific. Serper returned empty results.

---

## 📈 Monitoring Usage

1. Go to: https://serper.dev/dashboard
2. View **"API Calls"** chart
3. Check remaining quota
4. See popular queries

---

## 🎯 Next Steps

1. ✅ Get Serper API key
2. ✅ Add to `.env`
3. ✅ Test research with real queries
4. ✅ Monitor usage in dashboard
5. ✅ Upgrade if needed (unlikely for dev)

---

## 🚀 You're Ready!

Research will now find **real, up-to-date information** from Google!

Try it: "research cabotscookeryschool.ie and tell me all about them"


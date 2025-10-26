#!/bin/bash

# Test the 8 remaining chart types with "ai usage in the world"
# Run this after starting the API with: npm run dev

API_URL="http://localhost:3000/charts/generate"
PROMPT="ai usage in the world"

echo "🧪 Testing 8 Remaining Chart Types"
echo "==================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_chart() {
  local chart_type=$1
  local num=$2
  
  echo -e "${YELLOW}[$num/8] Testing ${chart_type^^} chart...${NC}"
  
  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"chartType\": \"$chart_type\",
      \"data\": {},
      \"goal\": \"$PROMPT\"
    }")
  
  # Check if response contains success
  if echo "$response" | grep -q '"success":true'; then
    chart_url=$(echo "$response" | grep -o '"chart_url":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✅ ${chart_type^^} - SUCCESS${NC}"
    echo "   URL: $chart_url"
  else
    echo -e "${RED}❌ ${chart_type^^} - FAILED${NC}"
    error=$(echo "$response" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    echo "   Error: $error"
  fi
  
  echo ""
  sleep 2  # Brief pause between tests
}

# Test all 8 remaining charts
test_chart "area" 1
test_chart "bubble" 2
test_chart "sunburst" 3
test_chart "candlestick" 4
test_chart "flow" 5
test_chart "stackbar" 6
test_chart "themeriver" 7
test_chart "wordcloud" 8

echo "==================================="
echo "✅ Testing complete!"
echo ""
echo "Check the results above."
echo "Failed charts will show error messages."


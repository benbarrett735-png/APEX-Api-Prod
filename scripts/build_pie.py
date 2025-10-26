#!/usr/bin/env python3
"""
Pie Chart Builder - Standalone Script
Usage: python3 build_pie.py <input_json_path> <output_png_path>
"""
import sys
import json
from pie.builder import build

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: build_pie.py <input_json> <output_png>", file=sys.stderr)
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    try:
        with open(input_path, 'r') as f:
            payload = json.load(f)
        
        result = build(payload, output_path)
        print(f"Chart saved to: {result}")
        sys.exit(0)
    except Exception as e:
        print(f"Error building pie chart: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


#!/usr/bin/env python3
"""
Word Cloud Chart Builder - Standalone Script
Usage: python3 build_wordcloud.py <input_json_path> <output_png_path>
"""
import sys
import json
import os
import importlib.util

# Load builder module directly to avoid conflict with Python's wordcloud library
script_dir = os.path.dirname(os.path.abspath(__file__))
builder_path = os.path.join(script_dir, 'wordcloud', 'builder.py')

spec = importlib.util.spec_from_file_location("wc_builder", builder_path)
wc_builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wc_builder)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: build_wordcloud.py <input_json> <output_png>", file=sys.stderr)
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    try:
        with open(input_path, 'r') as f:
            payload = json.load(f)
        
        result = wc_builder.build(payload, output_path)
        print(f"Chart saved to: {result}")
        sys.exit(0)
    except Exception as e:
        print(f"Error building wordcloud chart: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


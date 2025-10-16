#!/usr/bin/env python3
import sys, json, os
# Add the API directory to Python path to find charts module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from charts.stackedbar.builder import build

def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/build_stackedbar.py <input.json> <output.png>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    with open(input_file, 'r') as f:
        payload = json.load(f)
    
    out = build(payload, output_file)
    print(f"Wrote {os.path.abspath(out)}")

if __name__ == "__main__":
    main()

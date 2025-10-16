import sys, json, os
# Add the API directory to Python path to find charts module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from charts.line.builder import build

def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/build_line.py <input.json> <output.png>")
        sys.exit(1)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        payload = json.load(f)
    out = build(payload, sys.argv[2])
    print(f"Wrote {os.path.abspath(out)}")

if __name__ == "__main__":
    main()


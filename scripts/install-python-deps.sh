#!/bin/bash
# Install Python dependencies for chart generation

echo "🐍 Installing Python dependencies for charts..."

# Check if pip3 is available
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 not found, attempting to install..."
    if command -v yum &> /dev/null; then
        sudo yum install -y python3-pip
    elif command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y python3-pip
    else
        echo "⚠️  Cannot install pip3 - package manager not found"
        exit 1
    fi
fi

# Install requirements
if [ -f "requirements.txt" ]; then
    pip3 install --user -r requirements.txt
    echo "✅ Python dependencies installed"
else
    echo "⚠️  requirements.txt not found"
fi


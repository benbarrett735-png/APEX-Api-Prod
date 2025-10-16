#!/bin/bash
#
# Lambda Deployment Package Script
#
# This script creates a ZIP file ready for AWS Lambda deployment
#

set -e  # Exit on error

echo "🚀 Creating Lambda deployment package..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "❌ node_modules not found. Running npm install..."
    npm install
fi

# Remove old ZIP if exists
if [ -f "lambda-deployment.zip" ]; then
    echo "🗑️  Removing old deployment package..."
    rm lambda-deployment.zip
fi

# Create ZIP with all required files
echo "📦 Packaging Lambda function..."
zip -r lambda-deployment.zip index.mjs package.json node_modules/ -q

# Check ZIP was created
if [ -f "lambda-deployment.zip" ]; then
    SIZE=$(du -h lambda-deployment.zip | cut -f1)
    echo "✅ Deployment package created: lambda-deployment.zip ($SIZE)"
    echo ""
    echo "Next steps:"
    echo "1. Go to AWS Lambda Console: https://eu-west-1.console.aws.amazon.com/lambda/"
    echo "2. Upload lambda-deployment.zip to your Lambda function"
    echo "3. Configure environment variables (DATABASE_URL)"
    echo "4. Configure VPC access (same VPC as RDS)"
    echo "5. Test the function"
else
    echo "❌ Failed to create deployment package"
    exit 1
fi

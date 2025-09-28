#!/bin/bash

# Render Deployment Script for Hedera Eco-Rewards API
# This script helps you deploy to Render.com for FREE

echo "🚀 Hedera Eco-Rewards API - Render Deployment"
echo "============================================="

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit - Ready for Render deployment"
    echo "✅ Git repository initialized"
fi

# Check if we have a remote origin
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "⚠️  No GitHub remote found. Please:"
    echo "1. Create a repository on GitHub"
    echo "2. Add remote: git remote add origin https://github.com/yourusername/your-repo.git"
    echo "3. Push: git push -u origin main"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "📤 Pushing to GitHub..."
git add .
git commit -m "Deploy to Render - $(date)"
git push origin main

echo ""
echo "🎉 Code pushed to GitHub!"
echo ""
echo "📋 Next Steps:"
echo "1. Go to https://render.com"
echo "2. Sign up with GitHub"
echo "3. Click 'New +' → 'Web Service'"
echo "4. Connect your repository"
echo "5. Configure:"
echo "   - Build Command: npm install"
echo "   - Start Command: node server.js"
echo "6. Add PostgreSQL service"
echo "7. Add Redis service"
echo "8. Set environment variables:"
echo "   - HEDERA_OPERATOR_ID=0.0.6291912"
echo "   - HEDERA_OPERATOR_KEY=your_private_key"
echo "   - JWT_SECRET=your_jwt_secret"
echo "   - NODE_ENV=production"
echo "9. Deploy!"
echo ""
echo "🌐 Your API will be live at: https://your-app-name.onrender.com"
echo "📚 API docs will be at: https://your-app-name.onrender.com/api-docs"
echo ""
echo "🎯 Perfect for your Flutter team to start integrating!"

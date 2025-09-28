# Render Configuration

## Build Settings
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Environment**: `Node`

## Environment Variables
```
HEDERA_OPERATOR_ID=0.0.6291912
HEDERA_OPERATOR_KEY=your_hedera_private_key
HEDERA_NETWORK=testnet
JWT_SECRET=your_jwt_secret
NODE_ENV=production
```

## Services Needed
1. **Web Service** (main API)
2. **PostgreSQL** (database)
3. **Redis** (cache)

## Custom Domain (Optional)
- Add custom domain in Render dashboard
- Automatic SSL certificates

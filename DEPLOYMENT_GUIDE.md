# 🚀 Hedera Eco-Rewards API Deployment Guide

## Quick Deploy Options

### 🎯 **Option 1: Railway (Recommended - 5 minutes)**

Railway is the fastest way to deploy with built-in PostgreSQL and Redis support.

#### Steps:
1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway:**
   ```bash
   railway login
   ```

3. **Initialize Project:**
   ```bash
   railway init
   ```

4. **Add Services:**
   ```bash
   railway add postgresql
   railway add redis
   ```

5. **Set Environment Variables:**
   ```bash
   railway variables set HEDERA_OPERATOR_ID=0.0.6291912
   railway variables set HEDERA_OPERATOR_KEY=your_private_key
   railway variables set HEDERA_NETWORK=testnet
   railway variables set JWT_SECRET=your_jwt_secret
   railway variables set NODE_ENV=production
   ```

6. **Deploy:**
   ```bash
   railway up
   ```

7. **Get Production URL:**
   ```bash
   railway domain
   ```

**Result:** Your API will be live at `https://your-app-name.railway.app`

---

### 🎯 **Option 2: Heroku (Popular Choice)**

#### Steps:
1. **Install Heroku CLI:**
   ```bash
   brew tap heroku/brew && brew install heroku
   ```

2. **Login:**
   ```bash
   heroku login
   ```

3. **Create App:**
   ```bash
   heroku create shebagreen-eco-rewards-api
   ```

4. **Add Services:**
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   heroku addons:create heroku-redis:hobby-dev
   ```

5. **Set Environment Variables:**
   ```bash
   heroku config:set HEDERA_OPERATOR_ID=0.0.6291912
   heroku config:set HEDERA_OPERATOR_KEY=your_private_key
   heroku config:set HEDERA_NETWORK=testnet
   heroku config:set JWT_SECRET=your_jwt_secret
   heroku config:set NODE_ENV=production
   ```

6. **Deploy:**
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

**Result:** Your API will be live at `https://shebagreen-eco-rewards-api.herokuapp.com`

---

### 🎯 **Option 3: DigitalOcean App Platform**

#### Steps:
1. **Create `.do/app.yaml`** (already created in project)
2. **Push to GitHub**
3. **Connect DigitalOcean to GitHub**
4. **Deploy automatically**

**Result:** Your API will be live at `https://shebagreen-eco-rewards-api-xxxxx.ondigitalocean.app`

---

## 🔧 **Pre-Deployment Checklist**

### ✅ **Required Environment Variables:**
- `HEDERA_OPERATOR_ID=0.0.6291912`
- `HEDERA_OPERATOR_KEY=your_private_key`
- `HEDERA_NETWORK=testnet`
- `JWT_SECRET=your_jwt_secret`
- `NODE_ENV=production`

### ✅ **Database Setup:**
- PostgreSQL database (provided by hosting platform)
- Redis cache (provided by hosting platform)
- Run schema: `psql $DATABASE_URL -f database/schema.sql`

### ✅ **Files Ready:**
- ✅ `server.js` - Main application
- ✅ `package.json` - Dependencies
- ✅ `Procfile` - Heroku start command
- ✅ `railway.json` - Railway configuration
- ✅ `nixpacks.toml` - Railway build configuration

---

## 📱 **For Flutter Developers**

Once deployed, your Flutter team can use:

### **Production Base URL:**
```
https://your-deployed-app-url.com
```

### **Update Flutter .env:**
```dart
// lib/config/api_config.dart
class ApiConfig {
  static const String baseUrl = 'https://your-deployed-app-url.com';
  static const String apiVersion = 'v1';
  
  // Endpoints
  static const String registerEndpoint = '/api/v1/auth/register';
  static const String loginEndpoint = '/api/v1/auth/login';
  static const String balanceEndpoint = '/api/v1/tokens/balance';
  static const String cleanupEndpoint = '/api/v1/cleanup/submit';
  static const String healthEndpoint = '/health';
}
```

### **Test Production API:**
```bash
# Health check
curl https://your-deployed-app-url.com/health

# Register user
curl -X POST https://your-deployed-app-url.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test","lastName":"User"}'
```

---

## 🔍 **Post-Deployment Testing**

### 1. **Health Check:**
```bash
curl https://your-deployed-app-url.com/health
```

### 2. **API Documentation:**
Visit: `https://your-deployed-app-url.com/api-docs`

### 3. **Test Registration:**
```bash
curl -X POST https://your-deployed-app-url.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "flutter-dev@shebagreen.com",
    "password": "SecurePassword123!",
    "firstName": "Flutter",
    "lastName": "Developer",
    "phone": "+251912345678",
    "location": {
      "latitude": 9.0192,
      "longitude": 38.7525,
      "city": "Addis Ababa",
      "region": "Addis Ababa"
    }
  }'
```

### 4. **Test Login:**
```bash
curl -X POST https://your-deployed-app-url.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "flutter-dev@shebagreen.com",
    "password": "SecurePassword123!"
  }'
```

---

## 🚀 **Next Steps After Deployment**

1. **Share Production URL** with Flutter team
2. **Provide API Documentation** link: `https://your-url.com/api-docs`
3. **Set up monitoring** (optional)
4. **Continue building** additional features while Flutter team integrates

---

## 📞 **Support**

If you encounter any deployment issues:
1. Check the hosting platform logs
2. Verify environment variables are set correctly
3. Ensure database migrations ran successfully
4. Test with the health check endpoint

**Ready to deploy? Choose your preferred platform and let's get this live! 🚀**

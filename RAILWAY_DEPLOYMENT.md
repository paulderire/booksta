# Railway Deployment Guide for Booksta

## Critical Setup Step: Add PostgreSQL Database Plugin

**⚠️ This step is REQUIRED. Without it, your app will fail to start.**

1. Go to [railway.app](https://railway.app) and open your project
2. Click **+ Add Service** or **+ Add Database**
3. Select **PostgreSQL**
4. Wait for the database to initialize (1-2 minutes)
5. Railway will **automatically** create and inject a `DATABASE_URL` environment variable

## Step 1: Configure Environment Variables

In your Railway project settings, add these variables:

```
NODE_ENV=production
PORT=5000
```

The `DATABASE_URL` is automatically set by Railway when you add the PostgreSQL plugin - **do not set it manually**.

## Step 2: Deploy

Push your code to GitHub:
```bash
git add .
git commit -m "Deploy to Railway"
git push origin main
```

Railway will automatically deploy when you push to your default branch.

## How It Works on Railway

1. **App Starts Immediately** - Server starts on port 5000 without waiting for database
2. **Database Connects in Background** - App continuously retries connecting (2 minutes total)
3. **API Responds During Startup** - Health check shows `initializing` until database is ready
4. **Auto-Initialization** - Once connected, database schema and sample data are created
5. **Full Service Ready** - After ~30-60 seconds, app is fully operational

## Monitoring Startup

Check the Railway logs to see startup progress:

```
✓ booksta server listening on port 5000
[10/120] Waiting for database...
[20/120] Waiting for database...
✓ Database connected successfully on attempt X
✓ Database ready and initialized
```

## Troubleshooting

### "Waiting for database..." never ends
- **Problem**: PostgreSQL plugin wasn't added to the project
- **Solution**: Follow Step 1 again. Check Railway dashboard to confirm PostgreSQL service exists.

### Health endpoint shows "initializing"
- **Normal**: App is starting up, database is connecting
- **Wait**: Give it 30-60 seconds
- **Check**: `curl https://your-app.up.railway.app/api/health`

### 500 errors on API requests during startup
- **Expected**: Before database is ready
- **Solution**: Wait for logs to show "Database ready and initialized"

### Connection shows "127.0.0.1:5432"
- **Problem**: DATABASE_URL environment variable is not set
- **Cause**: PostgreSQL plugin not added to Railway project
- **Fix**: Add PostgreSQL plugin to automatically inject DATABASE_URL

## Environment Variables Reference

| Variable | Value | Required | Notes |
|----------|-------|----------|-------|
| `NODE_ENV` | `production` | Yes | Enables production optimizations |
| `PORT` | `5000` | No | Default is 5000 |
| `DATABASE_URL` | (auto-set) | Yes | Set automatically by PostgreSQL plugin |
| `CLIENT_URL` | `https://your-domain.up.railway.app` | No | For CORS, auto-detected by Railway |

## Local Development

To test locally before deploying:

```bash
# Create .env file
DATABASE_URL=postgresql://postgres:password@localhost:5432/booksta
NODE_ENV=development
PORT=5000

# Start PostgreSQL (choose one)
# Option 1: Homebrew (macOS)
brew services start postgresql

# Option 2: Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres

# Start the app
npm start
```

## Production Best Practices

1. **Always use Railway's PostgreSQL plugin** - Don't try to connect to external databases
2. **Set `NODE_ENV=production`** - Enables performance optimizations
3. **Monitor logs** - Check Railway dashboard for any connection errors
4. **Scaling** - If you need more database connections, Railway handles it automatically


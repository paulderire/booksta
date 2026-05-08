# booksta

Full-stack bookstore app built with Node.js, Express, PostgreSQL, JWT auth, and a vanilla JavaScript SPA.

## Stack

- Backend: Node.js, Express, PostgreSQL, JWT, bcryptjs
- Frontend: Vanilla JS SPA with hash routing
- Styling: Glassmorphism UI with Syne, Inter, and JetBrains Mono

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a PostgreSQL database and update `.env`.

3. Seed the database:

```bash
npm run seed
```

4. Start the server:

```bash
npm start
```

Open the app at `http://localhost:5000`.

## Demo Accounts

Seeded users are created by the `npm run seed` script. Credentials are for local development only and are not listed here.

## API Base URL

The frontend uses same-origin requests by default. If you deploy the frontend separately, set `API_BASE_URL` in browser localStorage or update the `meta[name="api-base-url"]` value in `client/index.html`.

## Deployment

### Backend

Recommended options: Railway or Render.

Required environment variables:

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `BCRYPT_ROUNDS`
- `CLIENT_URL`

If you deploy the backend separately, make sure `CLIENT_URL` matches the frontend origin so CORS works correctly.

### Frontend

Recommended options: Vercel or Netlify as a static site.

Set the API base URL to your deployed backend so the SPA can reach `/api/*` endpoints.

### Database

Run the schema SQL in the PostgreSQL console or use the seed script locally.

The schema is created automatically by `server/seed.js` before data is inserted, so the quickest bootstrap path is:

```bash
npm run seed
```

If your platform provides a database console, you can also execute the `CREATE TABLE` statements from `server/schema.js` in order.

## Notes

- `/api/health` returns a simple health check.
- Auth routes are rate-limited more aggressively than the rest of the API.
- The server serves the client SPA from the `client/` folder.

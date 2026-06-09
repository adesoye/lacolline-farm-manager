# Lacolline Farm API (Azure Functions)

This is the starter API for central persistence.

## Endpoints

- POST /api/auth/login
- GET /api/auth/me
- GET /api/users (admin)
- POST /api/users (admin)
- DELETE /api/users/{id} (admin)
- PATCH /api/users/{id}/status (admin)
- PATCH /api/users/{id}/password (self or admin)
- GET /api/health
- GET /api/pigs
- POST /api/pigs
- DELETE /api/pigs/{id}
- GET /api/events
- POST /api/events
- GET /api/weights
- POST /api/weights
- DELETE /api/weights/{id}
- GET /api/transactions
- POST /api/transactions
- DELETE /api/transactions/{id}
- GET /api/feed-logs
- POST /api/feed-logs
- DELETE /api/feed-logs/{id}
- GET /api/purchases
- POST /api/purchases
- DELETE /api/purchases/{id}
- GET /api/monthly-inputs
- POST /api/monthly-inputs
- DELETE /api/monthly-inputs/{id}

## Local run

1. Copy local.settings.sample.json to local.settings.json
2. Fill SQL and secret values
3. Install dependencies: npm install
4. Start Azure Functions host: npm start

## Apply SQL schema

Run api/sql/001_schema.sql against your Azure SQL database.
If your DB already exists from earlier setup, run api/sql/002_add_source_local_ids.sql too.
If your DB was created before feed centralization, also run api/sql/003_create_feed_tables.sql.
If your DB was created before monthly centralization, also run api/sql/004_create_monthly_inputs_table.sql.
If your DB was created before auth centralization, also run api/sql/005_create_auth_tables.sql.

## Required environment variables

- JWT_SECRET (required for auth endpoints)
- SQL_SERVER
- SQL_DATABASE
- SQL_USER
- SQL_PASSWORD

## Notes

- Current auth level is anonymous for quick bootstrap.
- Before production, switch to authenticated endpoints and enforce role checks.

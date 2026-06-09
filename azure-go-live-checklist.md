# Azure Go-Live Checklist (Current Codebase)

This checklist matches the current state of this workspace:
- Static frontend in root
- Azure Functions API in api/
- Central SQL persistence for pigs, events, weights, feed logs, purchases, transactions, monthly inputs, users/auth

## 0) Prerequisites already verified

- Azure CLI installed
- Azure CLI authenticated
- API dependencies installed

## 1) Initialize git and push to GitHub

Run in project root:

~~~powershell
git init
git add .
git commit -m "Initial Azure-ready Lacoline app"
git branch -M main
~~~

Create repository in GitHub web UI (example: lacoline-farm-manager), then:

~~~powershell
git remote add origin https://github.com/<your-user>/lacoline-farm-manager.git
git push -u origin main
~~~

## 2) Create Azure baseline resources

Use the helper script in scripts/deploy-azure.ps1:

~~~powershell
Set-Location "<project-root>"
.\scripts\deploy-azure.ps1 -SqlAdminPassword "<STRONG_PASSWORD>" -JwtSecret "<LONG_RANDOM_SECRET>"
~~~

What this creates:
- Resource group
- Azure SQL logical server
- Azure SQL database
- Firewall rule for Azure services

## 3) Create Static Web App and connect GitHub

In Azure Portal:
1. Create resource -> Static Web App
2. Name: swa-lacolline-prod
3. Region: South Central US
4. Source: GitHub repo and main branch
5. Build details:
- App location: /
- Api location: api
- Output location: /

Azure will generate GitHub Actions workflow automatically.

## 4) Configure environment variables in Static Web App

Add these in Static Web App -> Environment variables:
- SQL_SERVER=sql-lacolline-prod.database.windows.net
- SQL_DATABASE=sqldb-lacolline-prod
- SQL_USER=lacoadmin
- SQL_PASSWORD=<same strong password>
- JWT_SECRET=<same long random secret>

## 5) Run SQL scripts

Run these against Azure SQL in order:
1. api/sql/001_schema.sql
2. api/sql/002_add_source_local_ids.sql
3. api/sql/003_create_feed_tables.sql
4. api/sql/004_create_monthly_inputs_table.sql
5. api/sql/005_create_auth_tables.sql

## 6) First login after deployment

Default admin seed account:
- Username: admin
- Password: admin123

Immediately change the admin password from User Management.

## 7) Validate app behavior

- Login works
- User management calls API
- Pig CRUD persists after refresh/device change
- Feed logs/purchases/stock persist centrally
- Weights/events/finance/monthly inputs persist centrally
- Dashboard uses central data

## 8) Migrate old local browser data

Use Reports page migration actions in this order:
1. Migrate Pigs to Server
2. Migrate Events & Weights
3. Migrate Feed & Purchases
4. Migrate Transactions
5. Migrate Monthly Inputs

Because sourceLocalId is enabled, rerunning migration is safe (deduplicated).

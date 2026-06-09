# Lacolline Azure Deployment Plan

This plan uses your selected setup:
- Frontend hosting: Azure Static Web Apps
- API runtime: Azure Functions (Node.js)
- Database: Azure SQL Database
- Region: South Central US
- GitHub org/user: adesoye
- Repo: lacoline-farm-manager
- Resource group: rg-lacolline
- Prefix: Lacolline

## 1) One-time prerequisites

1. Install tools:
- Git
- GitHub CLI (optional)
- Azure CLI
- Node.js 20+

2. Sign in to Azure:

~~~powershell
az login
az account show
~~~

3. Register providers (safe to run once):

~~~powershell
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.Sql
~~~

## 2) Create GitHub repository and push this app

From the project folder:

~~~powershell
git init
git add .
git commit -m "Initial Lacolline app"
git branch -M main
git remote add origin https://github.com/adesoye/lacoline-farm-manager.git
git push -u origin main
~~~

If the repo does not exist yet, create it first in GitHub UI and then run the commands above.

## 3) Create Azure resource group

~~~powershell
az group create --name rg-lacolline --location "southcentralus"
~~~

## 4) Create Azure Static Web App (frontend)

Use the Azure Portal for the first creation because it also wires GitHub Actions automatically:

1. Create resource -> Static Web App
2. Name: swa-lacolline-prod
3. Region: South Central US
4. Deployment source: GitHub
5. Organization: adesoye
6. Repository: lacoline-farm-manager
7. Branch: main
8. Build details:
   - App location: /
   - Api location: api
   - Output location: /

After creation, Azure writes a GitHub Actions workflow and auto-deploys.

## 5) Add API project folder for central persistence

Create a new folder named api at repository root, then initialize Azure Functions Node project.

~~~powershell
mkdir api
cd api
npm init -y
npm install @azure/functions mssql
~~~

Minimum files to add in api:
- host.json
- local.settings.json (local only, do not commit secrets)
- src/functions files for endpoints (pigs, events, feedLogs, purchases, weights, transactions, monthlyInputs, auth)

## 6) Create Azure SQL logical server and database

Choose globally unique SQL server name before running. Example below uses sql-lacolline-prod.

~~~powershell
az sql server create --name sql-lacolline-prod --resource-group rg-lacolline --location southcentralus --admin-user lacoadmin --admin-password "<STRONG_PASSWORD>"
az sql db create --resource-group rg-lacolline --server sql-lacolline-prod --name sqldb-lacolline-prod --service-objective S0
~~~

Enable Azure services access (for quick start):

~~~powershell
az sql server firewall-rule create --resource-group rg-lacolline --server sql-lacolline-prod --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
~~~

## 7) Configure app settings in Static Web App

In Azure Portal -> Static Web App -> Environment variables, add:
- SQL_SERVER = sql-lacolline-prod.database.windows.net
- SQL_DATABASE = sqldb-lacolline-prod
- SQL_USER = lacoadmin
- SQL_PASSWORD = your strong password
- JWT_SECRET = long random secret

## 8) Data migration path from current local browser storage

1. Add a temporary "Migrate Local Data" button in the Reports area.
2. Read existing local data object from browser storage.
3. POST records to API in this order:
   - pigs
   - events
   - feedLogs
   - purchases
   - weights
   - transactions
   - monthlyInputs
4. After successful migration, set migrated flag in browser storage.
5. Keep backup JSON export as safety fallback.

## 9) Security hardening checklist

- Do not keep plaintext passwords in data tables.
- Move to hashed passwords immediately (bcrypt).
- Add role checks in API, not only in UI.
- Add per-farm tenant key and scope every query by farm_id.
- Rotate SQL admin password after first setup.
- Replace SQL user/password auth with Managed Identity when possible.

## 10) Rollout strategy

1. Deploy frontend and API with read-only API health endpoint first.
2. Switch one module at a time from local to API:
   - pigs
   - feed logs + purchases
   - weights
   - finance
   - monthly inputs
3. Keep local cache for offline fallback.
4. Add retry queue for failed writes.

## 11) Validation checklist after go-live

- Login works in deployed URL.
- Pig create/edit/delete persists across devices.
- Feed stock balances match after refresh.
- Finance totals match report totals.
- Export/backup still works.
- Role restrictions enforced by API.

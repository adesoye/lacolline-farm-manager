param(
  [string]$ResourceGroup = "rg-lacolline",
  [string]$Location = "southcentralus",
  [string]$StaticWebAppName = "swa-lacolline-prod",
  [string]$SqlServerName = "sql-lacolline-prod",
  [string]$SqlDatabaseName = "sqldb-lacolline-prod",
  [string]$SqlAdminUser = "lacoadmin",
  [string]$SqlAdminPassword = "",
  [string]$JwtSecret = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SqlAdminPassword)) {
  throw "SqlAdminPassword is required."
}
if ([string]::IsNullOrWhiteSpace($JwtSecret)) {
  throw "JwtSecret is required."
}

Write-Host "[1/7] Azure account" -ForegroundColor Cyan
az account show --output table | Out-Host

Write-Host "[2/7] Register providers" -ForegroundColor Cyan
az provider register --namespace Microsoft.Web | Out-Null
az provider register --namespace Microsoft.Sql | Out-Null

Write-Host "[3/7] Create resource group" -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location --output table | Out-Host

Write-Host "[4/7] Create SQL server/database" -ForegroundColor Cyan
az sql server create --name $SqlServerName --resource-group $ResourceGroup --location $Location --admin-user $SqlAdminUser --admin-password $SqlAdminPassword --output table | Out-Host
az sql db create --resource-group $ResourceGroup --server $SqlServerName --name $SqlDatabaseName --service-objective S0 --output table | Out-Host
az sql server firewall-rule create --resource-group $ResourceGroup --server $SqlServerName --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 --output table | Out-Host

Write-Host "[5/7] Next manual step: create Static Web App in Azure Portal with GitHub source" -ForegroundColor Yellow
Write-Host "  Name: $StaticWebAppName"
Write-Host "  App location: /"
Write-Host "  Api location: api"
Write-Host "  Output location: /"

Write-Host "[6/7] Required app settings (configure in Static Web App -> Environment variables)" -ForegroundColor Yellow
Write-Host "  SQL_SERVER=$SqlServerName.database.windows.net"
Write-Host "  SQL_DATABASE=$SqlDatabaseName"
Write-Host "  SQL_USER=$SqlAdminUser"
Write-Host "  SQL_PASSWORD=<hidden>"
Write-Host "  JWT_SECRET=<hidden>"

Write-Host "[7/7] SQL scripts to run in this order" -ForegroundColor Cyan
Write-Host "  api/sql/001_schema.sql"
Write-Host "  api/sql/002_add_source_local_ids.sql"
Write-Host "  api/sql/003_create_feed_tables.sql"
Write-Host "  api/sql/004_create_monthly_inputs_table.sql"
Write-Host "  api/sql/005_create_auth_tables.sql"

Write-Host "Done: infrastructure baseline created. Complete SWA GitHub hookup and SQL script execution to go live." -ForegroundColor Green

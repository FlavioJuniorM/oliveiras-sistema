$ErrorActionPreference = 'Stop'

$postgresRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\.postgresql')).Path
$bin = Join-Path $postgresRoot 'runtime\pgsql\bin'
$data = Join-Path $postgresRoot 'data'
$log = Join-Path $postgresRoot 'postgres.log'

if (-not (Test-Path (Join-Path $bin 'postgres.exe'))) {
  throw "PostgreSQL não encontrado em $bin"
}

if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
  throw "Cluster PostgreSQL não inicializado em $data"
}

$running = & (Join-Path $bin 'pg_ctl.exe') -D $data status 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host 'PostgreSQL já está em execução.'
  exit 0
}

& (Join-Path $bin 'pg_ctl.exe') -D $data -l $log start
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível iniciar o PostgreSQL. Consulte $log"
}

Write-Host 'PostgreSQL iniciado em localhost:5432.'

$postgresRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\.postgresql')).Path
$bin = Join-Path $postgresRoot 'runtime\pgsql\bin'
$data = Join-Path $postgresRoot 'data'

& (Join-Path $bin 'pg_ctl.exe') -D $data status
if ($LASTEXITCODE -ne 0) {
  Write-Host 'PostgreSQL está parado.'
  exit 1
}

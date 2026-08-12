$ErrorActionPreference = 'Stop'

$postgresRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\.postgresql')).Path
$bin = Join-Path $postgresRoot 'runtime\pgsql\bin'
$data = Join-Path $postgresRoot 'data'

& (Join-Path $bin 'pg_ctl.exe') -D $data -m fast stop
if ($LASTEXITCODE -eq 0) {
  Write-Host 'PostgreSQL parado.'
} else {
  Write-Host 'PostgreSQL já estava parado.'
}

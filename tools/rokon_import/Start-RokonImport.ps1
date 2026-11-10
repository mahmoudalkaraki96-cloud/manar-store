param([ValidateSet('sultan','bazar','tammouni')][string]$Source='sultan',[string]$WorkFolder='H:\RokonImport')
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path $WorkFolder | Out-Null
$resolvedWorkFolder=(Resolve-Path -LiteralPath $WorkFolder).Path
foreach($name in @('run-collector.mjs','collect-supplier.js','tammouni-collector.mjs','woo-normalize.mjs','rokon_import.py','README.md')){
 $sourceFile=Join-Path $PSScriptRoot $name
 $targetFile=Join-Path $resolvedWorkFolder $name
 if([IO.Path]::GetFullPath($sourceFile) -ne [IO.Path]::GetFullPath($targetFile)){Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force}
}
New-Item -ItemType Directory -Force -Path (Join-Path $resolvedWorkFolder 'tmp') | Out-Null
$env:TEMP=Join-Path $resolvedWorkFolder 'tmp'
$env:TMP=$env:TEMP
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1'
Push-Location -LiteralPath $resolvedWorkFolder
try{
 if(!(Test-Path -LiteralPath 'node_modules\playwright')){
  & npm.cmd install --no-audit --no-fund playwright wrangler
  if($LASTEXITCODE -ne 0){throw 'تعذر تثبيت مكتبات التشغيل'}
 }
 & node .\run-collector.mjs $Source
 if($LASTEXITCODE -ne 0){throw 'توقف الجمع؛ راجع الرسالة الظاهرة'}
}finally{Pop-Location}

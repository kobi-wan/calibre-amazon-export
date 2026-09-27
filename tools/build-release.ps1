$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json).version
$scriptPath = Join-Path $projectRoot 'calibre-amazon-export.user.js'
$scriptText = Get-Content -Raw -LiteralPath $scriptPath
if ($scriptText -notmatch ('(?m)^// @version\s+' + [regex]::Escape($version) + '\s*$')) {
    throw 'Userscript and package versions do not match.'
}
$outputDirectory = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$stagingDirectory = Join-Path ([IO.Path]::GetTempPath()) ('calibre-amazon-release-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path (Join-Path $stagingDirectory 'tools') -Force | Out-Null
$files = @('calibre-amazon-export.user.js', 'Copy to calibre clipboard.cmd', 'tools/opf_clipboard.py', 'README.md', 'CHANGELOG.md')
if (Test-Path -LiteralPath (Join-Path $projectRoot 'LICENSE')) { $files += 'LICENSE' }
foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stagingDirectory $file)
}
Copy-Item -LiteralPath $scriptPath -Destination $outputDirectory
$header = [regex]::Match($scriptText, '(?s)^// ==UserScript==.*?// ==/UserScript==').Value
if (-not $header) { throw 'Userscript metadata header missing.' }
[IO.File]::WriteAllText((Join-Path $outputDirectory 'calibre-amazon-export.meta.js'), $header + "`n", [Text.UTF8Encoding]::new($false))
Compress-Archive -Path (Join-Path $stagingDirectory '*') -DestinationPath (Join-Path $outputDirectory "calibre-amazon-export-$version-windows.zip") -Force
Write-Output "Release assets: $outputDirectory"

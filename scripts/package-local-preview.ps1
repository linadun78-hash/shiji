[CmdletBinding()]
param(
    [string]$OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not [IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $projectRoot $OutputDirectory
}
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
$rootPath = [IO.Path]::GetFullPath($projectRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$distPath = Join-Path $rootPath "dist"
$distPrefix = $distPath + [IO.Path]::DirectorySeparatorChar

if ($outputPath -ne $distPath -and -not $outputPath.StartsWith($distPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must stay inside dist: $outputPath"
}

function Assert-NoReparsePoint([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Reparse points, junctions and symbolic links are not release inputs or outputs: $Path"
    }
}

# Inspect each ancestor before creating output or traversing any source directory.
$ancestor = $outputPath
while ($ancestor) {
    Assert-NoReparsePoint $ancestor
    $ancestor = [IO.Path]::GetDirectoryName($ancestor)
}

function Get-ReleaseFiles([string]$Path) {
    Assert-NoReparsePoint $Path
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Name -match '^(\.env($|\.)|settings\.json$|credentials($|\.))|\.(pem|key|p12|pfx)$') {
        throw "Sensitive credential file is not allowed in a release: $Path"
    }
    if ($item.PSIsContainer) {
        foreach ($child in Get-ChildItem -LiteralPath $Path -Force) {
            Get-ReleaseFiles $child.FullName
        }
    } else {
        $item.FullName
    }
}

$manifestPath = Join-Path $projectRoot "manifest.json"
$sourcePath = Join-Path $projectRoot "src"
$assetsPath = Join-Path $projectRoot "assets"
foreach ($requiredPath in @($manifestPath, $sourcePath, $assetsPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required release input is missing: $requiredPath"
    }
}

$releaseFiles = @(
    foreach ($requiredPath in @($manifestPath, $sourcePath, $assetsPath)) {
        Get-ReleaseFiles $requiredPath
    }
)
[Array]::Sort($releaseFiles, [StringComparer]::Ordinal)
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+(\.\d+){0,3}$') {
    throw "manifest.json must contain a numeric extension version"
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$stagePath = Join-Path $outputPath (".staging-local-preview-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $outputPath ("xhs-task-material-collector-v{0}.zip" -f $version)
$hashPath = "$zipPath.sha256"
Assert-NoReparsePoint $zipPath
Assert-NoReparsePoint $hashPath
$stagedZip = Join-Path $stagePath "release.zip"
$stagedHash = Join-Path $stagePath "release.sha256"

try {
    New-Item -ItemType Directory -Path $stagePath -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::Open($stagedZip, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($filePath in $releaseFiles) {
            $entryName = $filePath.Substring($rootPath.Length + 1).Replace("\", "/")
            $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
            $sourceStream = [IO.File]::OpenRead($filePath)
            try {
                $entryStream = $entry.Open()
                try { $sourceStream.CopyTo($entryStream) } finally { $entryStream.Dispose() }
            } finally { $sourceStream.Dispose() }
        }
    } finally { $archive.Dispose() }

    $archive = [IO.Compression.ZipFile]::OpenRead($stagedZip)
    try {
        $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
        if (-not ($entryNames -contains "manifest.json")) {
            throw "Release ZIP is missing required entry: manifest.json"
        }
        foreach ($requiredEntry in @("src/", "assets/")) {
            $hasRequiredEntry = @(
                $entryNames | Where-Object {
                    $_.StartsWith($requiredEntry, [StringComparison]::OrdinalIgnoreCase)
                }
            ).Count -gt 0
            if (-not $hasRequiredEntry) {
                throw "Release ZIP is missing required entry: $requiredEntry"
            }
        }
        if ($entryNames | Where-Object { $_ -match "^(backend|tests|docs|\.env)(/|$)" }) {
            throw "Release ZIP contains files outside the extension runtime"
        }
    } finally {
        $archive.Dispose()
    }

    $sha256 = [Security.Cryptography.SHA256]::Create()
    $zipStream = [IO.File]::OpenRead($stagedZip)
    try {
        $hashBytes = $sha256.ComputeHash($zipStream)
    } finally {
        $zipStream.Dispose()
        $sha256.Dispose()
    }
    $hashText = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
    [IO.File]::WriteAllText($stagedHash, "$hashText`r`n", [Text.Encoding]::ASCII)
    Copy-Item -LiteralPath $stagedZip -Destination $zipPath -Force
    Copy-Item -LiteralPath $stagedHash -Destination $hashPath -Force
    Write-Output "Created $zipPath"
    Write-Output "SHA256 $hashPath"
} finally {
    if (Test-Path -LiteralPath $stagePath) {
        Remove-Item -LiteralPath $stagePath -Recurse -Force
    }
}

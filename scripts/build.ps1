param([string]$Python = "python")
$ErrorActionPreference = "Stop"
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    & $Python -m pip install -r requirements.txt pyinstaller==6.16.0
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
    & $Python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) { throw "Tests failed" }
    $buildArgs = @("--noconfirm", "--clean", "--onefile", "--windowed", "--name", "JianpuUke",
        "--add-data", "web;web", "--collect-all", "PIL", "--exclude-module", "numpy",
        "--exclude-module", "tkinter", "--exclude-module", "IPython", "--exclude-module", "matplotlib")
    # Some managed Python runtimes ship an additional SSL certificate asset.
    # Preserve the runtime's existing certificate behavior in a frozen application.
    $sslAsset = & $Python -c "import ssl,pathlib; p=pathlib.Path(ssl.__file__).with_name('codex-rejected-cas.pem'); print(str(p) if p.is_file() else '')"
    if ($sslAsset) { $buildArgs += @("--add-data", "$sslAsset;.") }
    & $Python -m PyInstaller @buildArgs app.py
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    & $Python scripts/package.py
    if ($LASTEXITCODE -ne 0) { throw "Packaging failed" }
    Write-Host "Built dist/JianpuUke.exe and portable ZIP"
} finally { Pop-Location }

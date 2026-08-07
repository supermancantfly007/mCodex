param(
  [int]$Port = 9222,
  [string]$ProfileDirectory = ""
)

function Test-CdpEndpoint {
  foreach ($hostName in @('localhost', '127.0.0.1', '::1')) {
    $url = if ($hostName -eq '::1') {
      "http://[$hostName]:$Port/json/version"
    } else {
      "http://$hostName`:$Port/json/version"
    }
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch {}
  }
  return $false
}

if (Test-CdpEndpoint) {
  Write-Host "Codex 控制通道已在线。"
  exit 0
}

$running = Get-Process ChatGPT -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "检测到 Codex Desktop 正在运行，但尚未开启控制通道。" -ForegroundColor Yellow
  Write-Host "请完全退出 Codex Desktop，然后按 Enter 继续。"
  [void](Read-Host "按 Enter 继续")
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Process ChatGPT -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
  }
  if (Get-Process ChatGPT -ErrorAction SilentlyContinue) {
    Write-Error "Codex 仍在运行。请完全退出后再启动。"
    exit 1
  }
}

$package = Get-AppxPackage -Name 'OpenAI.Codex'
if (-not $package) {
  Write-Error "没有找到微软商店版 Codex（OpenAI.Codex）。"
  exit 1
}

$executable = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
$arguments = @(
  '--remote-debugging-address=127.0.0.1',
  "--remote-debugging-port=$Port"
)

if ([string]::IsNullOrWhiteSpace($ProfileDirectory)) {
  $ProfileDirectory = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\RemoteBridgeProfile'
}
New-Item -ItemType Directory -Path $ProfileDirectory -Force | Out-Null
$arguments += "--user-data-dir=$ProfileDirectory"

Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Normal

Write-Host "Codex 已启动，正在等待控制通道就绪..."

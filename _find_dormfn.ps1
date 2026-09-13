[Console]::OutputEncoding = [Text.Encoding]::UTF8
$idx = Get-Content index.html -Raw -Encoding UTF8
Write-Output "=== 寝室分配相关函数/调用 ==="
($idx -split "`n" | Select-String -Pattern 'function \w*[Dd]orm\w*\(|openDorm\w*\(|dormAssign|入住' | Select-Object -First 20 | ForEach-Object { $_.LineNumber.ToString() + ': ' + $_.Line.Trim().Substring(0, [Math]::Min(130, $_.Line.Trim().Length)) })

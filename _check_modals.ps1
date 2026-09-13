[Console]::OutputEncoding = [Text.Encoding]::UTF8
$idx = Get-Content index.html -Raw -Encoding UTF8
foreach ($id in @('cbItemDetailModal','cbItemEditorModal','cbBankProfileModal','dormCreditModal','monthlySettleModal')) {
  $html = ([regex]::Matches($idx, 'id="' + $id + '"')).Count
  $js = ([regex]::Matches($idx, "getElementById\('" + $id + "'\)")).Count
  $open = ([regex]::Matches($idx, 'openModal\(' + $id + '\)')).Count
  Write-Output ("$id => HTML:$html JS读:$js openModal调用:$open")
}
Write-Output "=== openDormCredit 函数体 ==="
$lines = $idx -split "`n"
$n = ($lines | Select-String -SimpleMatch 'function openDormCredit' | Select-Object -First 1).LineNumber
if ($n) { for ($i = $n - 1; $i -lt [Math]::Min($n + 12, $lines.Count); $i++) { Write-Output (("L" + ($i + 1) + ": ") + $lines[$i].Trim().Substring(0, [Math]::Min(140, $lines[$i].Trim().Length))) } } else { Write-Output 'openDormCredit 未定义！' }

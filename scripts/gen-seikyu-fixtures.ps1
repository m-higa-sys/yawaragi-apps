# UTF-8 一時ファイル群を Shift_JIS(CP932) に変換して scripts/fixtures/seikyu/ へ出力する。
$src = Join-Path $PSScriptRoot 'fixtures/seikyu/_utf8_tmp'
$dst = Join-Path $PSScriptRoot 'fixtures/seikyu'
$sjis = [System.Text.Encoding]::GetEncoding(932)
Get-ChildItem -Path $src -Filter '*.csv' | ForEach-Object {
  $text = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
  [System.IO.File]::WriteAllText((Join-Path $dst $_.Name), $text, $sjis)
  Write-Output ("SJIS化: " + $_.Name)
}
Remove-Item -Recurse -Force $src
Write-Output "完了（UTF-8一時ファイルは削除しました）"

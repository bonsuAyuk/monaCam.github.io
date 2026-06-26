$files = @('marketplace.html','pricing.html','profile.html','password-reset.html','viewer-dashboard.html','creator-earnings.html')
foreach ($f in $files) {
  $c = Get-Content $f -Raw
  if ($c -notmatch 'nav\.js') {
    $tag = '  <script src="js/nav.js"></script>' + "`n" + '</body>'
    $c = $c.Replace('</body>', $tag)
    Set-Content $f $c -NoNewline
    Write-Host "Updated: $f"
  } else {
    Write-Host "Skip: $f"
  }
}
Write-Host "All done"

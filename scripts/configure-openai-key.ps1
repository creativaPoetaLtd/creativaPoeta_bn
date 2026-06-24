param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\.env.local")
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Activer OpenAI - Creativa Poeta"
$form.Size = New-Object System.Drawing.Size(560, 260)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = "Collez votre cle API OpenAI"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(24, 20)
$title.AutoSize = $true
$form.Controls.Add($title)

$help = New-Object System.Windows.Forms.Label
$help.Text = "La cle sera enregistree uniquement dans .env.local et ne sera jamais affichee dans les logs."
$help.Location = New-Object System.Drawing.Point(26, 58)
$help.Size = New-Object System.Drawing.Size(500, 40)
$form.Controls.Add($help)

$keyBox = New-Object System.Windows.Forms.TextBox
$keyBox.Location = New-Object System.Drawing.Point(28, 104)
$keyBox.Size = New-Object System.Drawing.Size(495, 30)
$keyBox.UseSystemPasswordChar = $true
$keyBox.Font = New-Object System.Drawing.Font("Consolas", 11)
$form.Controls.Add($keyBox)

$save = New-Object System.Windows.Forms.Button
$save.Text = "Enregistrer"
$save.Location = New-Object System.Drawing.Point(338, 158)
$save.Size = New-Object System.Drawing.Size(90, 34)
$form.Controls.Add($save)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "Annuler"
$cancel.Location = New-Object System.Drawing.Point(433, 158)
$cancel.Size = New-Object System.Drawing.Size(90, 34)
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancel)

$form.AcceptButton = $save
$form.CancelButton = $cancel
$script:apiKey = ""

$save.Add_Click({
  $candidate = $keyBox.Text.Trim()
  if ($candidate.Length -lt 20 -or -not $candidate.StartsWith("sk-")) {
    [System.Windows.Forms.MessageBox]::Show(
      "Cette valeur ne ressemble pas a une cle API OpenAI.",
      "Cle invalide",
      "OK",
      "Warning"
    ) | Out-Null
    return
  }
  $script:apiKey = $candidate
  $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.Close()
})

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK -or [string]::IsNullOrWhiteSpace($script:apiKey)) {
  exit 1
}

$resolved = [IO.Path]::GetFullPath($EnvFile)
$content = if (Test-Path -LiteralPath $resolved) {
  [IO.File]::ReadAllText($resolved)
} else {
  ""
}

if ($content -match "(?m)^OPENAI_API_KEY=.*$") {
  $content = [regex]::Replace(
    $content,
    "(?m)^OPENAI_API_KEY=.*$",
    "OPENAI_API_KEY=$script:apiKey"
  )
} else {
  if ($content.Length -gt 0 -and -not $content.EndsWith([Environment]::NewLine)) {
    $content += [Environment]::NewLine
  }
  $content += "OPENAI_API_KEY=$script:apiKey" + [Environment]::NewLine
}

if ($content -notmatch "(?m)^OPENAI_MODEL=") {
  $content += "OPENAI_MODEL=gpt-5-mini" + [Environment]::NewLine
}

[IO.File]::WriteAllText(
  $resolved,
  $content,
  [Text.UTF8Encoding]::new($false)
)

[System.Windows.Forms.MessageBox]::Show(
  "Cle enregistree. Revenez dans Codex pour terminer l'activation.",
  "OpenAI configure",
  "OK",
  "Information"
) | Out-Null
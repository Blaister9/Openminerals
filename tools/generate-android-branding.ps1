# Rebuild the checked-in Android icons on Windows. No fonts or media are downloaded.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandingDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\mobile\assets'))
[System.IO.Directory]::CreateDirectory($brandingDirectory) | Out-Null
$topFace = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(218,435),[System.Drawing.PointF]::new(592,307),[System.Drawing.PointF]::new(806,445),[System.Drawing.PointF]::new(430,581))
$leftFace = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(218,435),[System.Drawing.PointF]::new(430,581),[System.Drawing.PointF]::new(430,686),[System.Drawing.PointF]::new(218,540))
$rightFace = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(430,581),[System.Drawing.PointF]::new(806,445),[System.Drawing.PointF]::new(806,550),[System.Drawing.PointF]::new(430,686))
foreach ($brandingName in @('icon.png','adaptive-foreground.png')) {
  $bitmap = [System.Drawing.Bitmap]::new(1024,1024,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $resources = [System.Collections.Generic.List[System.IDisposable]]::new()
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    if ($brandingName -eq 'icon.png') {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#090F15'))
      $ring = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#273541'),3); $resources.Add($ring)
      $graphics.DrawEllipse($ring,160,160,704,704)
    } else { $graphics.Clear([System.Drawing.Color]::Transparent) }
    $left = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#93652D')); $resources.Add($left)
    $right = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#BC8C45')); $resources.Add($right)
    $gold = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Point]::new(218,307),[System.Drawing.Point]::new(806,581),[System.Drawing.ColorTranslator]::FromHtml('#FFF0BC'),[System.Drawing.ColorTranslator]::FromHtml('#BA8235')); $resources.Add($gold)
    $edge = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#F5DDA0'),5); $resources.Add($edge)
    $line = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#D8B676'),3); $resources.Add($line)
    $graphics.FillPolygon($left,$leftFace); $graphics.FillPolygon($right,$rightFace); $graphics.FillPolygon($gold,$topFace); $graphics.DrawPolygon($edge,$topFace)
    $graphics.DrawLine($line,430,597,790,466); $graphics.DrawLine($line,430,655,790,526)
    $stamp = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#745027')); $resources.Add($stamp)
    $font = [System.Drawing.Font]::new('Segoe UI',60,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel); $resources.Add($font)
    $format = [System.Drawing.StringFormat]::new(); $resources.Add($format); $format.Alignment=[System.Drawing.StringAlignment]::Center; $format.LineAlignment=[System.Drawing.StringAlignment]::Center
    $graphics.TranslateTransform(512,450); $graphics.RotateTransform(-18); $graphics.DrawString('OM',$font,$stamp,[System.Drawing.RectangleF]::new(-150,-60,300,120),$format)
    $graphics.ResetTransform(); $bitmap.Save((Join-Path $brandingDirectory $brandingName),[System.Drawing.Imaging.ImageFormat]::Png)
  } finally { foreach ($resource in $resources) { $resource.Dispose() }; $graphics.Dispose(); $bitmap.Dispose() }
}
Write-Output 'Generated Android branding PNGs from the repository vector design.'

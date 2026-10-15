# Cloudflare Pages の _headers（セキュリティヘッダー）を作る。HTML 内の <script> の中身が変わったら再実行する
# （bump-version.sh から自動で呼ばれる）。インラインスクリプトはハッシュで許可し、それ以外の外部スクリプトは読まない。
import base64, hashlib, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parents[1]
hashes = set()
for f in ['index.html', 'en/index.html', 'app.html', 'en/app.html', 'display.html', '404.html', 'en/404.html', *[str(x.relative_to(ROOT)) for x in sorted(ROOT.glob('legal/*.html')) + sorted(ROOT.glob('en/legal/*.html'))]]:
    for m in re.finditer(r'<script>(.*?)</script>', (ROOT / f).read_text(), re.S):
        hashes.add("'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode() + "'")
csp = '; '.join([
    "default-src 'self'",
    # Google アナリティクス（紹介ページだけで src/lp/analytics.js が読み込む）以外の外部スクリプトは許可しない
    "script-src 'self' https://www.googletagmanager.com " + ' '.join(sorted(hashes)),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com",
    "connect-src 'self' ws: wss: https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",  # OBS（手元の WebSocket）とアクセス解析
    "media-src 'self' blob:",
    "frame-src 'self'", "frame-ancestors 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'",
])
(ROOT / '_headers').write_text(f"""/*
  Cache-Control: public, max-age=0, must-revalidate
  Content-Security-Policy: {csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: microphone=(self), camera=(self), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Strict-Transport-Security: max-age=31536000

# 本番は kanpe.yoneken.xyz。同じ中身の kanpe-ahr.pages.dev は検索結果に出さない（テスト URL には Cloudflare が自動で付ける）
https://kanpe-ahr.pages.dev/*
  X-Robots-Tag: noindex

/sitemap.xml
  Content-Type: application/xml; charset=utf-8
""")
print('_headers:', len(hashes), 'inline script hashes')

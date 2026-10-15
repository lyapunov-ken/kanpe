# sitemap.xml を作る（bump-version.sh から自動で呼ばれる）。検索に出したいページだけを載せ、日本語版と英語版を対にして知らせる。
# 最終更新日は、そのページのファイルを最後に変えた日（まだコミットしていない変更があれば今日）。
#   python3 tools/make-sitemap.py
import datetime, pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = 'https://kanpe.yoneken.xyz'
# （日本語版の URL, ファイル, 英語版の URL, ファイル）。URL は Cloudflare Pages が最終的に返す形（.html なし）
PAIRS = [('/', 'index.html', '/en/', 'en/index.html')] + [
    (f'/legal/{s}', f'legal/{s}.html', f'/en/legal/{s}', f'en/legal/{s}.html') for s in ('terms', 'privacy', 'tokushoho')]

def lastmod(f):
    git = lambda *a: subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True)
    if git('status', '--porcelain', '--', f).stdout.strip():
        return datetime.date.today().isoformat()
    return git('log', '-1', '--format=%cs', '--', f).stdout.strip() or datetime.date.today().isoformat()

rows = []
for ja_url, ja_file, en_url, en_file in PAIRS:
    alts = (f'    <xhtml:link rel="alternate" hreflang="ja" href="{SITE}{ja_url}"/>\n'
            f'    <xhtml:link rel="alternate" hreflang="en" href="{SITE}{en_url}"/>\n'
            f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{ja_url}"/>\n')
    for url, f in ((ja_url, ja_file), (en_url, en_file)):
        rows.append(f'  <url>\n    <loc>{SITE}{url}</loc>\n    <lastmod>{lastmod(f)}</lastmod>\n{alts}  </url>\n')
(ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + ''.join(rows) + '</urlset>\n')
print('sitemap.xml:', len(rows), 'urls')

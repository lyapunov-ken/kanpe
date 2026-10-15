# 公開手順（無料・ランニングコスト0円）

KANPE の無料版は静的ファイルだけで動きます。下のどれかに置けば、HTTPS の URL でブラウザのマイクがそのまま使えます。
（音声認識は https か localhost でしか動きません。どの方法も自動で https になります）

## A. GitHub Pages（おすすめ・URL が `https://ユーザー名.github.io/kanpe/` になる）

1. GitHub で新しいリポジトリを作る（例：`kanpe`）。無料アカウントでは **Public** にする必要があります
2. 「uploading an existing file」をクリックし、このフォルダの中身を**すべて**ドラッグ＆ドロップ → Commit changes
   - Finder で `.nojekyll` が見えない場合は `Cmd + Shift + .` で表示してから一緒に入れてください
3. リポジトリの Settings → Pages → Build and deployment で
   Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして Save
4. 1〜2分後、同じ画面に表示される URL を開く（トップがランディングページ、「無料ではじめる」でコンソール）

## B. Netlify Drop（アカウント作成だけ・一番かんたん）

1. https://app.netlify.com/drop を開いてサインアップ
2. この `kanpesystem2` フォルダをそのままドラッグ＆ドロップ
3. 表示された `https://〜.netlify.app` を開く

## C. Cloudflare Pages（独自ドメインを使いたいとき）

1. Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Upload assets
2. このフォルダをアップロード → Deploy

## 公開後に確認すること

- ランディングページのモニターで文字が動いている
- 「無料ではじめる」→「話しはじめる」→ マイクを許可 → 話した言葉が出る
- OBS 用 URL は、コンソールの「URLをコピー」で公開先の URL から作られます

## SEO とアクセス解析（GA4）

### 検索エンジン向けの設定（リポジトリに入っているもの）
- `robots.txt`：すべて許可（`/api/` だけ除外）＋ サイトマップの場所
- `sitemap.xml`：トップ・規約の日本語版と英語版（対になるページを hreflang で知らせる）。`tools/make-sitemap.py` が作り、`bump-version.sh` から自動で作り直す。ページを足したら `PAIRS` に足す
- 正規 URL は `.html` なし（Cloudflare Pages が `/legal/privacy.html` を `/legal/privacy` へ転送するため）
- `404.html`・`en/404.html`：ない URL を「404」で返す（これが無いと、どの URL でもトップページを 200 で返してしまう）
- コンソール（`app.html`）と表示ビュー（`display.html`）は `noindex`（検索の入口はトップページにまとめる）
- `kanpe-ahr.pages.dev`（本番と同じ中身）は `_headers` で `noindex`。テスト URL には Cloudflare が自動で付ける
- トップページには構造化データ（JSON-LD：WebSite・WebApplication と料金）を入れている

### Google Search Console（最初に1回）
1. https://search.google.com/search-console で「プロパティを追加」→「ドメイン」に `kanpe.yoneken.xyz`（または親の `yoneken.xyz`）
2. 表示された TXT レコードを Cloudflare の DNS（yoneken.xyz のゾーン）に追加して「確認」
3. 「サイトマップ」に `https://kanpe.yoneken.xyz/sitemap.xml` を送信
4. 「URL 検査」でトップページを調べ、「インデックス登録をリクエスト」

### Google アナリティクス 4
- 読み込むのは `src/lp/analytics.js`。紹介ページ（トップ・規約・404）だけで、アプリの画面では読み込まない
- 測定 ID（`G-` で始まる）を `GA_ID` に入れて `./tools/bump-version.sh` → 公開。空のあいだは何も送らない
- 計測するのは本番のドメイン（kanpe.yoneken.xyz）だけ。テスト URL や手元で確かめるときは `?ga=debug` を付けて開き、GA の「DebugView」で見る
- 送るイベント：ページ表示（GA の自動計測）、`cta_click`（アプリへのボタン。`link_location`＝押した場所）、`begin_checkout`（お手軽プランの申し込みボタン。金額つき）
- 送る URL は `utm_` 以外のパラメータと `#` 以降を外す。広告の機能（Google シグナル・広告のパーソナライズ）は使わない。EU・英国・スイスは Cookie なし、ブラウザの「トラッキングしない」（GPC / DNT）では読み込まない
- GA の管理画面でしておくこと：
  1. 「管理」→「プロパティを作成」（タイムゾーン：日本、通貨：日本円）→ ウェブのデータストリームに `https://kanpe.yoneken.xyz` → 測定 ID を控える
  2. 「データの保持」を 14 か月に
  3. 「Google シグナルのデータ収集」はオフのまま
  4. 「イベント」→ `begin_checkout` を「キーイベント」に
  5. 「データストリーム」→「タグ設定」→「除外する参照のリスト」に `checkout.stripe.com` を追加（決済から戻ったときに参照元が Stripe にならないように）
- 計測の範囲を変えるときは、プライバシーポリシー（`tools/make-legal.py` の「アクセス解析」）とトップページの「データの扱い」の文言もそろえる

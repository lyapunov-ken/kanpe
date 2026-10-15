# 公開のしくみと手順

KANPE は GitHub のリポジトリ `lyapunov-ken/kanpe` と Cloudflare Pages のプロジェクト `kanpe` がつながっていて、push するだけで公開されます。ビルドはありません（リポジトリ直下をそのまま公開）。

| ブランチ | 公開先 | 用途 |
| --- | --- | --- |
| `main` | https://kanpe.yoneken.xyz （と https://kanpe-ahr.pages.dev ） | 本番。入れた時点で自動で公開 |
| それ以外 | `https://<ブランチ名>.kanpe-ahr.pages.dev` | テスト URL。push から1分ほどで出る。本番には影響しない |

- ブランチ名は小文字になり、英数字以外は `-` に置き換わります（`feat/vj-1px` → `https://feat-vj-1px.kanpe-ahr.pages.dev`）
- テスト URL には検索除け（`X-Robots-Tag: noindex`）が自動で付きます
- デプロイごとに `https://<ランダム>.kanpe-ahr.pages.dev` という固定の URL も出ます（前の版との見比べに使えます）

## いつもの更新（マイナーアップデート）

1. `main` から作業ブランチを切る（例 `fix/caption-wrap`）
2. 直す。`app.html` を変えたら `python3 tools/make-en-app.py`、`functions/` を変えたら `node tools/test-api.mjs`
3. push → テスト URL でパソコンとスマホから確認
4. 本番に出すときは、作業ブランチで `./tools/bump-version.sh` を実行して push → `main` に取り込む（GitHub のプルリクエストでマージ）
5. まずかったら、Cloudflare ダッシュボード → Workers & Pages → kanpe → デプロイ → 前の版の「…」→ ロールバック

Cursor では `/preview`（テスト URL まで）と `/release`（本番まで）の手順を呼び出せます。

## 環境変数（Cloudflare Pages → kanpe → 設定 → 変数とシークレット）

本番とプレビュー（テスト URL）で別々に設定します。秘密の値はファイルやチャットに書かないでください。

| 変数 | 本番 | プレビュー |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | ライブのキー（`sk_live_…` / `rk_live_…`） | テストのキー（`sk_test_…`） |
| `LICENSE_SECRET` | 32文字以上のランダムな文字列 | 本番とは別の文字列 |
| `STRIPE_WEBHOOK_SECRET` | ライブの Webhook の `whsec_…` | テストの Webhook の `whsec_…`（送信先は固定のテスト URL） |
| `RESEND_API_KEY` | Resend の API キー | テストでもメールを送るなら |
| `MAIL_FROM` | `KANPE <noreply@yoneken.xyz>` | 同じでよい |
| `MAIL_REPLY_TO` | 問い合わせ先（任意） | 同じでよい |
| `SITE_URL` | `https://kanpe.yoneken.xyz` | **設定しない**（入れると決済後に本番へ戻され、API の同一オリジン確認でも弾かれる） |
| `STRIPE_PORTAL_CONFIG` | 任意 | 任意 |
| `PRO_ENABLED` | おトクプランを受け付けるとき `1` | 試すときだけ `1` |

2026-10-15 時点で、プレビューは未設定です。未設定のテスト URL では、申し込みボタンが「受付を準備しています」になります。

テスト用の Stripe の準備（商品・価格・Webhook）は、テストのキーで
`SITE_URL=https://dev.kanpe-ahr.pages.dev STRIPE_SECRET_KEY=sk_test_… node tools/stripe-setup.mjs`
のように、Webhook の送信先にしたい固定のテスト URL（この例では `dev` ブランチ）を指定して実行します。テスト URL ではテストカード `4242 4242 4242 4242`（期限は未来の日付・CVC は任意）で、決済からライセンス発行まで試せます。

テスト URL を自分だけに見せたいときは、設定 → 一般 → 「プレビューを制限」で Cloudflare のログインを必須にできます（本番は影響を受けません）。

## 公開後に確認すること

- ランディングページのモニターで文字が動いている
- 「無料ではじめる」→ 初回の3ステップガイド →「話しはじめる」→ マイクを許可 → 話した言葉が出る
- OBS 用 URL は、コンソールの「URLをコピー」で公開先の URL から作られる

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
- 測定 ID は `GA_ID`（いまは G-YK9R5RH3V8）。変えたら `./tools/bump-version.sh` → 公開。空にすると何も送らない
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

## 別の場所に置く場合（参考）

無料版は静的ファイルだけでも動きます（決済とメールの API は Cloudflare Pages Functions が必要）。GitHub Pages や Netlify に置く場合は、リポジトリの中身をそのままアップロードしてください。音声認識は https か localhost でしか動きません。

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

## 別の場所に置く場合（参考）

無料版は静的ファイルだけでも動きます（決済とメールの API は Cloudflare Pages Functions が必要）。GitHub Pages や Netlify に置く場合は、リポジトリの中身をそのままアップロードしてください。音声認識は https か localhost でしか動きません。

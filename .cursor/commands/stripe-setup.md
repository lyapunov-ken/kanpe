# Stripe の準備（stripe-setup）

1. テストモードのキーで実行する：`STRIPE_SECRET_KEY=sk_test_… node tools/stripe-setup.mjs`（おトクプランを作らないなら `--plus-only`）
   - キーはユーザーにターミナルで入力してもらう。チャットやファイルに書かない
2. 表示された値を Cloudflare Pages の環境変数（`STRIPE_SECRET_KEY`、`LICENSE_SECRET`、`STRIPE_PORTAL_CONFIG`、`STRIPE_WEBHOOK_SECRET`）に入れる手順を案内する
   - テストモードの値は「プレビュー」、ライブモードの値は「本番」に入れる。`SITE_URL` は本番だけ（`DEPLOY.md` の表を参照）
3. ライブモードで実行するのは、ユーザーが明示的に頼んだときだけ

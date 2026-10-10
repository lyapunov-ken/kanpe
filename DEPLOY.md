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

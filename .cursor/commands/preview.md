# テスト URL で確認（preview）

いまの変更を、本番に影響しないテスト URL に出して確認します。

1. `main` にいるなら、変更内容が分かる名前で作業ブランチを切る（例 `feat/vj-1px`、`fix/caption-wrap`）
2. `app.html` を変えていたら `python3 tools/make-en-app.py`。`functions/` を変えていたら `node tools/test-api.mjs`
3. `python3 -m http.server 8787 --bind 127.0.0.1` で手元確認（コンソールにエラー、特に CSP 違反が出ないこと）
4. commit して `git push -u origin <ブランチ名>`
5. 1分ほどで出るテスト URL `https://<ブランチ名の / を - にしたもの>.kanpe-ahr.pages.dev/` を示し、確認してほしい点を箇条書きで伝える
   - 初回ガイドを見るなら `app.html?welcome=1`、VJ なら `display.html?demo=1&layout=vj&vj=micro`
   - 決済はプレビュー用の環境変数を入れてある場合だけ（テストカード `4242 4242 4242 4242`）
6. 本番に出すのは `/release`。`main` へはユーザーの了承なしに取り込まない

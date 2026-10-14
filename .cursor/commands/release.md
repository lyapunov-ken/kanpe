# 本番に出す（release）

作業ブランチの内容を本番（kanpe.yoneken.xyz）に出す前のチェックと準備です。`main` に入れた時点で自動で公開されます。

1. `app.html` を変えていたら `python3 tools/make-en-app.py` で `en/app.html` を作り直し、日本語が残っていないか確認する
2. 規約の文面や運営者情報（`tools/make-legal.py` の `SELLER`）を変えていたら `python3 tools/make-legal.py`
3. `node tools/test-api.mjs` を実行し、全部通ることを確認する
4. `./tools/bump-version.sh` を実行（JS/CSS の `?v=` 更新と `_headers` の再生成）して commit・push
5. テスト URL（`https://<ブランチ名>.kanpe-ahr.pages.dev/`）で `index.html`・`app.html`・`display.html?demo=1`・`en/app.html` を開き、コンソールにエラーがないか確認する
6. 変更点の要約を示し、**ユーザーの了承を得てから** `main` に取り込む（GitHub でプルリクエストを作ってマージ、または `git checkout main && git merge --ff-only <ブランチ> && git push`）
7. 数分後に https://kanpe.yoneken.xyz で反映を確認する。問題があれば Cloudflare ダッシュボードの「デプロイ」から前の版にロールバック

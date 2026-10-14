# 規約ページを更新する（update-legal）

1. 変更したい内容（運営者情報・条文・更新日）をユーザーに確認する
2. `tools/make-legal.py` の `SELLER`・`UPDATED`・本文を直す（メールアドレスは公開用の窓口のみ。個人のアドレスは載せない）
3. `python3 tools/make-legal.py && ./tools/bump-version.sh`
4. `legal/` と `en/legal/` の差分を要約する

# 英語版を作り直す（make-en）

1. `app.html` の日本語の文言のうち、`tools/make-en-app.py` の置換表 `T` に無いものを探す
2. 足りない分の英訳を `T` に追加する（自然で短い英語。既存の訳語と揃える）
3. `python3 tools/make-en-app.py` を実行する
4. `en/app.html` に日本語（ひらがな・カタカナ・漢字）が残っていないか grep で確認し、残りを報告する
5. インライン `<script>` が変わった場合は `python3 tools/make-headers.py` も実行する

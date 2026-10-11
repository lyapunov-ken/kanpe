#!/bin/bash
# 公開前に実行：JS / CSS の読み込みに新しいバージョン番号を付け、ブラウザに古いファイルを使わせない。
# 使い方: ./tools/bump-version.sh   （番号は日時から自動で決まる）
cd "$(dirname "$0")/.." || exit 1
V=$(date +%Y%m%d%H%M)
FILES=$(ls *.html en/*.html src/*/*.js)
# 既存の ?v=… を外してから付け直す
sed -i.bak -E \
  -e "s#(\.js|\.css)\?v=[0-9a-z]+#\1#g" \
  -e "s#(from '[^']+\.js)'#\1?v=$V'#g" \
  -e "s#(import\('[^']+\.js)'#\1?v=$V'#g" \
  -e "s#(src=\"(\.\./)?src/[^\"]+\.js)\"#\1?v=$V\"#g" \
  -e "s#(href=\"(\.\./)?styles/[^\"]+\.css)\"#\1?v=$V\"#g" \
  $FILES
rm -f *.html.bak en/*.html.bak src/*/*.js.bak
echo "version: $V"

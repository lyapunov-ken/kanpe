#!/bin/bash
# ダブルクリックで起動（macOS）。ローカルサーバーを立ててブラウザで操作コンソールを開きます。
cd "$(dirname "$0")" || exit 1
PORT=8787
URL="http://localhost:$PORT/"

open_browser() {
  sleep 1
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL"
  else
    open "$URL"
  fi
}

echo "KANPE を起動します → $URL"
echo "終了するにはこのウィンドウで Ctrl + C を押してください。"

if command -v python3 >/dev/null 2>&1 && python3 -c "import http.server" >/dev/null 2>&1; then
  open_browser &
  python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then
  open_browser &
  npx --yes serve -l "$PORT" .
else
  echo "python3 か Node.js(npx) が必要です。README の「起動方法」を見てください。"
  read -r -p "Enter で閉じます"
fi

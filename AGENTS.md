# AGENTS.md — KANPE（リアルタイムカンペシステム）

Cursor（および AGENTS.md を読むエージェント）向けのプロジェクト指示です。詳しい仕様は `README.md`、公開と環境変数は `DEPLOY.md`。
領域ごとの細かいルールは `.cursor/rules/*.mdc`、よく使う手順は `.cursor/commands/*.md`（Cursor のチャットで `/` から呼べる）。

## 何を作っているか
- 話した言葉からキーワードを拾い、日本語タイポグラフィとしてブラウザに組んで見せるライブ配信ツール
- 無料版はブラウザの Web Speech API ＋ブラウザ内抽出だけで動く（サーバー・API なし、ランニングコスト 0 円）
- 決済とライセンスだけ Cloudflare Pages Functions（`functions/api/`）＋ Stripe ＋ Resend（メール）
- 用途の広がり：配信のほか、ブレスト会議（新語ミックス）、講演・式典の「要点ビジュアル」投影（`docs/projection-research.md`）

## 公開のしくみ（ここが一番大事）
- リポジトリ：GitHub `lyapunov-ken/kanpe` → Cloudflare Pages プロジェクト `kanpe`（ビルドなし・リポジトリ直下をそのまま公開）
- **`main` に入ったものは自動で本番**（https://kanpe.yoneken.xyz ／ https://kanpe-ahr.pages.dev）
- **`main` 以外のブランチを push すると、1分ほどでテスト URL** `https://<ブランチ名>.kanpe-ahr.pages.dev` が出る
  - ブランチ名は小文字になり、英数字以外は `-` に置き換わる（`feat/vj-1px` → `feat-vj-1px.kanpe-ahr.pages.dev`）
  - テスト URL には `X-Robots-Tag: noindex` が自動で付く。本番には影響しない
- 作業の流れ：`main` から作業ブランチを切る → 直す → push → テスト URL を示して確認してもらう → OK が出たら `main` へ取り込む
- **`main` に直接 commit / push しない。`main` への取り込み（本番公開）は必ずユーザーの了承を得てから**
- 戻すとき：Cloudflare ダッシュボード → Workers & Pages → kanpe → デプロイ → 前の版を「ロールバック」

## 起動・確認（手元）
- `./start.command`（macOS）または `python3 -m http.server 8787 --bind 127.0.0.1` → `http://localhost:8787/`
- `file://` ではマイクが使えない。必ず localhost か https で開く
- マイクなし確認：`display.html?demo=1`（`&layout=vj&vj=micro` など）、コンソールの「デモを流す」
- 初回ガイドの確認：`app.html?welcome=1`（一度見ると localStorage の `kanpe.guide.v1` に記録される。消すと再表示）
- 決済 API のテスト：`node tools/test-api.mjs`（Stripe は偽物。通信・キー不要。39 件すべて通ること）
- SEO とアクセス解析：`robots.txt`・`sitemap.xml`（`tools/make-sitemap.py`、bump-version.sh から自動）・`404.html`（`tools/make-legal.py` で生成）。GA4 の測定 ID は `src/lp/analytics.js` の `GA_ID`（G-YK9R5RH3V8）。テスト URL では `?ga=debug` で計測。詳しくは `DEPLOY.md`

## 構成
```
index.html（LP）/ app.html（コンソール）/ display.html（表示ビュー）/ en/（英語版）/ legal/・en/legal/（規約）
src/core/    changelog.js（更新履歴・いまのバージョン）plan.js（プラン・ライセンス）extract.js（キーワード抽出）settings.js（書体テーマ・VJ・既定値）
             coin.js（新語ミックスの造語）bus.js（BroadcastChannel）obs.js（obs-websocket）i18n.js
src/console/ console.js（操作・設定・新語ミックスの発火）recognizer.js speakers.js demo.js
             help.js（ヘルプ・シーン別プリセット）guide.js（初回の3ステップガイド）news.js（更新情報）
src/display/ display.js（組版描画・新語の誕生演出・依存ゼロ）vj.js（VJ モード：1px / LED / ネオン / ピクセル）
src/lp/ src/ui/  LP のデモ・アクセス解析（analytics.js）、言語切替、表示モード、スマホのメニュー
functions/api/   checkout.js license.js license-email.js portal.js stripe-webhook.js dev.js（開発者モード）_lib.js
tools/           bump-version.sh make-headers.py make-sitemap.py make-en-app.py make-legal.py stripe-setup.mjs test-api.mjs og/
docs/            調査メモ
```

## 必ず守ること
1. **ビルドなし・依存なし**：素の HTML / CSS / ES Modules。npm パッケージやバンドラ、CDN スクリプトを足さない
2. **外部スクリプト禁止（CSP）**：`_headers` の CSP はスクリプトを自サイト＋ハッシュ付きインライン＋Google アナリティクス（googletagmanager）だけ許可。HTML の `<script>` を変えたら `python3 tools/make-headers.py`（bump-version.sh から自動）。`_headers` は手で直さない
   - GA4 は紹介ページ（LP・規約・404）だけで `src/lp/analytics.js` から読み込む。アプリの画面（app.html・display.html）には入れない。GA の標準タグ（インラインの gtag）は貼らない（二重計測になる）
3. **生成物は元を直す**：`en/app.html` ← `app.html` を直して `python3 tools/make-en-app.py`。`legal/`・`en/legal/` ← `tools/make-legal.py` を直して再生成
4. **本番に出す前に `./tools/bump-version.sh`**：JS/CSS の `?v=` を付け直し、`_headers` も作り直す（作業ブランチの最後のコミットで実行しておく）
5. **文言は日英両方**：JS 内は `L('日本語', 'English')`（`src/core/i18n.js`）、`app.html` の文言は `tools/make-en-app.py` の置換表 `T` にも足す
6. **データは端末内だけ**：文字起こし・設定・背景画像は localStorage。OBS の接続先とパスワードは URL の `#` 以降に入れ、サーバーに送らない
7. **Stripe は KANPE 専用に絞る**：`metadata.project=kanpe`、lookup_key は `kanpe_` で始める。他プロジェクトの価格・契約には触れない
8. **秘密情報をコミット・ファイルに書かない**：Stripe キー・`LICENSE_SECRET`・`RESEND_API_KEY`・`STRIPE_WEBHOOK_SECRET`・`DEV_PASSWORD`（開発者モードのパスワード）は Cloudflare Pages の環境変数（本番とプレビューで別）。手元で API を動かすときの `.dev.vars` はコミットしない
9. **更新履歴を書く**：本番に出すたびに `src/core/changelog.js` の先頭へバージョンと内容（新機能 / 改善 / 修正）を足す。アプリの「更新情報」に表示され、新しい版を初めて見た人には1時間「NEW」が付く
10. **軽さ優先**：アニメーションは transform / opacity 中心、タイマー 1 本、消えた要素はすぐ DOM から外す

## 書き方
- 日本語のコメント・文言はやさしい言葉で、ユーザー向け説明は「です・ます」
- コードは既存のスタイルに合わせる（2 スペース、セミコロンあり、シングルクォート）
- 機能とプランの対応は `src/core/plan.js` の `REQUIRES`（free / plus / pro）で管理する
- コミットメッセージは英語で、何を・なぜを短く。1 つのブランチに関係のない変更を混ぜない

## いまの状態（2026-10-17 時点）
- 作業中：`feat/custom-logo`（v1.4.0）開発者モードも同じブランチ：ヘルプの一番下の「開発者」→ `/api/dev` がパスワードを環境変数 `DEV_PASSWORD` と照らし合わせ、おトクプランの開発者ライセンス（`c: 'dev'`・30日・自動更新）を出す。カスタムロゴ。`logo:custom`＝お手軽プラン。設定は `S.logo`（正方形に切り抜いた data URL、一辺 320px 以下）と `S.logoSize`（`LOGO_SIZES`）。表示ビューは左上に出し、`place()` はロゴを新語と同じく絶対に避ける。OBS へは背景画像と同じく変わった時だけ送る
- 本番：`main` = v1.3.1（2026-10-17 公開。`release/v1.3.1` を早送りで取り込んだ）
  - 別窓とプレビューの同期（`fix/popout-sync`）：コンソールが言葉ごとに種（seed）と時刻（ts）を付けて送り、表示ビューは 1280×720 基準で同じ置き場所を計算する。あとから開いた窓には `sync` で流れを渡してなぞらせる。`display.js` の置き場所の乱数は `Math.random` ではなく `rngFor(m)` を使うこと
  - サイドメニューを3つのタブに（`feat/sidebar-tabs`）：マイクは上に固定、「表示」「ブレストモード」「詳細」。詳細は `<details name="more">` のアコーディオン。設定を足すときは、どのタブに入れても 1280×800 でスクロールなしに収まるか確かめる
- その前の v1.3.0（新語ミックス・初回ガイド・VJ 1px・カンペの同じ話の記憶・更新情報 ほか）＋ SEO / GA4 ＋ アクセントカラーの無料化
  - v1.3.0 のブランチ `feat/coin-guide-vj1px` で重ねた修正の経緯：新語の色・出かた・速さ、細い字、手前に出す、背景に合わせた色、下敷きの板をやめて配置で重ならないように、新語は同時に5つまで、カンペの「同じ話の記憶」（5分・10分）
  - `feat/seo-ga4`：robots.txt・sitemap.xml・404・規約の正規 URL・コンソールの noindex・JSON-LD・GA4（紹介ページだけ）・プライバシーポリシーの「アクセス解析」
  - `feat/free-accent`：アクセントカラーを無料に（`plan.js` の `REQUIRES` から外した）
- Search Console のドメイン確認とサイトマップ送信はユーザーが行う（手順は `DEPLOY.md`）
- プレビュー用の環境変数は未設定（テスト URL では決済 API が「準備中」になる）。設定方法は `DEPLOY.md`
- Mac の `~/kanpesystem2` フォルダは古い版の手元コピー。今後はこのリポジトリを使う

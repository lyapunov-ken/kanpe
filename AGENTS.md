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

## いまの状態（2026-10-18 時点）
- 作業中：`feat/caption-layout-opts`（v1.6.0）表示タブの組み直し
  - 「文字サイズ・表示時間・同時に出す行」は字幕ライン（最下部の聞き取った文）専用：`capSize`（s/m/l・`CAP_SIZES`）・`capTtl`（3/5/10秒）・`capLines`（1〜3行）。`display.js` の「字幕ライン」：1文1行で下から積み、入りきらない文は頭を「…」で省く（`fitCapLine`）。言葉は `capReserve()` の高さを空けて置く（CSS は `--cap` / `--cap-res`）。プレビューだけ `capPeek` で字幕の場所に点線の枠と見本の文
  - レイアウトごとの3段階：`cSize`/`kSize`/`tSize`（`LAYOUT_SIZES` の倍率。`SIZE_KEY`）、`cGrow`/`kGrow`（育つまで。`level()` と `echoScale` を回数で割る）、`cJump`（`JUMP_STEPS`。組版の `ratio()`）、`cVert`（`VERT_STEPS`。古い `vertical:false` は「なし」扱い）、`tSpeed`（`TICKER_SPEEDS`）
  - 言葉の `baseSize`（34）・`ttl`（8秒）・`maxWords`（24）はコンソールでは変えない固定値。別窓の操作バーの「文字サイズ」（`?size=`）はその窓だけ `baseSize` を変える。以前の保存値は `console.js` の `migrateSettings()` が1回だけ新しい設定へ移す
  - 表示タブは 1280×800 でスクロールなしに収めている（低い画面用の詰めは console.css の末尾 `max-height: 860px`）
- 作業中：`fix/ticker-themes`（v1.5.1）新語の出かた「花火」（firework。光が昇る `FW_RISE` のあいだ字は出ない）。テロップは一定の速さで流れる（`display.js` の tickerPlace / tickerStep。1語ずつ translateX、画面から出たら消す、右の外にたまったら速める。時間では消さない）。書体は 墨・やわらか・夜・ポップ（無料）／透過・筆・ドット（お手軽）。透過が使えないときは OBS の URL に theme=clear を付けない
  - 別窓の操作バー（`display.js` の「別窓の操作バー」：renderBar / setWindowOpt / syncAll）：下中央に出て 2.6 秒で隠れる。レイアウト・文字サイズ・書体・色はその窓だけ（`LOCK` と URL の layout / size / theme / accent）。埋め込み（プレビュー）・OBS・`ui=0` では出さない。`applyTheme` は body の class を作り直すので、`ui-on` / `ui-idle` / `fz-focus` は残している
  - VJ モードでは左上・右上の計器の文字（1px の読み出し）と右下の KANPE（`#credit`）を出さない（ロゴと重なるため）
- 作業中：`feat/lp-noface`（`fix/ticker-themes` の上に重ねた LP の変更）
  - 「顔出しなし」は特徴の節の中のコンパクトな帯（`.nf-band#noface`。ヘッダーのメニューには入れない）。デモの台本 `script=talk`（`demo.js` の SCRIPTS）。「こんな場面で」の「ひとり雑談」・FAQ・meta description にも
  - LP のレスポンシブ：1024px 以下は見本（`.show`）を「画面｜説明」の横並び、760px 以下で縦積み。料金は 961px 以上で3枚並び。900px 以下で節の見出しのラベルを上に。見出しは `line-break: strict`（句読点を行頭に出さない。`word-break` を個別に上書きしない）。`:has()` は使わず `.uses li.link`。`overflow-x: clip` が無いブラウザは html で横のはみ出しを隠す
- 本番：`main` = v1.5.0
  - タブは「表示」（書体・色・レイアウト・5段階の文字サイズ／表示時間／同時に出す語 ※v1.6.0 で字幕ライン専用とレイアウトごとの3段階に組み直し）「機能」（ブレストモード・話者）「設定」（背景・ロゴ・辞書・OBS）。タブの id は `look` / `feat` / `set`（以前の `coin` / `more` は読み替える）
  - 5段階の値は `settings.js` の `SIZE_STEPS` / `TTL_STEPS` / `WORD_STEPS`。保存値は `nearestStep` で近い段に寄せる。初めての人は墨・組版・中・8秒・24語
  - 新語の誕生（`display.js` の fzAnimate / fzStage / fzBirth）：予兆 → 誕生 → 余韻。演出の乱数は `fzRand(m)`（種から作る）なので、プレビューと別窓で同じ動きになる。長さを変えたら `fzDur` も合わせる（元の2語が退く時刻の計算に使う）
- v1.4.0（カスタムロゴ・「+」の印・開発者モード）。開発者モード：ヘルプの一番下の「開発者」→ `/api/dev` が環境変数 `DEV_PASSWORD` と照らし合わせ、おトクプランの開発者ライセンス（`c: 'dev'`・30日・自動更新）を出す。ロゴは `logo:custom`＝お手軽プラン、`place()` はロゴを新語と同じく絶対に避ける
- v1.3.1（2026-10-17 公開）
  - 別窓とプレビューの同期（`fix/popout-sync`）：コンソールが言葉ごとに種（seed）と時刻（ts）を付けて送り、表示ビューは 1280×720 基準で同じ置き場所を計算する。あとから開いた窓には `sync` で流れを渡してなぞらせる。`display.js` の置き場所の乱数は `Math.random` ではなく `rngFor(m)` を使うこと
  - サイドメニューを3つのタブに（`feat/sidebar-tabs`）：マイクは上に固定、「表示」「ブレストモード」「詳細」。詳細は `<details name="more">` のアコーディオン。設定を足すときは、どのタブに入れても 1280×800 でスクロールなしに収まるか確かめる
- その前の v1.3.0（新語ミックス・初回ガイド・VJ 1px・カンペの同じ話の記憶・更新情報 ほか）＋ SEO / GA4 ＋ アクセントカラーの無料化
  - v1.3.0 のブランチ `feat/coin-guide-vj1px` で重ねた修正の経緯：新語の色・出かた・速さ、細い字、手前に出す、背景に合わせた色、下敷きの板をやめて配置で重ならないように、新語は同時に5つまで、カンペの「同じ話の記憶」（5分・10分）
  - `feat/seo-ga4`：robots.txt・sitemap.xml・404・規約の正規 URL・コンソールの noindex・JSON-LD・GA4（紹介ページだけ）・プライバシーポリシーの「アクセス解析」
  - `feat/free-accent`：アクセントカラーを無料に（`plan.js` の `REQUIRES` から外した）
- Search Console のドメイン確認とサイトマップ送信はユーザーが行う（手順は `DEPLOY.md`）
- プレビュー用の環境変数は未設定（テスト URL では決済 API が「準備中」になる）。設定方法は `DEPLOY.md`
- Mac の `~/kanpesystem2` フォルダは古い版の手元コピー。今後はこのリポジトリを使う

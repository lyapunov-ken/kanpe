# KANPE — リアルタイムカンペシステム（試作 Phase 0）

話した言葉からキーワードを拾い、日本語タイポグラフィとしてブラウザに組んで見せるライブ配信ツールの試作です。
無料版の構成（ブラウザ内蔵の音声認識＋ブラウザ内の抽出）だけで動き、サーバーも API も使いません。ランニングコストは 0 円です。

## 起動方法

1. `start.command` をダブルクリック（初回は右クリック →「開く」）
   - Chrome でランディングページ（`http://localhost:8787/`）が開きます。「無料ではじめる」からコンソールへ
   - python3 が無い場合はターミナルで `npx serve -l 8787 .` でも起動できます
2. 「話しはじめる」を押し、マイクの使用を許可する
3. マイクが無くても「デモを流す」か、テキスト欄に文章を入れて Enter で見た目を確認できます

音声認識は PC の Chrome / Edge、スマホの Chrome（Android）/ Safari（iPhone）で使えます。聞き方は端末で変える（`src/console/recognizer.js` の `MODE`）：PC は連続モード、iPhone と Mac の Safari は一言ずつ聞いて開き直す、Android は連続モード（開き直すたびにシステムの音とマイクの確認が出るため。積み上がって届く結果は重複を取り除き、黙っている間は開き直しの間隔を空け、3分間声がなければ止める）。`file://` で直接開くとマイクが使えないため、必ずローカルサーバー経由で開いてください。

## 画面

| 画面 | URL | 用途 |
| --- | --- | --- |
| ランディングページ | `index.html` | サービス紹介・料金・ライブデモ |
| 操作コンソール | `app.html` | 認識の開始・停止、書体テーマ、レイアウト、辞書、文字起こし |
| 組版ビュー | `display.html` | 画面いっぱいに語を組む。全画面は `F` キー |
| カンペ | `display.html?layout=kanpe` | 手元モニター用。大きな文字が下から積み上がる |
| OBS オーバーレイ | `display.html?theme=clear&obs=…` | 透過背景。コンソールの「URLをコピー」で作る |
| 単体デモ | `display.html?demo=1` | マイクなしで表示だけ確認 |

URL パラメータ：`theme`（sumi / yoru / pop / yawaraka / clear / fude / dot）、`layout`（compose / kanpe / ticker / vj）、`vj`（led / neon / pixel / holo）、`vjfont`（gothic / maru / mincho / pop / dot）、`detail`（coarse / mid / fine）、`fx`（low / mid / high）、`size`、`fonts=local`（Web フォントを読まず OS の書体を使う）、`demo=1&sp=1`（話者の色分けの見本）。

## データとセキュリティ

- KANPE にはデータを受け取るサーバーがない（Cloudflare Pages の静的配信のみ）。文字起こし・設定・背景画像はブラウザの localStorage にだけ保存
- 無料・お手軽プランの音声認識はブラウザの Web Speech API。音声はブラウザの提供元（Chrome は Google、Edge は Microsoft、Safari は Apple）が処理する
- 画面間の同期は BroadcastChannel（同じブラウザ内）、OBS へは手元の obs-websocket に直接接続。OBS 用 URL の接続先とパスワードは `#` 以降に入れ、サーバーへのリクエストに含めない。表示ビューへ送る設定からも外している
- `_headers` で CSP（スクリプトは自サイトとハッシュ付きのインラインのみ、通信は自サイトと WebSocket のみ）などのセキュリティヘッダーを付ける。`tools/make-headers.py` が生成（bump-version.sh から自動実行）

## 英語版

- `en/index.html`（英語の LP）と `en/app.html`（英語のコンソール）。表示ビューは共通の `display.html` を `hl=en` 付きで使う
- `en/app.html` は `app.html` から生成する：`python3 tools/make-en-app.py`（app.html を直したら再実行）
- JS 内の文言は `src/core/i18n.js` の `L('日本語', 'English')` で切り替える
- 日本語版⇄英語版の切り替えは確認の窓（`src/ui/lang.js`）を出してから移動する。コンソールでは聞き取りとデモを止め、設定と文字起こしを引き継ぐ
- 表示モードは最初ライト。右上のボタンでダークに切り替えると、ブラウザに保存される（`src/ui/mode.js`）

## 料金プラン（3つ）

2時間の配信を週3回（月約26時間、話している区間は月17時間前後）する人を基準にしています。

| プラン | 価格（税込） | 内容 |
| --- | --- | --- |
| 無料プラン | ¥0 | ブラウザの音声認識が時間無制限。標準書体・レイアウト3種・OBS・文字起こし。有料プランの見た目と演出は1日（24時間）お試し。配信画面の隅に「KANPE」表示 |
| お手軽プラン（ベータ版で受付） | ¥480/月・¥4,800/年 | VJ モード（ドットアート。1px / LED / ネオン / ピクセル / ホロ、書体5種）、話者のラベルと色分け（最大4人。手動切り替え・PC は声の高さで自動）、プレミアム書体すべて、アクセントカラー、背景画像（長辺1000px以下に自動縮小・窓に合わせて自動トリミング）、背景にカメラの映像（端末内だけ・左右反転・カメラ選択。OBS のブラウザソースでは映らない）、「KANPE」表示を消す。音声認識はブラウザのものを時間無制限 |
| おトクプラン（近日公開） | ¥2,980/月・¥29,800/年 | お手軽プランの全部＋高精度クラウド認識 月20時間（追加1時間 ¥200）、クラウドの話者分離で自動色分け、用語集を認識に反映、AI の要点・アイデア抽出、配信後サマリー |

月10万円の粗利の目安：お手軽8割・おトク2割なら有料会員 約180人（無料から有料への転換率3%として無料利用者 約6,000人）。

チームでの利用は個別に相談。どの機能にどのプランが必要かは `src/core/plan.js` の `REQUIRES` で管理しています（内部名は free / plus / pro）。クラウド認識の中継はサーバー側の実装が必要です（おトクプランは `PRO_ENABLED=1` にするまで申し込みを受け付けません）。高精度認識は話している区間だけを送る（ブラウザ側で無音を検出する）前提で原価を見積もっています。

## OBS で使う

OBS のブラウザソースの中では音声認識が動かないため、認識は Chrome の操作コンソールで行い、結果だけを OBS に送ります。

- **透過で重ねる（推奨）**：OBS 28 以降の「ツール → WebSocketサーバー設定」を有効にし、コンソールの「OBS に透過で重ねる」で接続 →「URLをコピー」→ OBS のブラウザソース（1920×1080）に貼る
- **かんたん**：組版ビューを別窓で開き、OBS の「ウィンドウキャプチャ」で取り込む

## 操作

- `P`：表示の一時停止／再開（文字起こしは続く）
- `Esc`：表示中の語を全消去
- `1`〜`4`：話者の色分けがオンのとき、いま話している人を切り替える
- 文字起こしは TXT / SRT で書き出せます（SRT はアーカイブ動画の字幕に使えます）

## 構成

```
index.html（LP）/ app.html（コンソール）/ display.html（表示ビュー）
src/lp/lp.js            ランディングページのデモ切り替え
src/core/plan.js        フリーミアムの設定（Pro の可否）
src/core/extract.js     キーワード抽出（Intl.Segmenter＋文字種ルール、フィラー除去、NG・登録語）
src/core/settings.js    書体テーマ・既定値
src/core/bus.js         画面間の同期（BroadcastChannel）
src/core/obs.js         obs-websocket クライアント（OBS へ送る）
src/console/            操作コンソール、音声認識、デモ
src/display/display.js  タイポグラフィ描画（依存ゼロ）
styles/                 CSS
```

## タイポグラフィの考え方

- 文字種ごとに組む：漢字は基準サイズで太く、ひらがなは約 80% に縮めて細く（漢字を立て、かなを引く）、カタカナは少し大きく字間を詰める
- 重要度で 4 段階のジャンプ率（1.0 / 1.5 / 2.25 / 3.4）。繰り返し話した語は育って大きくなる
- 初めて出た目立つ語だけアクセント色と下線で登場（5 秒に 1 語まで）
- 話が途切れると語は余韻として長めに残る
- 和文は `palt`（プロポーショナル詰め）、字幕は `word-break: auto-phrase` で文節改行

## 軽さのための工夫

- 表示側はライブラリなしの素の JavaScript。形態素解析の辞書も読み込まない
- アニメーションは transform / opacity が中心（漢字の滲みだけ短い blur）
- タイマーは 1 本、同時表示数に上限、消えた要素はすぐ DOM から外す
- Google Fonts の分割配信を使い、表示する語の字形だけ先読み（最大 120ms で見切る）

## 決済（Stripe）

- 申し込みは Stripe Checkout（定期支払い）、解約や支払い方法の変更は Stripe の顧客ポータル。カード情報は KANPE を通らない
- サーバー側は Cloudflare Pages Functions（`functions/api/`）。データベースは持たず、契約状態は毎回 Stripe に問い合わせ、端末には署名つきのライセンスコード（`kanpe1.…`）だけを保存する。ライセンスは約12時間ごとに更新し、更新日から3日は猶予
- 同じ Stripe アカウントの他プロジェクトと混ざらないよう、商品・価格・Checkout・契約に `metadata.project=kanpe`、価格の lookup_key は `kanpe_` で始め、明細書の表記は `KANPE`。他プロジェクトの価格や契約は無視する
- 準備：`STRIPE_SECRET_KEY=sk_test_… node tools/stripe-setup.mjs` で商品・価格・顧客ポータルを作り、表示された値を Cloudflare Pages の環境変数（`STRIPE_SECRET_KEY`、`LICENSE_SECRET`、`STRIPE_PORTAL_CONFIG`）に入れる。未設定の間、申し込みボタンは「受付を準備しています」と表示する
- ライセンスコードのお届け：申し込み直後にコンソールで表示（コピー・ファイル保存）するほか、Stripe の Webhook（`checkout.session.completed` → `/api/stripe-webhook`）を受けて、お申し込みのメールアドレスへメールでも送る。送信は Resend。同じ申し込みの通知が再送されても、Resend の Idempotency-Key で二重に届かない。コードをなくした人は、コンソールの「ライセンスコードで復元」からメールで送り直せる（`/api/license-email`。契約の有無は返さず、Stripe に登録されたアドレスにだけ、同じ顧客には10分に1通まで）
- メールの準備：Resend でドメイン（例 `yoneken.xyz`）を認証し（Cloudflare の DNS に表示されたレコードを追加）、API キーを作る。Cloudflare Pages の環境変数に `RESEND_API_KEY`、`MAIL_FROM`（例 `KANPE <noreply@yoneken.xyz>`）、任意で `MAIL_REPLY_TO`、それに `tools/stripe-setup.mjs` が表示する `STRIPE_WEBHOOK_SECRET` を入れる。未設定の間はメールを送らず、画面の案内も「メールでは届かない」表示のまま。制限付きキー（rk_…）を使う場合は、Customers の読み取り・書き込みも許可する
- テスト：`node tools/test-api.mjs`（Stripe は偽物に置き換えるので通信不要）
- Stripe の推奨構成（implementation planner）との対応：ホスト型 Checkout／定額／フリーミアム（無料プランはカード不要）／顧客ポータル／Smart Retries と自動メール（ダッシュボードで設定）／Stripe Tax はしきい値モニタリングから。契約は flexible billing mode で作成し、商品には税コード（既定 `txcd_10103000`）を付ける
- Connect は使わない（他の事業者への支払いがないため）。他プロジェクトとの入金の分離は、同じ組織（Organization）の中に KANPE 専用アカウントを作って行う

## 規約ページ

`legal/`（日本語）と `en/legal/`（英語）に利用規約・プライバシーポリシー・特定商取引法に基づく表記。`tools/make-legal.py` で作るので、運営者の情報（`SELLER`）や文面はそちらを直して `python3 tools/make-legal.py && ./tools/bump-version.sh` を実行してください。

## 更新を公開するとき

JS / CSS を変えたら、公開前に `./tools/bump-version.sh` を実行してください。読み込みに新しいバージョン番号が付き、閲覧者のブラウザに古いファイルが残っていても新しいファイルが読まれます。

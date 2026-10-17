// 更新履歴。いちばん上がいまのバージョン。本番に出すたびに、ここへ1つ足す（新しいものを先頭に）。
// type：new＝新機能 / improve＝改善 / fix＝修正。文言は短く、利用者向けのやさしい言葉で（日本語と英語）。
export const CHANGELOG = [
  {
    v: '1.3.1', date: '2026-10-17',
    items: [
      { type: 'improve', ja: '設定を「表示」「ブレストモード」「詳細」の3つのタブに分けました。マイクとタブはいつも上に見えていて、ほとんどの画面でスクロールせずに操作できます。最後に開いたタブを覚えておきます', en: 'Settings are now split into three tabs: Display, Brainstorm and More. The mic and tabs always stay visible, so on most screens you can work without scrolling. The last tab you opened is remembered' },
      { type: 'improve', ja: '「ブレスト」を「ブレストモード」に改め、青い印で目立つように。新語ミックスをオンにすると、タブに「ON」が付き、枠が光ります', en: 'Brainstorm is now “Brainstorm mode”, marked in blue. When Word mix is on, its tab shows “ON” and the panel glows' },
      { type: 'improve', ja: '「詳細」タブの背景・話者・辞書・OBS は、開くと1つだけ広がります。閉じていても、使っている設定には印が付きます', en: 'In the More tab, Background, Speakers, Dictionary and OBS open one at a time, and show a small badge when in use' },
    ],
  },
  {
    v: '1.3.0', date: '2026-10-15',
    items: [
      { type: 'new', ja: '新語ミックス：画面に出た言葉どうしを掛け合わせて、新しい言葉を生み出します（ブレスト向け）。色・出かた（衝突・デコード・シャッター・集束・スキャン）・速さも選べます。新語はほかの言葉と重ならない場所に、いつも手前に出て余韻を残し、色は背景に合わせて読みやすく整えます。同時に出る新語は5つまでで、それを超えると古い新語から早めに消えます', en: 'Word mix: combines words on screen into brand-new words (for brainstorming), with your choice of color, entrance (Collide, Decode, Shutter, Converge, Scan) and speed. New words never overlap other words, stay in front, linger longer, and their colors adjust to the background for readability. Up to five new words show at once; beyond that, the oldest fade out early' },
      { type: 'new', ja: 'カンペの「同じ話の記憶」：5分・10分のあいだにくり返した言葉ほど大きく、長く残ります。同じ話を続けると、画面が言葉で埋まっていきます', en: 'Topic memory for the Cue layout: words you repeat within 5 or 10 minutes grow bigger and stay longer, and staying on one topic fills the screen with words' },
      { type: 'new', ja: 'はじめての人向けの3ステップのガイド。ヘルプの「はじめかた」からも見直せます', en: 'A 3-step guide for first-time users, also available from Help → Getting started' },
      { type: 'new', ja: 'VJ モードに、白黒の 1px の点と線で描く「1px」スタイル', en: 'New “1px” VJ style, drawn only in monochrome 1px dots and lines' },
      { type: 'new', ja: 'この「更新情報」で、新しいバージョンの内容が見られるように', en: 'This “What’s new” panel, so you can see what changed in each version' },
      { type: 'improve', ja: 'アクセントカラーを、無料プランでも自由に変えられるように', en: 'Accent colors can now be changed on the Free plan too' },
      { type: 'improve', ja: 'VJ モードの設定を半分に整理（スタイルと書体だけ）。「ホロ」スタイルはなくしました', en: 'VJ settings trimmed to style and typeface; the Holo style has been removed' },
      { type: 'improve', ja: 'はじめは書体テーマ「墨」・少し小さめの文字で始まるように。縦長の窓でも文字がはみ出しにくく', en: 'New users start with the Sumi theme and slightly smaller text; text fits better in narrow windows' },
      { type: 'improve', ja: '別窓（カンペ・組版）のボタンをプレビューの右下へ', en: 'The cue and compose window buttons moved to the bottom right of the preview' },
      { type: 'improve', ja: 'スマホでは、下へスクロールしてもプレビューが上に残り、設定を変えながら見られます', en: 'On phones the preview stays pinned at the top while you scroll through the settings' },
    ],
  },
  {
    v: '1.2.1', date: '2026-10-14',
    items: [
      { type: 'fix', ja: 'Android で聞き取りのたびに鳴る音とマイクの確認が、何度も出ないように', en: 'Android no longer beeps and asks for the microphone again and again while listening' },
    ],
  },
  {
    v: '1.2.0', date: '2026-10-13',
    items: [
      { type: 'new', ja: 'アプリ内のヘルプと、シーン別のおすすめ設定（雑談・ゲーム実況・ブレスト会議・講演）', en: 'In-app help with recommended settings by scene (chat, gameplay, brainstorming, talks)' },
      { type: 'new', ja: 'ライセンスコードを申し込み直後に表示し、メールでも届くように。なくしたときは送り直せます', en: 'Your license code is shown right after purchase and emailed to you, and can be resent' },
      { type: 'improve', ja: 'VJ モード：読みやすい書体5種、細かいドット、声に合わせて動く演出', en: 'VJ mode: five readable typefaces, finer dots and motion that follows your voice' },
      { type: 'improve', ja: 'スマホ・タブレットのヘッダーをメニューにまとめて、すっきりと', en: 'A tidier header on phones and tablets, with a menu' },
      { type: 'fix', ja: '入力レベルのメーターが止まったままになることがある不具合', en: 'The input level meter could stay switched off' },
    ],
  },
  {
    v: '1.1.0', date: '2026-10-11',
    items: [
      { type: 'new', ja: 'お手軽プラン（ベータ版）の受付を開始。VJ モード、話者のラベルと色分け、背景画像・カメラ、プレミアム書体', en: 'Plus plan (beta) opens: VJ mode, speaker labels and colors, image and camera backgrounds, premium typefaces' },
      { type: 'new', ja: '英語版、ライト／ダークの切り替え、スマホの音声入力', en: 'English version, light / dark mode, and voice input on phones' },
      { type: 'improve', ja: 'OBS のパスワードをサーバーに送らないように。セキュリティを強化', en: 'The OBS password is never sent to a server; stronger security headers' },
      { type: 'fix', ja: '「聞き取り中」なのに文字が出ないことがある不具合を、自動で見つけて直すように', en: 'Listening that showed “Listening” but produced no text is now detected and fixed automatically' },
    ],
  },
  {
    v: '1.0.0', date: '2026-10-10',
    items: [
      { type: 'new', ja: 'KANPE を公開。話した言葉が、その場で日本語タイポグラフィになります', en: 'KANPE launches: what you say becomes Japanese typography on the spot' },
      { type: 'new', ja: '書体テーマ、組版・カンペ・テロップのレイアウト、別窓での表示、アクセントカラー', en: 'Typeface themes, Compose / Cue / Ticker layouts, pop-out windows and accent colors' },
    ],
  },
];
export const APP_VERSION = CHANGELOG[0].v;

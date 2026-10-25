// 更新履歴。いちばん上がいまのバージョン。本番に出すたびに、ここへ1つ足す（新しいものを先頭に）。
// type：new＝新機能 / improve＝改善 / fix＝修正。文言は短く、利用者向けのやさしい言葉で（日本語と英語）。
export const CHANGELOG = [
  {
    v: '1.7.0', date: '2026-10-25',
    items: [
      { type: 'new', ja: '新しいレイアウト「モーション」。話した文がその場で1字ずつ現れ、2行ずつの場面になって、線の上を走るカメラで次々と切り替わります。言葉の意味に合わせて図形が動きます（打ち消しには取り消し線、問いかけには大きな「？」、強調には集中線、「まず・次に」には矢印でつながる箱、「でも」には仕切り線など）。キーワードは色や塗りの箱で目立ち、同じ言葉をくり返すと背景に大きな字が浮かびます', en: 'New Motion layout. Your words appear letter by letter as you speak, set two lines at a time, and a camera glides along a line to each new scene. Shapes react to what you say: a strike-through when you say “not”, a big “?” for questions, speed lines for emphasis, arrow-linked boxes for “first… then…”, a divider for “but”, and more. Keywords stand out in color or filled boxes, and words you repeat loom large in the background' },
      { type: 'new', ja: 'モーションで新語ミックスの新語が生まれると、数秒間の特別な演出が入ります。1px の点が集まって爆発する「粒子の爆発」、水滴から広がる「波紋」、裂けた字がずれながら決まる「グリッチ」、暗転した画面に1字ずつ打ち出される「タイトル」の4通り（新語の出かたの設定で選べます）', en: 'In Motion, a newly mixed word now gets a few seconds of spotlight: a 1px-dot Explosion, a Ripple from a falling drop, a Glitch of sliced letters snapping into place, or a Title card that types each letter onto a dark screen (chosen by the new-word entrance setting)' },
      { type: 'improve', ja: 'モーションの改行を、言葉のまとまり（文節）ごとにしました。単語の途中や、接続詞・助詞だけが行に取り残されることがなくなり、行のおさまりがきれいになります', en: 'Motion now breaks lines at natural phrase boundaries, so words are never split and conjunctions or particles are no longer left dangling at the end of a line' },
      { type: 'improve', ja: 'モーションでは、デモの話す速さと場面の切り替えをゆっくりにしました（1つの場面を少なくとも2.5秒見せます）', en: 'In Motion, the demo now talks at a calmer pace and each scene stays at least 2.5 seconds' },
      { type: 'new', ja: '文字起こしの「生まれた新語」を押すと、その新語をもう一度画面に出せます（コピーは横の小さなボタンで）', en: 'Click a word under “New words” in the transcript to show it on screen again (copy it with the small button beside it)' },
      { type: 'new', ja: '1px の粒子の演出。字の形のまま細かな粒になって風に散ったり、散らばった粒が集まって字になったり。キーワードの箱や句点からは火花が飛びます。しばらく話さないと、画面の言葉は粒になって消えていきます', en: '1px particle effects: words dissolve into fine dust that drifts away, or gather from scattered dust into letters. Sparks fly from keyword boxes and full stops, and after a quiet spell the words on screen crumble into dust' },
      { type: 'new', ja: '字の出かたは10通り（浮かぶ・横すべり・弾む・落ちる・粒子・めくれる・立ち上がる・グリッチ・伸び・回転）、場面の切り替えは6通り（横へ・下へ・粒子・ズーム・字が落ちる・帯でワイプ）、飾りの図形は12通り。テイストに合わせて場面ごとに選ばれます', en: '10 letter entrances (fade-in, slide, bounce, drop, particles, flip, rise, glitch, stretch, spin), 6 scene transitions (pan, drop, dust, zoom, falling letters, wipe) and 12 accent shapes, picked scene by scene to match the taste' },
      { type: 'new', ja: '音に反応（声・周りの音・オフ）。「周りの音」では BGM や会場の音の拍に合わせて画面が脈打ち、線の上の点から火花が飛び、キーワードが跳ねます。左下の計器はスペクトラム、右上はテンポ（BPM）に。コンソールが裏に回っていても止まりません。マイクの音はこの端末の中だけで使います', en: 'React to sound (Voice, Room or Off). With Room, the screen pulses to the beat of music or room sound, sparks fly from the moving dot and keywords bounce; the corner meters become a spectrum and a tempo (BPM) readout. It keeps going even when the console is in the background. Mic audio never leaves this device' },
      { type: 'new', ja: 'モーションの設定：テイスト（クール・ミックス・ポップ）と、四隅の計器（経過時間・話す速さ・声の大きさ・場面の番号）のあり・なし。ときどき画面が明暗反転して、場面にメリハリがつきます（透過の書体では反転しません）', en: 'Motion settings: Taste (Cool, Mix or Pop) and corner readouts (time, speaking pace, voice level, scene number) on or off. Scenes now and then flip to inverted colors for punch (not with the Clear typeface)' },
      { type: 'improve', ja: 'モーションは軽さを優先して作っています。動きはブラウザが描き直さずに動かせるものだけにし、描画が重い端末では、粒子の数を減らしたり軽い演出だけにしたりして、自動でなめらかさを保ちます。話すのがとても速いときは、途中の場面を飛ばして追いつきます', en: 'Motion is built to stay light: it only uses effects the browser can animate without repainting, and on slower devices it automatically uses fewer particles and lighter effects to stay smooth. When you talk very fast, it skips ahead instead of piling up scenes' },
      { type: 'improve', ja: '「テロップ」はモーションに置き換わりました。テロップを選んでいた方は、自動でモーションになります（文字の大きさは引き継ぎます。OBS の URL の layout=ticker もそのまま使えます）。シーン別設定の「ゲーム実況」も、透過 × モーションに変わりました', en: 'Ticker has been replaced by Motion. If you used Ticker, you’ll switch to Motion automatically (your text size carries over, and OBS URLs with layout=ticker still work). The Gameplay preset now uses Clear × Motion' },
    ],
  },
  {
    v: '1.6.2', date: '2026-10-22',
    items: [
      { type: 'new', ja: '組版に「文字の重なり」（オン・オフ）。オンにすると言葉の上に言葉が重なって、にぎやかに組まれます。オフ（初めの値）なら、これまでどおり重ならずに空いている場所へ言葉が増えていきます。ロゴと新語ミックスの新語には重なりません', en: 'New Overlap option for Compose. Turn it on and words stack on top of each other for a busier look; off (the default) keeps words apart, filling the empty space as before. Words never cover your logo or a mixed new word' },
    ],
  },
  {
    v: '1.6.1', date: '2026-10-22',
    items: [
      { type: 'fix', ja: '1時間ほど続けて使うと、コンソールが重くなって固まり、言葉が画面に出なくなることがあった不具合。文字起こしの一覧には新しい200件を出し、それより前は省くようにしました（TXT・SRT にはすべて入ります）', en: 'After about an hour of use, the console could slow down and freeze, and words stopped appearing. The transcript list now shows the latest 200 lines and hides older ones (TXT and SRT still include everything)' },
      { type: 'fix', ja: '消えかけの言葉をもう一度話すと、古い方が見えないまま画面に残り続け、長く使うほど重くなっていた不具合（カンペでは言葉の入る場所が少しずつ減っていました）', en: 'Saying a word again while it was fading out left the old copy invisibly on screen, making long sessions slower (in Cue layout it gradually took up space for new words)' },
    ],
  },
  {
    v: '1.6.0', date: '2026-10-18',
    items: [
      { type: 'improve', ja: '「文字サイズ・表示時間・同時に出す行」は、画面の最下部に聞き取った文を出す「字幕ライン」の設定になりました。小さな画面の絵の付いたまとまりにまとめ、設定にふれるとプレビューで字幕の出る場所に枠が出ます', en: 'Text size, Display time and Lines now belong to the Caption line — the transcript at the very bottom of the screen. They sit together in their own panel, and touching them outlines the caption area in the preview' },
      { type: 'new', ja: '字幕ラインを最大3行に。少し前の文も残せて、字幕のように下から流れます。長い文は頭を「…」で省いて1行に収めます', en: 'The caption line can now show up to 3 lines, keeping earlier sentences like subtitles. Long sentences are shortened from the start to fit on one line' },
      { type: 'new', ja: 'レイアウトごとの設定（3段階）：文字の大きさ（組版・カンペ・テロップそれぞれ）、育つまで（同じ言葉を何回くり返したら大きくなるか。組版・カンペ）、大小の差・縦組みの量・残る時間（組版。5秒・8秒・30秒）、流れる速さ（テロップ）', en: 'Per-layout settings in three steps: text size (for Compose, Cue and Ticker separately), Grow after (how many repeats before a word gets bigger; Compose and Cue), size contrast, amount of vertical text and how long words stay (Compose: 5, 8 or 30 s), and scrolling speed (Ticker)' },
      { type: 'improve', ja: '「動きを控えめに」はアクセントカラーの見出しの横に移しました。以前の文字サイズ・縦組みの設定は、新しい設定に引き継がれます', en: 'Reduce motion now sits next to the Accent color heading. Your previous text size and vertical-text choices carry over to the new settings' },
    ],
  },
  {
    v: '1.5.1', date: '2026-10-17',
    items: [
      { type: 'improve', ja: '別窓（カンペ・組版を別窓で）の操作を一新。マウスを動かすと画面の下に操作バーが出て、レイアウト・文字サイズ・書体と色・消去・全画面をその場で切り替えられます。変えた設定はその窓だけに効き、「コンソールに合わせる」でまとめて戻せます。キー操作（F・L・T・+ −・0・Esc・?）とダブルクリックで全画面にも対応。窓のタイトルにレイアウト名が出るので、OBS のウィンドウキャプチャで選びやすくなりました', en: 'Pop-out windows got a new control bar: move the mouse to show it at the bottom, then switch layout, text size, typeface and color, clear, or go full screen. Changes apply to that window only, and “Follow console” resets them all. Keyboard shortcuts (F, L, T, + −, 0, Esc, ?) and double-click for full screen are supported, and the window title shows the layout name for easy picking in OBS window capture' },
      { type: 'improve', ja: 'VJ モードでは、画面の左上・右上の計器の文字と、右下の「KANPE」を出さないように。カスタムロゴと重ならず、映像がすっきりします', en: 'VJ mode no longer shows the readouts in the top corners or the “KANPE” mark at the bottom right, so nothing overlaps your custom logo' },
      { type: 'fix', ja: 'コンソールで設定を変えると、別窓の操作パネルが消えてしまうことがあった不具合', en: 'The pop-out window’s controls could vanish when settings changed in the console' },
      { type: 'fix', ja: 'テロップを、ニュースのように一定の速さで流れるように。言葉は右の外から入って左へ流れ、画面から出たら消えます。言葉が続くときは少し速く流して追いつきます（「表示時間」は1語が画面を横切る秒数）', en: 'The Ticker now scrolls smoothly at a steady speed like a news crawl: words enter from the right, flow left and disappear off-screen, speeding up a little to catch up when words pile up (Display time is how long a word takes to cross the screen)' },
      { type: 'new', ja: '新語の出かたに「花火」：画面の下から光が昇って弾け、火花の中から新語が花開きます', en: 'New “Firework” entrance: a spark rises from below, bursts, and the new word blooms out of the fireworks' },
      { type: 'fix', ja: '「機能」タブを開いたとき、タブの下に横の罫線が出ていた不具合', en: 'A stray line appeared under the tabs when the Features tab was open' },
      { type: 'improve', ja: '書体テーマの並びを「墨・やわらか・夜・ポップ」に。「透過」は「筆」「ドット」と同じお手軽プランの書体になりました（無料プランでも1日お試しできます）', en: 'Typeface themes are now ordered Sumi, Soft, Night, Pop. “Clear” joins “Brush” and “Dot” as a Plus typeface (free users can try it for a day)' },
    ],
  },
  {
    v: '1.5.0', date: '2026-10-17',
    items: [
      { type: 'improve', ja: 'ブレストモードの新語の出かたを一新。予兆 → 誕生 → 余韻の3幕で、閃光・衝撃波・画面の揺れ・粒子・残像・光の柱などが加わり、生まれる瞬間ほかの言葉が沈んで新語に視線が集まります', en: 'Brainstorm mode’s entrances, rebuilt as three acts (build-up, birth, afterglow) with flashes, shockwaves, screen shake, particles, afterimages and light pillars, while other words dim to put the new word in focus' },
      { type: 'new', ja: '新語の出かたに「墨」：墨がにじむように字が浮かび、しぶきが散ります', en: 'New “Ink” entrance: letters bleed in like ink, with splashes' },
      { type: 'improve', ja: '文字サイズ・表示時間・同時に出す語を、5段階のボタンで切り替えられるように', en: 'Text size, display time and words on screen now switch in five steps' },
      { type: 'improve', ja: '設定のタブを「表示」「機能」「設定」に。ブレストモードと話者は「機能」、背景・ロゴ・辞書・OBS は「設定」にまとめました', en: 'Settings tabs are now Display, Features and Settings: Brainstorm mode and speakers live in Features; background, logo, dictionary and OBS in Settings' },
      { type: 'fix', ja: '新語の出かた「シャッター」で、帯が見えず画面の端まで線が伸びていた不具合', en: 'The Shutter entrance showed screen-wide lines instead of its sliding strips' },
    ],
  },
  {
    v: '1.4.0', date: '2026-10-17',
    items: [
      { type: 'new', ja: 'カスタムロゴ：番組や会社のロゴを、画面の左上に正方形（1:1）で出せます。大きさは小・中・大。組版では言葉がロゴを避けて並び、別窓・OBS にも同じように出ます（お手軽プラン。無料プランでも1日お試しできます）', en: 'Custom logo: show your show’s or company’s logo as a square (1:1) in the top-left corner, in small, medium or large. In Compose layout words are placed around it, and it appears the same in pop-out windows and OBS (Plus plan; try it free for a day)' },
      { type: 'improve', ja: 'お手軽プランの機能には、値段の代わりに小さな「+」の印を付けるように。印の意味は1か所でまとめて説明します。お手軽プランの人には印を出しません', en: 'Plus features now carry a small “+” mark instead of a price, explained once in a single note. Plus subscribers don’t see the marks' },
    ],
  },
  {
    v: '1.3.1', date: '2026-10-17',
    items: [
      { type: 'improve', ja: '設定を「表示」「ブレストモード」「詳細」の3つのタブに分けました。マイクとタブはいつも上に見えていて、ほとんどの画面でスクロールせずに操作できます。最後に開いたタブを覚えておきます', en: 'Settings are now split into three tabs: Display, Brainstorm and More. The mic and tabs always stay visible, so on most screens you can work without scrolling. The last tab you opened is remembered' },
      { type: 'improve', ja: '「ブレスト」を「ブレストモード」に改め、青い印で目立つように。新語ミックスをオンにすると、タブに「ON」が付き、枠が光ります', en: 'Brainstorm is now “Brainstorm mode”, marked in blue. When Word mix is on, its tab shows “ON” and the panel glows' },
      { type: 'improve', ja: '「詳細」タブの背景・話者・辞書・OBS は、開くと1つだけ広がります。閉じていても、使っている設定には印が付きます', en: 'In the More tab, Background, Speakers, Dictionary and OBS open one at a time, and show a small badge when in use' },
      { type: 'fix', ja: '別窓（カンペ・組版）とプレビューで、言葉の置き場所・縦横・大きさがそろうように。あとから別窓を開いても、いまプレビューに出ている言葉から同じ画面で始まります', en: 'The cue and compose windows now match the preview: words appear in the same places, orientation and size. A window opened later starts from the words already on the preview' },
      { type: 'fix', ja: '画面の高さが足りないときに、プレビューの形がつぶれて 16:9 でなくなっていた不具合', en: 'The preview no longer gets squashed out of 16:9 on short screens' },
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

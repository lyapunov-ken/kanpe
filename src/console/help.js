// 使い方ガイド（アプリ内ヘルプ）。右上の「ヘルプ」、? キー、または app.html#help（#help-scenes など）で開く。
// 文言は L('日本語', 'English') で持つので、英語版のコンソールでもそのまま使える。
import { L } from '../core/i18n.js?v=202610150729';

// シーン別のおすすめ設定（無料プランの機能だけで組む。アクセントカラーや背景などは触らない）
export const PRESETS = {
  stream: { label: L('ひとり雑談', 'Solo chat stream'), s: { theme: 'yoru', layout: 'compose', baseSize: 40, ttl: 8, maxWords: 24, vertical: true, caption: true, fusion: false } },
  game: { label: L('ゲーム実況', 'Gameplay commentary'), s: { theme: 'clear', layout: 'ticker', baseSize: 34, ttl: 6, maxWords: 12, vertical: false, caption: false, fusion: false } },
  brainstorm: { label: L('ブレスト会議', 'Brainstorming meeting'), s: { theme: 'sumi', layout: 'compose', baseSize: 36, ttl: 30, maxWords: 40, vertical: false, caption: false, fusion: true } },
  speech: { label: L('スピーチ・講演', 'Speech or talk'), s: { theme: 'yoru', layout: 'kanpe', baseSize: 56, ttl: 15, maxWords: 10, vertical: false, caption: true, fusion: false } },
};

const TOC = [
  ['help-start', L('はじめかた', 'Getting started')],
  ['help-screen', L('画面の見かた', 'The screen')],
  ['help-scenes', L('シーン別の設定', 'Settings by scene')],
  ['help-obs', L('OBS に重ねる', 'Using with OBS')],
  ['help-keys', L('ショートカット', 'Shortcuts')],
  ['help-trouble', L('うまくいかないとき', 'Troubleshooting')],
  ['help-data', L('プランとデータ', 'Plans and data')],
];

const scene = (id, tag, biz, title, body, points) => `
  <article class="hp-scene${biz ? ' biz' : ''}">
    <p class="hp-scene-tag">${tag}</p>
    <h3>${title}</h3>
    <p>${body}</p>
    <ul>${points.map((x) => `<li>${x}</li>`).join('')}</ul>
    <button class="btn" type="button" data-preset="${id}">${L('この設定にする', 'Use these settings')}</button>
  </article>`;
const qa = (q, a) => `<details><summary>${q}</summary><p>${a}</p></details>`;

function html() {
  return `
<div class="hp-shell">
  <header class="hp-head">
    <div>
      <p class="hp-eyebrow">HELP</p>
      <h2 id="helpTitle">${L('KANPE の使い方', 'How to use KANPE')}</h2>
    </div>
    <button class="hp-close" type="button" data-help-close>${L('閉じる', 'Close')} <kbd>Esc</kbd></button>
  </header>
  <nav class="hp-toc" aria-label="${L('ヘルプの目次', 'Help contents')}">
    ${TOC.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}
  </nav>
  <div class="hp-body" data-help-body>

    <section id="help-start">
      <h3 class="hp-h">${L('はじめかた', 'Getting started')}</h3>
      <ol class="hp-steps">
        <li><b>${L('ブラウザで開く', 'Open it in a supported browser')}</b><span>${L(
          'PC は Chrome か Edge、スマホは iPhone の Safari か Android の Chrome で開きます。LINE や X などのアプリ内ブラウザでは音声認識が使えません。',
          'On a computer use Chrome or Edge; on a phone use Safari (iPhone) or Chrome (Android). In-app browsers such as LINE or X can’t do speech recognition.')}</span></li>
        <li><b>${L('「話しはじめる」を押す', 'Press “Start talking”')}</b><span>${L(
          '初回はマイクの許可を求められるので「許可」を選びます。PC では入力レベルのバーが動けば聞こえています。',
          'Allow the microphone when asked. On a computer, the level bar moves when your voice is coming through.')}</span></li>
        <li><b>${L('話す', 'Talk')}</b><span>${L(
          '拾われたキーワードがプレビューに組まれ、話した内容は「文字起こし」に残ります。',
          'Keywords appear in the preview as you speak, and everything you say is kept in the Transcript.')}</span></li>
        <li><b>${L('見せたい画面に出す', 'Put it on the screen you want')}</b><span>${L(
          '「カンペを別窓で」か「組版を別窓で」で別ウィンドウを開き、手元のモニターや会議室のディスプレイに移します。開いた窓で <kbd>F</kbd> を押すと全画面になります。',
          'Use “Open cue view” or “Open compose view”, move the window to your monitor or the meeting-room display, and press <kbd>F</kbd> in it for full screen.')}</span></li>
      </ol>
      <p class="hp-tip">${L(
        'マイクがなくても「デモを流す」か、テキスト欄に文章を入れて Enter で見た目を試せます。',
        'No mic? Press “Play demo”, or type a sentence and press Enter to try the look.')}</p>
      <button class="btn hp-guide" type="button" data-guide-start>${L('画面の上で案内する（3ステップ）', 'Walk me through it on screen (3 steps)')}</button>
    </section>

    <section id="help-screen">
      <h3 class="hp-h">${L('画面の見かた', 'The screen')}</h3>
      <dl class="hp-dl">
        <dt>${L('音声', 'Voice')}</dt>
        <dd>${L(
          '話しはじめる／停止、聞き取る言語、認識エンジン。高精度認識はおトクプランの機能です（近日公開）。',
          'Start / stop, the language to listen for, and the recognition engine. High-accuracy recognition is part of the Pro plan (coming soon).')}</dd>
        <dt>${L('表示', 'Display')}</dt>
        <dd>${L(
          '<b>書体テーマ</b>は文字と背景の雰囲気、<b>レイアウト</b>は言葉の置き方です。組版＝画面いっぱいに組む／カンペ＝下から大きく積み上がる／テロップ＝下部を横に流れる／VJ＝ドット絵で光らせる。<b>表示時間</b>は言葉が消えるまでの秒数、<b>同時に出す語</b>は画面に残す最大の語数です。<br>プレミアム書体・アクセントカラー・背景（画像・カメラ）・VJ はお手軽プラン以上の機能で、無料プランでも1日お試しできます。<br>VJ ではスタイル（1px・LED・ネオン・ピクセル・ホロ）と書体（5種）を選べます。1px は白黒の点と線だけで組む繊細な表示です。文字が読みにくいときは、書体を「ゴシック」か「明朝」にしてください。動きは「動きを控えめに」で止められます。<br><b>新語ミックス</b>（ブレスト）をオンにすると、画面に出た言葉どうしが掛け合わさって新しい言葉が生まれます。「いま混ぜる」か <kbd>M</kbd> キーで好きなときにも混ぜられ、生まれた言葉は文字起こしの上に残ります。',
          '<b>Typeface theme</b> sets the look of the letters and background; <b>Layout</b> sets where words go: Compose fills the screen, Cue stacks big words from the bottom, Ticker scrolls along the bottom, VJ draws words in glowing dots. <b>Display time</b> is how long words stay, and <b>Words on screen</b> is the most shown at once.<br>Premium typefaces, accent colors, backgrounds (image / camera) and VJ are Plus features you can try free for one day.<br>In VJ mode you pick a style (1px, LED, Neon, Pixel, Holo) and a typeface (5 kinds). 1px is a delicate monochrome look built only from dots and lines. If letters are hard to read, choose Gothic or Mincho. “Reduce motion” stops the movement.<br>Turn on <b>Word mix</b> (Brainstorm) and words on screen combine into brand-new words. Press “Mix now” or <kbd>M</kbd> any time; new words are kept above the transcript.')}</dd>
        <dt>${L('話者', 'Speakers')}</dt>
        <dd>${L(
          '話している人ごとに名前と色を付けます（最大4人）。切り替えはボタンかキーボードの <kbd>1</kbd>〜<kbd>4</kbd>。PC では声の高さで自動切り替えもできます。お手軽プラン以上の機能です。',
          'Give each person a name and color (up to 4). Switch with the buttons or keys <kbd>1</kbd>–<kbd>4</kbd>; on a computer it can also switch automatically by voice pitch. A Plus feature.')}</dd>
        <dt>${L('辞書', 'Dictionary')}</dt>
        <dd>${L(
          '<b>登録キーワード</b>は優先して拾い、強調して表示します。人名・商品名・プロジェクト名など、自動では拾いにくい語を入れてください。<b>NG ワード</b>は画面にも字幕にも出しません。',
          '<b>Keywords</b> are picked up first and highlighted — add names, products and project names. <b>Blocked words</b> never appear on screen or in captions.')}</dd>
        <dt>${L('表示ビュー', 'Display views')}</dt>
        <dd>${L(
          'プレビューと同じ表示を別ウィンドウで開きます。設定の変更は、同じブラウザで開いたすべての窓にすぐ反映されます。',
          'Opens the preview in its own window. Changes apply instantly to every window open in the same browser.')}</dd>
        <dt>${L('文字起こし', 'Transcript')}</dt>
        <dd>${L(
          '確定した発話が時刻つきで残ります。「TXT」でテキスト、「SRT」で動画用の字幕ファイルとして保存できます。つなぎ言葉（えー、あのー など）は自動で除きます。',
          'Finished sentences are kept with timestamps. Save them as text (TXT) or as a subtitle file for video (SRT). Fillers like “um” are removed automatically.')}</dd>
      </dl>
    </section>

    <section id="help-scenes">
      <h3 class="hp-h">${L('シーン別のおすすめ設定', 'Recommended settings by scene')}</h3>
      <p>${L(
        'ボタンを押すと、書体・レイアウト・表示時間などをまとめて切り替えます。あとから個別に調整できます。',
        'Each button switches typeface, layout, display time and more in one go. You can fine-tune afterwards.')}</p>
      <div class="hp-scenes">
        ${scene('stream', L('配信', 'STREAMING'), false, L('ひとり雑談', 'Solo chat stream'),
          L('話題になった言葉が画面いっぱいに組まれ、話が続くきっかけになります。', 'Topics fill the screen as you talk, giving you something to riff on.'),
          [L('夜 × 組版', 'Night × Compose'), L('表示 8 秒・24 語', '8 s · 24 words'), L('縦組み・字幕ライン あり', 'Vertical text and caption line on')])}
        ${scene('game', L('配信', 'STREAMING'), false, L('ゲーム実況', 'Gameplay commentary'),
          L('OBS に透過で重ね、画面下に細く流してゲーム画面の邪魔をしません。', 'Overlay it in OBS as a slim ticker that stays out of the gameplay.'),
          [L('透過 × テロップ', 'Clear × Ticker'), L('表示 6 秒・12 語', '6 s · 12 words'), L('字幕ライン なし', 'Caption line off')])}
        ${scene('brainstorm', L('ビジネス', 'BUSINESS'), true, L('ブレスト会議', 'Brainstorming meeting'),
          L('会議室のディスプレイに映して、出た言葉を全員で眺めます。何度も出た言葉ほど大きく残るので、議論の中心が見えてきます。', 'Put it on the meeting-room display so everyone sees the ideas. Words that keep coming up grow bigger, so the heart of the discussion stands out.'),
          [L('墨 × 組版（明るい画面で見やすい）', 'Sumi × Compose (easy to read on a bright screen)'), L('表示 30 秒・40 語で長く残す', '30 s · 40 words, so ideas linger'), L('新語ミックス あり（出た言葉を掛け合わせて新しい言葉を生む）', 'Word mix on (combines words into new ones)'), L('字幕ライン なし', 'Caption line off')])}
        ${scene('speech', L('ビジネス', 'BUSINESS'), true, L('スピーチ・講演', 'Speech or talk'),
          L('演台や手元のモニターに、話し終えた要点を大きく積み上げます。いまどこまで話したかが一目で分かります。', 'Stack the points you’ve covered in big type on the lectern or confidence monitor, so you always know where you are.'),
          [L('夜 × カンペ・大きめの文字', 'Night × Cue, larger text'), L('表示 15 秒・10 語', '15 s · 10 words'), L('字幕ライン あり', 'Caption line on')])}
      </div>
      <div class="hp-cols">
        <div>
          <h4>${L('会議で使うときのコツ', 'Tips for meetings')}</h4>
          <ul>
            <li>${L('マイクは話す人の近くに。部屋の端の人の声は拾いにくくなります。', 'Keep the mic close to whoever is talking — voices from the far end of the room are harder to pick up.')}</li>
            <li>${L('プロジェクト名・商品名・参加者の名前は<b>登録キーワード</b>に入れておきます。', 'Add project names, products and attendees to <b>Keywords</b> beforehand.')}</li>
            <li>${L('社外秘の名称は<b>NG ワード</b>に入れて画面から伏せます。', 'Put confidential names in <b>Blocked words</b> to keep them off screen.')}</li>
            <li>${L('発言者を色で分けたいときは「話者」を使います（お手軽プラン）。', 'To color-code who said what, use Speakers (Plus plan).')}</li>
            <li>${L('終わったら「TXT」で保存して、議事録の下書きに使えます。', 'Afterwards, save the TXT and use it as a first draft of the minutes.')}</li>
          </ul>
        </div>
        <div>
          <h4>${L('講演で使うときのコツ', 'Tips for talks')}</h4>
          <ul>
            <li>${L('自分だけが見るカンペなら、別窓を手元のモニターへ。プロジェクターには通常のスライドを出します。', 'For your eyes only, put the window on a confidence monitor and keep your slides on the projector.')}</li>
            <li>${L('聴衆にも見せるなら、字幕ラインを有効にした別窓を会場のスクリーンに映すと、後ろの席や聞き取りにくい方にも内容が届きます。', 'To share with the audience, show a window with the caption line on the venue screen — it helps people in the back and anyone who has trouble hearing.')}</li>
            <li>${L('講演を録画するなら「SRT」で字幕ファイルを保存しておくと、動画の字幕づけが楽になります。', 'If the talk is recorded, save an SRT to subtitle the video easily.')}</li>
          </ul>
        </div>
      </div>
    </section>

    <section id="help-obs">
      <h3 class="hp-h">${L('OBS に重ねる', 'Using with OBS')}</h3>
      <p>${L(
        'OBS のブラウザソースの中では音声認識が動かないため、認識はこの画面で行い、結果だけを OBS に送ります。このタブは開いたままにしてください。',
        'Speech recognition can’t run inside an OBS browser source, so listening happens on this page and only the results go to OBS. Keep this tab open.')}</p>
      <h4>${L('A. 透過で重ねる（推奨）', 'A. Transparent overlay (recommended)')}</h4>
      <ol>
        <li>${L('OBS 28 以降の「ツール → WebSocketサーバー設定」でサーバーを有効にし、パスワードを控える', 'In OBS 28 or later, enable Tools → WebSocket Server Settings and note the password')}</li>
        <li>${L('「表示ビュー」の「OBS に透過で重ねる」を開き、接続先とパスワードを入れて「接続」', 'Open “Overlay on OBS” under Display views, enter the address and password, then Connect')}</li>
        <li>${L('「URLをコピー」して OBS のブラウザソースに貼る（1920×1080）', 'Press Copy URL and paste it into an OBS Browser Source (1920×1080)')}</li>
      </ol>
      <h4>${L('B. かんたん', 'B. Quick setup')}</h4>
      <p>${L('「組版を別窓で」で開いた窓を、OBS の「ウィンドウキャプチャ」で取り込みます。', 'Open “Open compose view” and capture that window with OBS’s Window Capture.')}</p>
    </section>

    <section id="help-keys">
      <h3 class="hp-h">${L('ショートカット', 'Shortcuts')}</h3>
      <table class="hp-keys"><tbody>
        <tr><td><kbd>P</kbd></td><td>${L('表示の一時停止／再開（文字起こしは続きます）', 'Pause / resume the display (the transcript keeps going)')}</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>${L('表示中の言葉をすべて消す（ヘルプが開いているときはヘルプを閉じる）', 'Clear all words on screen (closes this help when it’s open)')}</td></tr>
        <tr><td><kbd>1</kbd>〜<kbd>4</kbd></td><td>${L('話者の色分けがオンのとき、いま話している人を切り替える', 'Switch the current speaker when speaker colors are on')}</td></tr>
        <tr><td><kbd>M</kbd></td><td>${L('新語ミックス：いま画面に出ている言葉を掛け合わせて、新しい言葉を生む', 'Word mix: combine the words on screen into a new word now')}</td></tr>
        <tr><td><kbd>?</kbd></td><td>${L('この使い方ガイドを開く', 'Open this guide')}</td></tr>
        <tr><td><kbd>F</kbd></td><td>${L('別窓の表示ビューで全画面にする', 'Full screen, in a display-view window')}</td></tr>
      </tbody></table>
      <p class="hp-tip">${L('入力欄にカーソルがあるときは、キーは文字入力として扱われます。', 'Keys type normally while a text field has focus.')}</p>
    </section>

    <section id="help-trouble">
      <h3 class="hp-h">${L('うまくいかないとき', 'Troubleshooting')}</h3>
      <div class="hp-faq">
        ${qa(L('「マイクの使用が許可されていません」と出る', '“Microphone access is not allowed”'),
          L('アドレスバーのアイコン（鍵や設定マーク）からサイトの設定を開き、マイクを「許可」にして再読み込みしてください。OS 側でブラウザのマイクが止められていることもあります（macOS：システム設定 → プライバシーとセキュリティ → マイク）。',
            'Open the site settings from the icon in the address bar, set Microphone to Allow, and reload. Your operating system may also be blocking the browser’s mic (macOS: System Settings → Privacy &amp; Security → Microphone).'))}
        ${qa(L('Android で「ピコン」と音が鳴る・マイクの確認が何度も出る', 'On Android, it beeps or keeps asking for the microphone'),
          L('Android の Chrome は、音声認識を始めるたびに端末のシステムの音が鳴ります（ページからは消せません）。KANPE は Android では聞き取りを開いたまま続けるので、鳴るのは話しはじめと、しばらく黙ったあとだけです。3分間声がなければ、音が鳴り続けないよう聞き取りを止めます。マイクの確認が何度も出るときは、アドレスバー左のアイコン →「権限」→「マイク」を「許可」にしてください（「今回のみ」を選ぶと、聞き取りを開き直すたびに確認が出ます）。',
            'Chrome on Android plays a system sound every time speech recognition starts (a web page can’t turn it off). On Android, KANPE keeps listening instead of restarting after every sentence, so you’ll only hear it when you start and after a long pause. After 3 minutes without a voice, listening stops so the sound doesn’t keep repeating. If the microphone prompt keeps coming back, tap the icon left of the address bar → Permissions → Microphone and choose Allow (“Only this time” asks again on every restart).'))}
        ${qa(L('「音声認識非対応のブラウザ」と出る', '“No speech recognition here”'),
          L('PC は Chrome か Edge、スマホは Safari（iPhone）か Chrome（Android）で開き直してください。アプリ内ブラウザでは使えません。iPhone では「設定」で Siri（または音声入力）をオンにしておく必要があります。',
            'Reopen the page in Chrome or Edge on a computer, or Safari (iPhone) / Chrome (Android) on a phone. In-app browsers won’t work. On iPhone, Siri (or Dictation) must be turned on in Settings.'))}
        ${qa(L('声は届いているのに、言葉が出てこない', 'My voice is reaching the mic, but no words appear'),
          L('「言語」が話している言語と合っているか確認してください。無料プランの音声認識はネットワーク越しにブラウザの提供元が処理するため、オフラインや、社内ネットワークでそのサービスが制限されていると動きません。',
            'Check that “Speech language” matches the language you’re speaking. Free-plan recognition is processed over the network by your browser’s maker, so it won’t work offline or on networks that block that service.'))}
        ${qa(L('名前や専門用語がうまく拾われない', 'Names and jargon aren’t picked up'),
          L('登録キーワードに入れると優先して拾います。認識そのものが別の言葉になる場合はブラウザの認識の限界で、おトクプランの高精度認識（近日公開）では用語集を認識に反映します。',
            'Add them to Keywords so they’re picked up first. If the recognizer hears a different word altogether, that’s a limit of browser recognition — Pro’s high-accuracy recognition (coming soon) uses your glossary.'))}
        ${qa(L('別窓やプレビューが連動しない', 'Other windows don’t update'),
          L('この画面と同じブラウザで開いた窓だけが連動します。別のブラウザやシークレットウィンドウで開いた窓には届きません。',
            'Only windows opened in the same browser stay in sync. Windows in another browser or a private window won’t receive updates.'))}
        ${qa(L('しばらく話さないと止まる', 'It stops after a silence'),
          L('ブラウザの音声認識は無音が続くと切れることがありますが、KANPE は自動で聞き取りを再開します。状態が「聞き取り中」なら、そのまま話しはじめて大丈夫です。',
            'Browser recognition can drop after silence, but KANPE restarts listening automatically. If the status says listening, just start talking.'))}
      </div>
    </section>

    <section id="help-data">
      <h3 class="hp-h">${L('プランとデータ', 'Plans and data')}</h3>
      <ul>
        <li>${L('文字起こし・設定・背景画像は、このブラウザの中にだけ保存されます。KANPE のサーバーには送りません。', 'Your transcript, settings and background images are stored only in this browser. Nothing is sent to KANPE’s servers.')}</li>
        <li>${L('無料・お手軽プランの音声認識はブラウザの機能です。音声はブラウザの提供元（Chrome は Google、Edge は Microsoft、Safari は Apple）が文字にします。', 'On the Free and Plus plans, recognition is a browser feature: your browser’s maker (Google for Chrome, Microsoft for Edge, Apple for Safari) turns speech into text.')}</li>
        <li>${L('プランの確認・解約・別の端末での復元は、右上のプランのボタンから行えます。', 'Check your plan, cancel, or restore it on another device from the plan button at the top right.')}</li>
        <li>${L('ライセンスコードは、お申し込みの直後に画面に表示され、お申し込みのメールアドレスにも届きます。ブラウザのデータを消したときや別の端末では、このコードで復元します。なくした場合は、プランのボタン →「ライセンスコードで復元」から、メールで送り直せます。',
          'Your license code is shown right after you subscribe and also emailed to the address you subscribed with. Use it to restore your plan on another device or after clearing browser data. Lost it? Have it emailed again from the plan button → “Restore with a license code”.')}</li>
        <li>${L('文字起こしは「消去」で、設定などはブラウザのサイトデータを削除すると消えます。', 'Clear the transcript with Clear; other data goes when you delete this site’s data in your browser.')}</li>
      </ul>
      <p class="hp-tip">${L('機密性の高い会議では、社内のルールに沿って利用できるか確認してください。', 'For confidential meetings, check your organization’s rules first.')}</p>
    </section>

    <footer class="hp-foot">
      <a href="index.html#faq">${L('よくある質問', 'FAQ')}</a>
      <a href="index.html#business">${L('ビジネスでの使い方', 'For business')}</a>
      <a href="index.html#pricing">${L('料金', 'Pricing')}</a>
    </footer>
  </div>
</div>`;
}

export function initHelp({ onPreset, onGuide } = {}) {
  const btn = document.getElementById('btnHelp');
  let dlg = null, body = null, links = [], sections = [];
  let pinned = ''; // 目次から飛んだ先（末尾近くの章でも、その章を選んだ状態にする）
  const isOpen = () => !!(dlg && dlg.open);

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'help-dialog';
    dlg.id = 'help';
    dlg.setAttribute('aria-labelledby', 'helpTitle');
    dlg.innerHTML = html();
    document.body.appendChild(dlg);
    body = dlg.querySelector('[data-help-body]');
    links = [...dlg.querySelectorAll('.hp-toc a')];
    sections = [...body.querySelectorAll('section[id]')];

    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // 窓の外を押したら閉じる
    dlg.querySelector('[data-help-close]').addEventListener('click', close);
    dlg.addEventListener('close', () => {
      if (location.hash.startsWith('#help')) history.replaceState(null, '', location.pathname + location.search);
      if (btn) btn.focus();
    });
    for (const a of links) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('href').slice(1);
        jump(id, true);
        history.replaceState(null, '', '#' + id);
      });
    }
    body.addEventListener('scroll', markActive, { passive: true });
    for (const ev of ['wheel', 'touchmove', 'keydown']) body.addEventListener(ev, () => { pinned = ''; }, { passive: true });
    const g = dlg.querySelector('[data-guide-start]');
    if (g) g.addEventListener('click', () => { close(); onGuide && onGuide(); });
    for (const b of dlg.querySelectorAll('[data-preset]')) {
      b.addEventListener('click', () => {
        const p = PRESETS[b.dataset.preset];
        if (!p) return;
        close();
        onPreset && onPreset(p);
      });
    }
  }

  function jump(id, smooth) {
    const el = id && body.querySelector('#' + CSS.escape(id));
    pinned = el ? id : '';
    body.scrollTo({ top: el ? el.offsetTop - body.offsetTop : 0, behavior: smooth ? 'smooth' : 'auto' });
    markActive();
  }
  function markActive() {
    if (!sections.length) return;
    let cur = sections[0];
    for (const s of sections) if (s.offsetTop - body.offsetTop <= body.scrollTop + 40) cur = s;
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) cur = sections[sections.length - 1];
    if (pinned) cur = sections.find((x) => x.id === pinned) || cur;
    for (const a of links) {
      const on = a.getAttribute('href') === '#' + cur.id;
      if (on && !a.classList.contains('on')) a.parentElement.scrollTo({ left: a.offsetLeft - 16, behavior: 'smooth' }); // スマホの横並び目次
      a.classList.toggle('on', on);
    }
  }
  function open(section) {
    if (!dlg) build();
    if (typeof dlg.showModal !== 'function') return;
    if (!dlg.open) dlg.showModal();
    requestAnimationFrame(() => jump(section, false));
    const h = '#' + (section || 'help');
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function close() { if (dlg && dlg.open) dlg.close(); }

  if (btn) btn.addEventListener('click', () => open());
  for (const b of document.querySelectorAll('[data-help-open]')) b.addEventListener('click', () => open());
  const fromHash = () => {
    const h = location.hash.slice(1);
    if (h === 'help') open();
    else if (TOC.some(([id]) => id === h)) open(h);
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
  return { open, close, isOpen };
}

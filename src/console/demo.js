// マイクなしで試すためのデモ。音声認識の途中結果が少しずつ伸びる様子を再現する。
import { Extractor, cleanCaption } from '../core/extract.js?v=202610111226';

export const DEMO_LINES = {
  ja: [
    'えーっと、今日はリアルタイムカンペシステムの話をしようと思います',
    'ライブ配信で話している言葉を、ブラウザの上にタイポグラフィとして表示するツールです',
    'まあ、一人で話していても画面が反応してくれると、話すのが楽しくなるんですよね',
    '音声認識はブラウザ標準のWeb Speech APIを使うので、ランニングコストはゼロ円です',
    '漢字とカタカナとひらがなを、それぞれ違うリズムで組んでいます',
    'たとえば新しいアイデアが出てくると、アクセントカラーで少しだけ派手に登場します',
    '同じキーワードを何度も話すと、タイポグラフィの文字がだんだん大きく育っていきます',
    '先月の配信は視聴者が3000人を超えて、コメントも前回の2倍になりました',
    'OBSのブラウザソースに透過背景で重ねれば、配信画面のオーバーレイにもなります',
    'えー、タイポグラフィで話が弾むような、そんな配信ツールを目指しています',
  ],
  en: [
    'Um, today I want to talk about a real-time Teleprompter for live streaming',
    'It listens to my voice and turns keywords into Typography right in the Browser',
    'Speech recognition runs on the Web Speech API, so the running cost is zero',
    'When a New Idea comes up, it appears with an Accent color',
    'If I keep repeating a keyword, the Typography grows bigger and bigger',
    'You can add it to OBS as a transparent Browser Source overlay',
  ],
};

export async function simulateSpeech({ lang = 'ja-JP', onInterim, onFinal, shouldStop = () => false, loop = false }) {
  const lines = DEMO_LINES[lang.startsWith('en') ? 'en' : 'ja'];
  let n = 0;
  do {
    for (const line of lines) {
      if (shouldStop()) return;
      const id = `demo:${n++}`;
      const chars = [...line];
      let i = 0;
      while (i < chars.length) {
        if (shouldStop()) return;
        i = Math.min(chars.length, i + 2 + Math.floor(Math.random() * 3));
        onInterim(id, chars.slice(0, i).join(''));
        await new Promise((r) => setTimeout(r, 85 + Math.random() * 60));
      }
      onFinal(id, line);
      await new Promise((r) => setTimeout(r, 650 + Math.random() * 700));
    }
  } while (loop && !shouldStop());
}

// 表示ビュー単体で回すデモ（display.html?demo=1）
export function runDemo({ lang = 'ja-JP', deliver, registered = '' }) {
  const ex = new Extractor({ lang, registered });
  simulateSpeech({
    lang, loop: true,
    onInterim: (id, t) => {
      for (const e of ex.interim(id, t)) deliver({ t: 'word', ...e });
      deliver({ t: 'caption', text: cleanCaption(t), final: false });
    },
    onFinal: (id, t) => {
      for (const e of ex.final(id, t)) deliver({ t: 'word', ...e });
      deliver({ t: 'caption', text: cleanCaption(t), final: true });
    },
  });
}

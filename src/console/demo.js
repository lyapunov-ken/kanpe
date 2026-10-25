// マイクなしで試すためのデモ。音声認識の途中結果が少しずつ伸びる様子を再現する。
import { Extractor, cleanCaption } from '../core/extract.js?v=202610251603';

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

// ランディングページの見本（display.html?demo=1&script=meeting / speech / talk）
export const SCRIPTS = {
  talk: { // 顔出しなしの雑談配信
    ja: [
      'こんばんは、今日もカメラなしでゆるっと雑談配信をしていきます',
      '最近はまっているのは、朝のコーヒーと古い映画です',
      '週末は近所の喫茶店で、ずっと読書をしていました',
      'そうそう、コメントで教えてもらったパン屋さんにも行ってきました',
      'カメラがなくても、話した言葉が画面に出るので話しやすいんです',
      '次の配信では、みんなのおすすめの映画を聞きたいな',
      'それじゃあ今日の雑談はこのへんで、また来週の配信で会いましょう',
    ],
    en: [
      'a cozy Chat Stream tonight, no Camera',
      'into Morning Coffee and Old Movies lately',
      'a weekend of Reading at a little Cafe',
      'tried the Bakery you recommended in Chat',
      'no Camera needed, my Words show up on screen',
      'next time, share your favorite Movies',
      'thanks for tonight, see you Next Week',
    ],
  },
  meeting: {
    ja: [
      'じゃあ、新規顧客を増やす方法をブレストしていきましょう',
      'まず紹介制度はどうですか、既存のお客様から新規顧客を紹介してもらう形です',
      'それなら紹介した人にも特典があるといいですね',
      'オンボーディングも見直したいです、最初の一週間でやめてしまう人が多いので',
      '解約率でいうと、無料トライアルの終わりが一番の山です',
      'サブスクに年払いプランを作れば、解約率は下がりそうです',
      '地方の中小企業向けに、オンラインセミナーを開くのはどうでしょう',
      'セミナーで紹介制度を案内すれば、新規顧客にもつながりますね',
      'いいですね、紹介制度とオンボーディングを来月の施策にしましょう',
    ],
    en: [
      'Brainstorm: how do we win New Customers',
      'a Referral Program for existing customers',
      'Rewards for both sides',
      'Rework Onboarding for the first week',
      'Churn peaks when the Free Trial ends',
      'an Annual Plan could lower Churn',
      'Webinars for small businesses',
      'Mention the Referral Program in Webinars',
      'Next month: Referral Program and Onboarding',
    ],
  },
  speech: {
    ja: [
      'えー、本日のテーマは三つです',
      '一つ目は、この一年の市場の変化について',
      '国内の利用者は前年比で120%に伸びました',
      '二つ目は、私たちの三つの施策です',
      'サポート体制、価格、そしてパートナー企業との連携です',
      '三つ目は、来期の目標です',
      '来期は継続率95%を目標にします',
      'ありがとうございました、それでは質疑応答に移ります',
    ],
    en: [
      'Um, three Topics today',
      'First, the Market this year',
      'Users grew 120% year over year',
      'Second, our three Initiatives',
      'Better Support, new Pricing, and Partnerships',
      'Third, Goals for next year',
      'Goal: Customer Retention at 95%',
      'Thank you, now Questions',
    ],
  },
};

// pace：ゆっくりさ（1＝ふつう）。関数なら毎回たずねる（デモの途中でレイアウトを変えても、すぐに合わせる）。モーションでは 2.2 ほど（ふつうに話す速さ）にして、展開を落ち着かせる
export async function simulateSpeech({ lang = 'ja-JP', onInterim, onFinal, shouldStop = () => false, loop = false, script = '', pace = 1 }) {
  const k = () => Math.max(0.5, Math.min(3, +(typeof pace === 'function' ? pace() : pace) || 1));
  const set = SCRIPTS[script] || DEMO_LINES;
  const lines = set[lang.startsWith('en') ? 'en' : 'ja'];
  let n = 0;
  do {
    for (const line of lines) {
      if (shouldStop()) return;
      const id = `demo:${n++}`;
      const chars = [...line];
      let i = 0;
      while (i < chars.length) {
        if (shouldStop()) return;
        const kk = k();
        i = Math.min(chars.length, i + (kk > 1.3 ? 1 : 2) + Math.floor(Math.random() * 3));
        onInterim(id, chars.slice(0, i).join(''));
        await new Promise((r) => setTimeout(r, (85 + Math.random() * 60) * kk));
      }
      onFinal(id, line);
      await new Promise((r) => setTimeout(r, (650 + Math.random() * 700) * k() * 1.15));
    }
  } while (loop && !shouldStop());
}

// 表示ビュー単体で回すデモ（display.html?demo=1）
export function runDemo({ lang = 'ja-JP', deliver, registered = '', script = '', pace = 1 }) {
  const ex = new Extractor({ lang, registered });
  simulateSpeech({
    lang, loop: true, script, pace,
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

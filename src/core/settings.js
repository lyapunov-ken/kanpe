// 書体テーマと既定値。Google Fonts（無料）を使い、読めない環境では OS の和文書体へ自動で切り替える。
const GOTHIC = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","YuGothic","Noto Sans CJK JP","Noto Sans JP",sans-serif';
const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif CJK JP","Noto Serif JP",serif';

export const THEMES = {
  sumi: {
    label: '墨', labelEn: 'Sumi', note: '明朝・紙と朱', noteEn: 'Mincho on paper, vermilion',
    family: '"Shippori Mincho B1"', fallback: MINCHO, gf: 'Shippori+Mincho+B1:wght@500;800',
    strong: 800, light: 500,
    bg: '#f2ede3', ink: '#1c1a16', sub: '#8b8477', accent: '#c7381f', accent2: '#2c5a87', stroke: 'transparent',
  },
  yoru: {
    label: '夜', labelEn: 'Night', note: 'ゴシック・黒地', noteEn: 'Gothic on black',
    family: '"Zen Kaku Gothic New"', fallback: GOTHIC, gf: 'Zen+Kaku+Gothic+New:wght@500;900',
    strong: 900, light: 500,
    bg: '#0d0e12', ink: '#f3f1ea', sub: '#7c808b', accent: '#3ddc84', accent2: '#62d0ff', stroke: 'transparent',
  },
  pop: {
    label: 'ポップ', labelEn: 'Pop', note: '極太・雑談向け', noteEn: 'Ultra-bold, for chatty streams',
    family: '"Dela Gothic One"', fallback: GOTHIC, gf: 'Dela+Gothic+One',
    strong: 900, light: 400, // Dela は400のみ。font-synthesis:none で擬似ボールドを防ぎ、代替書体だけ太くする
    bg: '#17131f', ink: '#fff6ec', sub: '#988cb0', accent: '#ff4f8b', accent2: '#3ee6c5', stroke: 'transparent',
  },
  yawaraka: {
    label: 'やわらか', labelEn: 'Soft', note: '丸ゴシック', noteEn: 'Rounded gothic',
    family: '"Zen Maru Gothic"', fallback: GOTHIC, gf: 'Zen+Maru+Gothic:wght@500;900',
    strong: 900, light: 500,
    bg: '#faf5ee', ink: '#3a332e', sub: '#a59b92', accent: '#e46f55', accent2: '#4f9585', stroke: 'transparent',
  },
  clear: {
    label: '透過', labelEn: 'Clear', note: 'OBSオーバーレイ', noteEn: 'OBS overlay',
    family: '"Zen Kaku Gothic New"', fallback: GOTHIC, gf: 'Zen+Kaku+Gothic+New:wght@500;900',
    strong: 900, light: 500,
    bg: 'transparent', ink: '#ffffff', sub: 'rgba(255,255,255,.78)', accent: '#ffe14d', accent2: '#7fe3ff', stroke: 'rgba(0,0,0,.82)',
  },
  // ---- プレミアム書体（お手軽プラン以上。無料プランは1日お試し） ----
  fude: {
    label: '筆', labelEn: 'Brush', note: '墨書き・和紙', noteEn: 'Ink brush on washi', pro: true,
    family: '"Yuji Boku"', fallback: MINCHO, gf: 'Yuji+Boku',
    strong: 900, light: 400, // 1ウェイトのみ。擬似ボールドは作らない
    bg: '#eee7d8', ink: '#1a1612', sub: '#8e8576', accent: '#bf2a1c', accent2: '#2b4c70', stroke: 'transparent',
  },
  dot: {
    label: 'ドット', labelEn: 'Dot', note: 'レトロゲーム画面', noteEn: 'Retro game screen', pro: true,
    family: '"DotGothic16"', fallback: GOTHIC, gf: 'DotGothic16',
    strong: 900, light: 400,
    bg: '#06120b', ink: '#b6ffcc', sub: '#3d7a53', accent: '#ffe45c', accent2: '#ff6bd6', stroke: 'transparent',
  },
};

export const DEFAULT_THEME = 'sumi';

// アクセントカラーの候補（空＝書体テーマ標準の色）。無料プランでも選べる
export const ACCENTS = [
  { c: '#ffd23f', label: '黄', labelEn: 'Yellow' },
  { c: '#ff8a3d', label: '橙', labelEn: 'Orange' },
  { c: '#e0352b', label: '朱', labelEn: 'Vermilion' },
  { c: '#ff4f8b', label: '桃', labelEn: 'Pink' },
  { c: '#a78bfa', label: '紫', labelEn: 'Purple' },
  { c: '#4f7cff', label: '青', labelEn: 'Blue' },
  { c: '#4cc9f0', label: '水', labelEn: 'Sky' },
  { c: '#3ddc84', label: '緑', labelEn: 'Green' },
  { c: '#ffffff', label: '白', labelEn: 'White' },
];

export const LAYOUTS = {
  compose: { label: '組版', labelEn: 'Compose', note: '画面いっぱいに文字を組む', noteEn: 'Sets words across the whole screen' },
  kanpe: { label: 'カンペ', labelEn: 'Cue', note: '下から積み上がる大きな文字', noteEn: 'Big words stacking up from the bottom' },
  ticker: { label: 'テロップ', labelEn: 'Ticker', note: '下部を横に流れる', noteEn: 'Scrolls along the bottom' },
  vj: { label: 'VJ', labelEn: 'VJ', note: 'ドットアートで言葉を描く VJ 演出（お手軽プラン以上）', noteEn: 'VJ visuals that draw words in dot art (Plus and up)', pro: true },
};

// VJ モードの見た目
export const VJ_STYLES = {
  micro: { label: '1px', labelEn: '1px', note: '1px の点と線だけで組む、モノクロのテクノ表示', noteEn: 'Monochrome techno visuals built only from 1px dots and lines' },
  led: { label: 'LED', labelEn: 'LED', note: '丸い電球のドット。アクセント色で光る', noteEn: 'Round bulb dots glowing in the accent color' },
  neon: { label: 'ネオン', labelEn: 'Neon', note: '色が移ろうネオン管のドット', noteEn: 'Neon-tube dots with drifting colors' },
  pixel: { label: 'ピクセル', labelEn: 'Pixel', note: '角ドットのレトロゲーム風。文字が1字ずつ跳ねる', noteEn: 'Square pixels, retro game style. Letters hop one by one' },
};

// VJ モードの書体。rows はドットの段数（多いほど細かく、読みやすい）。ドット書体は16段で設計されているので固定
export const VJ_FONTS = {
  gothic: { label: 'ゴシック', labelEn: 'Gothic', note: '太いゴシック。いちばん読みやすい', noteEn: 'Heavy gothic. The easiest to read',
    family: '"Zen Kaku Gothic New"', weight: 900, gf: 'Zen+Kaku+Gothic+New:wght@900', rows: 24 },
  maru: { label: '丸ゴ', labelEn: 'Round', note: '丸ゴシック。やわらかい印象', noteEn: 'Rounded gothic. Soft and friendly',
    family: '"Zen Maru Gothic"', weight: 900, gf: 'Zen+Maru+Gothic:wght@900', rows: 24 },
  mincho: { label: '明朝', labelEn: 'Mincho', note: '太い明朝。和の看板のように', noteEn: 'Bold Mincho, like a Japanese shop sign',
    family: '"Shippori Mincho B1"', weight: 800, gf: 'Shippori+Mincho+B1:wght@800', rows: 28 },
  pop: { label: '極太', labelEn: 'Bold', note: '極太のポップ体。遠くからでも目立つ', noteEn: 'Ultra-bold display face. Stands out from afar',
    family: '"Dela Gothic One"', weight: 400, gf: 'Dela+Gothic+One', rows: 22 },
  dot: { label: 'ドット', labelEn: 'Pixel', note: '16 ドットのレトロな書体。細かい漢字は読みにくくなります', noteEn: 'Retro 16-dot font. Complex kanji get hard to read',
    family: '"DotGothic16"', weight: 400, gf: 'DotGothic16', rows: 16, fixed: true },
};
// ドットの細かさ（段数にかける倍率）
export const VJ_DETAILS = {
  coarse: { label: '粗い', labelEn: 'Coarse', k: 0.75 },
  mid: { label: '標準', labelEn: 'Standard', k: 1 },
  fine: { label: '細かい', labelEn: 'Fine', k: 1.35 },
};
// 演出の強さ（「動きを控えめに」がオンなら、強さに関係なく動きを止める）
export const VJ_FX = {
  low: { label: '控えめ', labelEn: 'Subtle', k: 0.35 },
  mid: { label: '標準', labelEn: 'Standard', k: 0.7 },
  high: { label: '派手', labelEn: 'Intense', k: 1 },
};

// 新語ミックスの見た目：色・出かた・速さ（コンソールで「ランダム」を毎回1つに決めてから表示ビューへ送る）
export const FUSION_COLORS = [
  { c: '', label: '標準', labelEn: 'Default' },          // 書体テーマの第2アクセント色
  { c: '#ffc83d', label: '金', labelEn: 'Gold' },
  { c: '#e0352b', label: '朱', labelEn: 'Vermilion' },
  { c: '#ff4f8b', label: '桃', labelEn: 'Pink' },
  { c: '#a78bfa', label: '紫', labelEn: 'Purple' },
  { c: '#2f6bff', label: '青', labelEn: 'Blue' },
  { c: '#14b8a6', label: '翠', labelEn: 'Teal' },
  { c: 'rainbow', label: '虹', labelEn: 'Rainbow' },     // 1字ずつ色を変える
  { c: 'random', label: 'ランダム', labelEn: 'Random' }, // 生まれるたびに上の色から選ぶ
];
export const FUSION_MOTIONS = {
  collide: { label: '衝突', labelEn: 'Collide', note: '2語が引き寄せられて激突し、衝撃波の中から生まれる', noteEn: 'Two words crash together and the new one bursts out of the shockwave' },
  decode: { label: 'デコード', labelEn: 'Decode', note: '字が高速で入れ替わり、光の柱とともに1字ずつ確定する', noteEn: 'Glyphs flicker at speed and lock in one by one under pillars of light' },
  shutter: { label: 'シャッター', labelEn: 'Shutter', note: '裂けた帯が残像を引いて走り抜け、一気に組み上がる', noteEn: 'Sliced strips streak in with motion blur and snap together' },
  converge: { label: '集束', labelEn: 'Converge', note: '散った字が残像を引きながら、らせんを描いて集まる', noteEn: 'Scattered letters spiral in, trailing afterimages' },
  scan: { label: 'スキャン', labelEn: 'Scan', note: '光が走り抜け、字が奥から立ち上がって実体化する', noteEn: 'A beam sweeps across and letters rise up out of the screen' },
  ink: { label: '墨', labelEn: 'Ink', note: '墨がにじむように字が浮かび、しぶきが散る', noteEn: 'Letters bleed in like ink, with splashes' },
  random: { label: 'ランダム', labelEn: 'Random', note: '生まれるたびに出かたを選び直す', noteEn: 'Picks a different motion every time' },
};
export const FUSION_SPEEDS = {
  slow: { label: 'ゆっくり', labelEn: 'Slow', k: 1.6 },
  mid: { label: 'ふつう', labelEn: 'Normal', k: 1 },
  fast: { label: '速い', labelEn: 'Fast', k: 0.6 },
};

// カンペ：同じ話の記憶（この時間内のくり返しを数える）
export const ECHO_SPANS = {
  '0': { label: 'オフ', labelEn: 'Off', note: 'くり返しても大きさは変わりません', noteEn: 'Repeated words keep their size' },
  '5': { label: '5分', labelEn: '5 min', note: '5分以内にくり返した言葉ほど大きく、長く残ります。同じ話を続けると画面が言葉で埋まっていきます', noteEn: 'Words repeated within 5 minutes grow bigger and stay longer. Keep on the same topic and the screen fills with words' },
  '10': { label: '10分', labelEn: '10 min', note: '10分以内のくり返しを数えます。長めの講演や会議向けです', noteEn: 'Counts repeats within 10 minutes. Good for longer talks and meetings' },
};

// 話者の色（ラベルと文字色に使う）
export const SPEAKER_COLORS = ['#ffb020', '#3fb6ff', '#ff5c8a', '#4cd97b', '#b18cff', '#ffffff'];
export const MAX_SPEAKERS = 4;
export const DEFAULT_SPEAKERS = [
  { name: 'わたし', nameEn: 'Me', color: '#ffb020', f0: 0 },
  { name: 'ゲスト', nameEn: 'Guest', color: '#3fb6ff', f0: 0 },
  { name: 'ゲスト2', nameEn: 'Guest 2', color: '#ff5c8a', f0: 0 },
  { name: 'ゲスト3', nameEn: 'Guest 3', color: '#4cd97b', f0: 0 },
];

// 文字サイズ・表示時間・同時に出す語は5段階から選ぶ（まん中が初めの値）。保存された値は近い段に寄せる
export const SIZE_STEPS = {
  26: { label: '極小', labelEn: 'XS', note: 'とても小さく（画面の隅で控えめに）', noteEn: 'Extra small' },
  30: { label: '小', labelEn: 'S', note: '小さめ', noteEn: 'Small' },
  34: { label: '中', labelEn: 'M', note: 'ふつう（初めの値）', noteEn: 'Medium (default)' },
  42: { label: '大', labelEn: 'L', note: '大きめ（配信の画面でも読みやすく）', noteEn: 'Large' },
  56: { label: '特大', labelEn: 'XL', note: 'とても大きく（講演・会場のスクリーン向け）', noteEn: 'Extra large, for stages and big screens' },
};
export const TTL_STEPS = {
  4: { label: '4秒', labelEn: '4s', note: 'すぐ消える（テンポの速い話に）', noteEn: 'Gone quickly, for fast talk' },
  6: { label: '6秒', labelEn: '6s', note: '短め', noteEn: 'Short' },
  8: { label: '8秒', labelEn: '8s', note: 'ふつう（初めの値）', noteEn: 'Normal (default)' },
  15: { label: '15秒', labelEn: '15s', note: '長め（ゆっくり話すとき）', noteEn: 'Long, for slower talk' },
  30: { label: '30秒', labelEn: '30s', note: 'とても長く（ブレストや講演で言葉を残したいとき）', noteEn: 'Very long, to keep words up during brainstorms and talks' },
};
export const WORD_STEPS = {
  10: { label: '10語', labelEn: '10', note: '少なく、大きく見せる', noteEn: 'Few words, shown big' },
  16: { label: '16語', labelEn: '16', note: '少なめ', noteEn: 'Fewer' },
  24: { label: '24語', labelEn: '24', note: 'ふつう（初めの値）', noteEn: 'Normal (default)' },
  32: { label: '32語', labelEn: '32', note: '多め', noteEn: 'More' },
  40: { label: '40語', labelEn: '40', note: 'とても多く（画面を言葉で埋める）', noteEn: 'Lots — fill the screen' },
};
export function nearestStep(steps, v) {
  const keys = Object.keys(steps).map(Number);
  const n = Number(v);
  if (!Number.isFinite(n)) return keys[Math.floor(keys.length / 2)];
  return keys.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
}

// カスタムロゴの大きさ。ref は 1280×720 の画面での一辺（px）。表示ビューは窓の大きさに合わせて拡縮する
export const LOGO_SIZES = {
  s: { label: '小', labelEn: 'S', ref: 72, note: '控えめに、画面の隅に', noteEn: 'Small, tucked into the corner' },
  m: { label: '中', labelEn: 'M', ref: 104, note: 'ふつうの大きさ', noteEn: 'Medium' },
  l: { label: '大', labelEn: 'L', ref: 144, note: '大きく目立たせる', noteEn: 'Large and prominent' },
};

export const DEFAULTS = {
  theme: 'sumi',     // 初めての人は墨（明るい紙と朱）から
  layout: 'compose',
  baseSize: 34,      // 1280×720 換算の px。表示ビューの大きさ（縦・横の小さい方の比率）に合わせて拡縮する
  ttl: 8,            // 秒
  maxWords: 24,
  vertical: true,    // 縦組みを混ぜる（組版レイアウト）
  caption: true,     // 最新の発話を字幕ラインで出す
  reduceMotion: false,
  accent: '',        // アクセントカラー（空＝書体テーマ標準）
  vjStyle: 'micro',  // VJ モードの見た目（1px / LED / ネオン / ピクセル）
  vjFont: 'gothic',  // VJ モードの書体
  vjDetail: 'mid',   // ドットの細かさ（画面からは外した。いつも標準）
  vjFx: 'mid',       // 演出の強さ（画面からは外した。「動きを控えめに」で止める）
  fusion: false,     // 新語ミックス：画面の言葉を掛け合わせて新しい言葉を生む（ブレスト向け）
  fusionColor: '',   // 新語の色（空＝標準。rainbow / random も選べる）
  fusionMotion: 'collide', // 新語の出かた（collide / decode / shutter / converge / scan / random）
  fusionSpeed: 'mid',      // 新語の出る速さ（slow / mid / fast）
  echo: '5',         // カンペ：同じ話の記憶（分）。この時間内にくり返した言葉ほど大きく・長く残り、画面を埋めていく。'0' でオフ
  speakerMode: 'off', // 話者の色分け：off / manual（手動で切り替え）/ auto（声の高さで推定）
  speakerCount: 2,
  speakers: DEFAULT_SPEAKERS,
  bgImage: '',       // 背景画像（data URL。長辺1000px以下に縮小済み）
  bgDim: 0.4,        // 背景（画像・カメラ）の上に重ねる地色の濃さ（文字を読みやすくする）
  bgCamera: false,   // 背景にカメラの映像を映す（お手軽プラン。映像はこの端末の中だけで扱う）
  bgCameraId: '',    // 使うカメラ（空なら既定のカメラ）
  bgMirror: true,    // カメラの映像を左右反転（鏡のように）
  logo: '',          // カスタムロゴ（data URL。正方形に切り抜いて 320px 以下に縮小済み。お手軽プラン）
  logoSize: 'm',     // ロゴの大きさ：s / m / l（LOGO_SIZES）
  lang: 'ja-JP',
  registered: '',
  ng: '',
  obsEnabled: false,
  obsUrl: 'ws://127.0.0.1:4455',
  obsPassword: '',
};

const KEY = 'kanpe.settings.v1';
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* プライベートモード等 */ }
}

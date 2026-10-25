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
  yawaraka: {
    label: 'やわらか', labelEn: 'Soft', note: '丸ゴシック', noteEn: 'Rounded gothic',
    family: '"Zen Maru Gothic"', fallback: GOTHIC, gf: 'Zen+Maru+Gothic:wght@500;900',
    strong: 900, light: 500,
    bg: '#faf5ee', ink: '#3a332e', sub: '#a59b92', accent: '#e46f55', accent2: '#4f9585', stroke: 'transparent',
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
  clear: {
    label: '透過', labelEn: 'Clear', note: 'OBSオーバーレイ', noteEn: 'OBS overlay', pro: true,
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
  motion: { label: 'モーション', labelEn: 'Motion', note: '話した文が1字ずつ現れ、図形が動くモーショングラフィックス', noteEn: 'Your words appear letter by letter, with shapes in motion' },
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
  firework: { label: '花火', labelEn: 'Firework', note: '光が昇って弾け、火花の中から字が花開く', noteEn: 'A spark rises and bursts, and the word blooms out of the fireworks' },
  random: { label: 'ランダム', labelEn: 'Random', note: '生まれるたびに出かたを選び直す', noteEn: 'Picks a different motion every time' },
};
export const FUSION_SPEEDS = {
  slow: { label: 'ゆっくり', labelEn: 'Slow', k: 1.6 },
  mid: { label: 'ふつう', labelEn: 'Mid', k: 1 },
  fast: { label: '速い', labelEn: 'Fast', k: 0.6 },
};

// 新語ミックス：自動で混ぜる頻度。gap は前の新語からあける時間、words はそのあいだに新しく出た言葉の数（これだけ出たら混ぜる）
// モーションでは新語ごとに数秒の演出が入るので、motionGap より短くはしない
export const FUSION_FREQS = {
  rare: { label: 'ときどき', labelEn: 'Rare', gap: 30000, words: 4, note: '30秒に1回くらい。話の流れを邪魔しない程度に', noteEn: 'About every 30 s, without interrupting the talk' },
  mid: { label: 'ふつう', labelEn: 'Mid', gap: 14000, words: 2, note: '15秒に1回くらい（初めの値）', noteEn: 'About every 15 s (default)' },
  often: { label: '多め', labelEn: 'Often', gap: 8000, words: 1, note: '8秒に1回くらい。アイデアをどんどん出したいときに（モーションでは12秒以上あけます）', noteEn: 'About every 8 s, for rapid-fire ideas (at least 12 s apart in Motion)' },
};
export const FUSION_MOTION_GAP = 12000;

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

// 別窓の操作バーの「文字サイズ」（その窓だけ、言葉の基準の大きさを変える）は5段階。保存された値は近い段に寄せる
export const SIZE_STEPS = {
  26: { label: '極小', labelEn: 'XS', note: 'とても小さく（画面の隅で控えめに）', noteEn: 'Extra small' },
  30: { label: '小', labelEn: 'S', note: '小さめ', noteEn: 'Small' },
  34: { label: '中', labelEn: 'M', note: 'ふつう（初めの値）', noteEn: 'Medium (default)' },
  42: { label: '大', labelEn: 'L', note: '大きめ（配信の画面でも読みやすく）', noteEn: 'Large' },
  56: { label: '特大', labelEn: 'XL', note: 'とても大きく（講演・会場のスクリーン向け）', noteEn: 'Extra large, for stages and big screens' },
};

// ---- 字幕ライン（画面の最下部に出る、聞き取った文）の3つの設定 ----
// ref は 1280×720 の画面での文字の大きさ（px）。表示ビューは窓の大きさに合わせて拡縮する
export const CAP_SIZES = {
  s: { label: '小', labelEn: 'S', ref: 14, note: '字幕を小さく、控えめに', noteEn: 'Small, unobtrusive captions' },
  m: { label: '中', labelEn: 'M', ref: 18, note: 'ふつうの大きさ（初めの値）', noteEn: 'Medium (default)' },
  l: { label: '大', labelEn: 'L', ref: 26, note: '大きく（会場のスクリーンや、聞き取りにくい方に）', noteEn: 'Large, for venue screens and accessibility' },
};
// 話し終えてから、字幕が消えるまでの秒数
export const CAP_TTLS = {
  3: { label: '3秒', labelEn: '3s', note: 'すぐ消える', noteEn: 'Disappears quickly' },
  5: { label: '5秒', labelEn: '5s', note: 'ふつう（初めの値）', noteEn: 'Normal (default)' },
  10: { label: '10秒', labelEn: '10s', note: '長く残す（ゆっくり読みたいとき）', noteEn: 'Stays longer, for slower reading' },
};
// 同時に出す行：いま話している文に加えて、少し前の文を何行まで残すか
export const CAP_LINES = {
  1: { label: '1行', labelEn: '1', note: 'いま話している文だけ', noteEn: 'Only the current sentence' },
  2: { label: '2行', labelEn: '2', note: '1つ前の文も残す', noteEn: 'Keep the previous sentence too' },
  3: { label: '3行', labelEn: '3', note: '2つ前の文まで残す（字幕のように流れる）', noteEn: 'Keep two previous sentences, like subtitles' },
};

// ---- レイアウトごとの設定（3段階）----
// 文字の大きさ：レイアウトごとの倍率
export const LAYOUT_SIZES = {
  s: { label: '小', labelEn: 'S', k: 0.8, note: '小さめ。言葉を多く並べたいときに', noteEn: 'Smaller, to fit more words' },
  m: { label: '中', labelEn: 'M', k: 1, note: 'ふつう（初めの値）', noteEn: 'Medium (default)' },
  l: { label: '大', labelEn: 'L', k: 1.32, note: '大きく。遠くからでも読みやすく', noteEn: 'Larger, readable from afar' },
};
// 育つまで：同じ言葉を何回くり返したら、ひと回り大きくなるか
export const GROW_STEPS = {
  1: { label: '1回', labelEn: '1×', note: 'くり返すたびに大きくなる（初めの値）', noteEn: 'Grows every time it’s repeated (default)' },
  2: { label: '2回', labelEn: '2×', note: '2回くり返すごとに大きくなる', noteEn: 'Grows every second repeat' },
  3: { label: '3回', labelEn: '3×', note: '3回くり返すごとに大きくなる（大きさが落ち着く）', noteEn: 'Grows every third repeat, for a calmer screen' },
};
// 組版：大小の差（ジャンプ率）。r は語の重みごとの倍率
export const JUMP_STEPS = {
  low: { label: '控えめ', labelEn: 'Low', r: [1, 1.3, 1.7, 2.3], note: '大きさをそろえて、落ち着いた組み', noteEn: 'Even sizes for a calm layout' },
  mid: { label: '標準', labelEn: 'Mid', r: [1, 1.5, 2.25, 3.4], note: 'ふつう（初めの値）', noteEn: 'Normal (default)' },
  high: { label: '大胆', labelEn: 'High', r: [1, 1.75, 2.8, 4.3], note: '大きい語をより大きく、ポスターのように', noteEn: 'Big words get bigger, poster-style' },
};
// 組版：縦組みの量。p は [ふつうの語, 重い語] が縦になる割合
export const VERT_STEPS = {
  off: { label: 'なし', labelEn: 'Off', p: [0, 0], note: '縦組みを混ぜない', noteEn: 'No vertical text' },
  low: { label: '少し', labelEn: 'Few', p: [0.1, 0.2], note: 'ときどき縦に組む', noteEn: 'Now and then' },
  mid: { label: '標準', labelEn: 'Mid', p: [0.22, 0.4], note: 'ふつう（初めの値）', noteEn: 'Normal (default)' },
  high: { label: '多め', labelEn: 'Lots', p: [0.4, 0.65], note: '縦組みを多くして、和のポスターのように', noteEn: 'Lots of vertical text, like a Japanese poster' },
};
// 組版：文字の重なり。オフは空いている場所に言葉が増えていく（空きがなければ、その場所の語が早めに退く）。
// オンは言葉の上に言葉を重ねてよい（ロゴと新語ミックスの新語には重ねない）
export const OVERLAP_STEPS = {
  off: { label: 'オフ', labelEn: 'Off', note: '重ねない。空いている場所に言葉が増えていく（初めの値）', noteEn: 'No overlap: new words fill the empty space (default)' },
  on: { label: 'オン', labelEn: 'On', note: '言葉の上に言葉を重ねて、にぎやかに組む', noteEn: 'Words may stack on top of each other for a busier look' },
};
// 組版：残る時間。言葉が出てから消えるまでの秒数
export const LIFE_STEPS = {
  5: { label: '5秒', labelEn: '5s', note: 'すぐ消える（テンポの速い話に）', noteEn: 'Gone quickly, for fast talk' },
  8: { label: '8秒', labelEn: '8s', note: 'ふつう（初めの値）', noteEn: 'Normal (default)' },
  30: { label: '30秒', labelEn: '30s', note: '長く残す（ブレストや講演で、出た言葉を眺めたいとき）', noteEn: 'Stays long, so ideas linger in brainstorms and talks' },
};
// モーション：テイスト（字の現れかたと図形の選びかた）
export const MOTION_TASTES = {
  cool: { label: 'クール', labelEn: 'Cool', note: 'ぼかしから浮かぶ字と、線・枠・棒のすっきりした図形', noteEn: 'Letters sharpen out of a blur, with clean lines, frames and bars' },
  mix: { label: 'ミックス', labelEn: 'Mix', note: 'クールとポップを場面ごとに混ぜる（初めの値）', noteEn: 'Mixes cool and pop scene by scene (default)' },
  pop: { label: 'ポップ', labelEn: 'Pop', note: '字が弾んで跳ね、丸や星がぷるぷる動くコミカルな演出', noteEn: 'Bouncy letters with jiggly circles and stars, for a comic feel' },
};
// モーション：画面の四隅の計器（経過時間・話す速さ・声の大きさ・場面の番号）
export const MOTION_HUD = {
  on: { label: 'あり', labelEn: 'On', note: '四隅に経過時間・話す速さ・声の大きさ・場面の番号を出す（初めの値）', noteEn: 'Shows time, speaking pace, voice level and scene number in the corners (default)' },
  off: { label: 'なし', labelEn: 'Off', note: '計器を出さず、言葉と図形だけにする', noteEn: 'Hides the readouts: just words and shapes' },
};
// モーション：音に反応（声の大きさ／周りの音の帯域と拍／反応しない）
export const MOTION_SOUND = {
  voice: { label: '声', labelEn: 'Voice', note: '声の大きさで計器が揺れ、大きな声で火花が散る（初めの値）', noteEn: 'Meters follow your voice, and a loud voice throws sparks (default)' },
  room: { label: '周りの音', labelEn: 'Room', note: 'BGM や会場の音の拍で画面が脈打ち、計器はスペクトラムと BPM に。音はこの端末の中だけで使います', noteEn: 'The screen pulses to the beat of music or the room; meters show a spectrum and BPM. Audio never leaves this device' },
  off: { label: 'オフ', labelEn: 'Off', note: '音には反応しない', noteEn: 'Don’t react to sound' },
};
// レイアウトごとの文字の大きさは、どの設定に入っているか
export const SIZE_KEY = { compose: 'cSize', kanpe: 'kSize', motion: 'mSize' };

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
  baseSize: 34,      // 言葉の基準の大きさ（1280×720 換算の px）。コンソールでは変えず、レイアウトごとの倍率（cSize など）で変える。別窓の操作バーの「文字サイズ」はこの窓だけこれを変える
  ttl: 8,            // 言葉が消えるまでの秒数（固定。組版は cLife で決める）
  maxWords: 24,      // 同時に出す言葉の上限（固定。レイアウトごとの上限 MAXW もある）
  vertical: true,    // 縦組みを混ぜる（古い設定。いまは cVert。false なら縦組みなし）
  // レイアウトごとの設定（3段階）
  cSize: 'm',        // 組版：文字の大きさ（LAYOUT_SIZES）
  kSize: 'm',        // カンペ：文字の大きさ
  mSize: 'm',        // モーション：文字の大きさ
  cGrow: 1,          // 組版：育つまでのくり返し回数（GROW_STEPS）
  kGrow: 1,          // カンペ：育つまでのくり返し回数
  cJump: 'mid',      // 組版：大小の差（JUMP_STEPS）
  cVert: 'mid',      // 組版：縦組みの量（VERT_STEPS）
  cOverlap: 'off',   // 組版：文字の重なり（OVERLAP_STEPS。on なら言葉の上に言葉を重ねてよい）
  cLife: 8,          // 組版：残る時間（秒。LIFE_STEPS）
  mTaste: 'mix',     // モーション：テイスト（MOTION_TASTES）
  mHud: 'on',        // モーション：四隅の計器（MOTION_HUD）
  mSound: 'voice',   // モーション：音に反応（MOTION_SOUND）
  // 字幕ライン（画面の最下部に、聞き取った文を出す）
  caption: true,     // 字幕ラインを出す
  capSize: 'm',      // 文字サイズ（CAP_SIZES）
  capTtl: 5,         // 表示時間：話し終えてから消えるまでの秒数（CAP_TTLS）
  capLines: 1,       // 同時に出す行（CAP_LINES）
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
  fusionFreq: 'mid',       // 自動で混ぜる頻度（rare / mid / often。FUSION_FREQS）
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

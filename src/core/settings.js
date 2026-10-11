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

export const DEFAULT_THEME = 'yoru';

// アクセントカラーの候補（空＝書体テーマ標準の色）。お手軽プラン以上の機能で、無料プランは1日お試し
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
  led: { label: 'LED', labelEn: 'LED', note: '丸い電球のドット。アクセント色で光る', noteEn: 'Round bulb dots glowing in the accent color' },
  neon: { label: 'ネオン', labelEn: 'Neon', note: '色が移ろうネオン管のドット', noteEn: 'Neon-tube dots with drifting colors' },
  pixel: { label: 'ピクセル', labelEn: 'Pixel', note: '角ドットのレトロゲーム風', noteEn: 'Square pixels, retro game style' },
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

export const DEFAULTS = {
  theme: 'yoru',
  layout: 'compose',
  baseSize: 40,      // 720p換算のpx。表示ビューの高さに比例して拡縮する
  ttl: 8,            // 秒
  maxWords: 24,
  vertical: true,    // 縦組みを混ぜる（組版レイアウト）
  caption: true,     // 最新の発話を字幕ラインで出す
  reduceMotion: false,
  accent: '',        // アクセントカラー（空＝書体テーマ標準）
  vjStyle: 'led',    // VJ モードの見た目
  speakerMode: 'off', // 話者の色分け：off / manual（手動で切り替え）/ auto（声の高さで推定）
  speakerCount: 2,
  speakers: DEFAULT_SPEAKERS,
  bgImage: '',       // 背景画像（data URL。長辺1000px以下に縮小済み）
  bgDim: 0.4,        // 背景画像の上に重ねる地色の濃さ（文字を読みやすくする）
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

// 書体テーマと既定値。Google Fonts（無料）を使い、読めない環境では OS の和文書体へ自動で切り替える。
const GOTHIC = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","YuGothic","Noto Sans CJK JP","Noto Sans JP",sans-serif';
const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif CJK JP","Noto Serif JP",serif';

export const THEMES = {
  sumi: {
    label: '墨', note: '明朝・紙と朱',
    family: '"Shippori Mincho B1"', fallback: MINCHO, gf: 'Shippori+Mincho+B1:wght@500;800',
    strong: 800, light: 500,
    bg: '#f2ede3', ink: '#1c1a16', sub: '#8b8477', accent: '#c7381f', accent2: '#2c5a87', stroke: 'transparent',
  },
  yoru: {
    label: '夜', note: 'ゴシック・黒地',
    family: '"Zen Kaku Gothic New"', fallback: GOTHIC, gf: 'Zen+Kaku+Gothic+New:wght@500;900',
    strong: 900, light: 500,
    bg: '#0d0e12', ink: '#f3f1ea', sub: '#7c808b', accent: '#ffd23f', accent2: '#62d0ff', stroke: 'transparent',
  },
  pop: {
    label: 'ポップ', note: '極太・雑談向け',
    family: '"Dela Gothic One"', fallback: GOTHIC, gf: 'Dela+Gothic+One',
    strong: 900, light: 400, // Dela は400のみ。font-synthesis:none で擬似ボールドを防ぎ、代替書体だけ太くする
    bg: '#17131f', ink: '#fff6ec', sub: '#988cb0', accent: '#ff4f8b', accent2: '#3ee6c5', stroke: 'transparent',
  },
  yawaraka: {
    label: 'やわらか', note: '丸ゴシック',
    family: '"Zen Maru Gothic"', fallback: GOTHIC, gf: 'Zen+Maru+Gothic:wght@500;900',
    strong: 900, light: 500,
    bg: '#faf5ee', ink: '#3a332e', sub: '#a59b92', accent: '#e46f55', accent2: '#4f9585', stroke: 'transparent',
  },
  clear: {
    label: '透過', note: 'OBSオーバーレイ',
    family: '"Zen Kaku Gothic New"', fallback: GOTHIC, gf: 'Zen+Kaku+Gothic+New:wght@500;900',
    strong: 900, light: 500,
    bg: 'transparent', ink: '#ffffff', sub: 'rgba(255,255,255,.78)', accent: '#ffe14d', accent2: '#7fe3ff', stroke: 'rgba(0,0,0,.82)',
  },
  // ---- Plus 書体（Free は1日お試し） ----
  fude: {
    label: '筆', note: '墨書き・和紙', pro: true,
    family: '"Yuji Boku"', fallback: MINCHO, gf: 'Yuji+Boku',
    strong: 900, light: 400, // 1ウェイトのみ。擬似ボールドは作らない
    bg: '#eee7d8', ink: '#1a1612', sub: '#8e8576', accent: '#bf2a1c', accent2: '#2b4c70', stroke: 'transparent',
  },
  dot: {
    label: 'ドット', note: 'レトロゲーム画面', pro: true,
    family: '"DotGothic16"', fallback: GOTHIC, gf: 'DotGothic16',
    strong: 900, light: 400,
    bg: '#06120b', ink: '#b6ffcc', sub: '#3d7a53', accent: '#ffe45c', accent2: '#ff6bd6', stroke: 'transparent',
  },
};

export const DEFAULT_THEME = 'yoru';

// アクセントカラーの候補（空＝書体テーマ標準の色）。Plus の機能で、Free は1日お試し
export const ACCENTS = [
  { c: '#ffd23f', label: '黄' },
  { c: '#ff8a3d', label: '橙' },
  { c: '#e0352b', label: '朱' },
  { c: '#ff4f8b', label: '桃' },
  { c: '#a78bfa', label: '紫' },
  { c: '#4f7cff', label: '青' },
  { c: '#4cc9f0', label: '水' },
  { c: '#3ddc84', label: '緑' },
  { c: '#ffffff', label: '白' },
];

export const LAYOUTS = {
  compose: { label: '組版', note: '画面いっぱいに文字を組む' },
  kanpe: { label: 'カンペ', note: '下から積み上がる大きな文字' },
  ticker: { label: 'テロップ', note: '下部を横に流れる' },
};

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

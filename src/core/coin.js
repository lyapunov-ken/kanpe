// 新語ミックス：画面に出ている2つの言葉を掛け合わせて、新しい言葉（造語）を作る。ブレスト用の遊び。
// 依存ゼロ。文字種ごとに混ぜ方を変える。
//  - 漢字どうし：前の語の頭 ＋ 後の語のお尻（新規顧客 × 解約率 → 新規約率）
//  - カタカナどうし：拍の切れ目で前半と後半をつなぐ（サブスク × オンボーディング → サブディング）
//  - 英語どうし：母音のあたりで切ってつなぐ（Typography × Browser → Typowser）
//  - 文字種が違う：短ければそのまま連結（紹介 × サブスク → 紹介サブスク）、長ければ半分ずつ
import { runs } from './extract.js?v=202610151119';

const SMALL = /^[ァィゥェォャュョッヮヵヶーぁぃぅぇぉゃゅょっゎ]/;
const VOWEL = /[aeiouy]/i;

function kindOf(text) {
  const s = new Set(runs(text).map((r) => r.s));
  if (s.size === 1) return [...s][0]; // k / ka / h / l / n / p
  return 'mix';
}

// 拍（モーラ）の切れ目で切れる位置の一覧（小さい字・長音の前では切らない）
function cuts(chars) {
  const out = [];
  for (let i = 1; i < chars.length; i++) if (!SMALL.test(chars[i])) out.push(i);
  return out;
}
const near = (list, target) => list.reduce((b, x) => (Math.abs(x - target) < Math.abs(b - target) ? x : b), list[0]);

function blendKana(a, b) {
  const A = [...a], B = [...b];
  const ca = cuts(A), cb = cuts(B);
  if (!ca.length || !cb.length) return '';
  const ia = near(ca, Math.ceil(A.length / 2));
  const ib = near(cb, Math.floor(B.length / 2));
  return A.slice(0, ia).join('') + B.slice(ib).join('');
}
function blendKanji(a, b) {
  const A = [...a], B = [...b];
  const ia = Math.max(1, Math.ceil(A.length / 2));
  const ib = Math.min(B.length - 1, Math.floor(B.length / 2));
  return A.slice(0, ia).join('') + B.slice(Math.max(0, ib)).join('');
}
function blendLatin(a, b) {
  const lim = Math.max(2, Math.ceil(a.length * 0.6));
  let ia = -1;
  for (let i = 1; i < lim; i++) if (VOWEL.test(a[i])) ia = i + 1;
  if (ia < 2) ia = Math.ceil(a.length / 2);
  let ib = -1;
  for (let i = Math.floor(b.length * 0.3); i < b.length - 1; i++) if (VOWEL.test(b[i])) { ib = i; break; }
  if (ib < 1) ib = Math.floor(b.length / 2);
  if (VOWEL.test(a[ia - 1]) && VOWEL.test(b[ib])) ib++; // 母音が重なるときは1つにする
  return a.slice(0, ia) + b.slice(ib).toLowerCase();
}
function halves(a, b) {
  const A = [...a], B = [...b];
  return A.slice(0, Math.ceil(A.length / 2)).join('') + B.slice(Math.floor(B.length / 2)).join('');
}

// 1組から作れる候補（混ぜ方つき）
function candidates(a, b) {
  const ka = kindOf(a), kb = kindOf(b);
  const la = [...a].length, lb = [...b].length;
  const out = [];
  const push = (text, how) => { if (text && text !== a && text !== b) out.push({ text, how }); };
  if (ka === 'k' && kb === 'k') { push(blendKanji(a, b), 'blend'); if (la + lb <= 5) push(a + b, 'join'); }
  else if (ka === 'ka' && kb === 'ka') { push(blendKana(a, b), 'blend'); }
  else if (ka === 'l' && kb === 'l') { push(blendLatin(a, b), 'blend'); }
  else {
    if (la + lb <= 7) push(a + b, 'join');
    else push(halves(a, b), 'blend');
  }
  return out;
}

const okLen = (t) => { const n = [...t].length; return n >= 2 && n <= 9; };

// pool：最近画面に出た言葉（新しい順）。recent：これまでに作った新語（同じものを避ける）
// 返り値：{ text, a, b, how } か null
export function coinWord(pool, recent = [], rnd = Math.random) {
  const words = [...new Set(pool.map((w) => String(w).trim()))].filter((w) => {
    const k = kindOf(w);
    return w && k !== 'n' && k !== 'p' && k !== 'h' && !/\d/.test(w) && [...w].length >= 2 && [...w].length <= 10;
  }).slice(0, 10);
  if (words.length < 2) return null;
  const seen = new Set(recent);
  const pairs = [];
  for (let i = 0; i < words.length; i++) for (let j = 0; j < words.length; j++) {
    if (i === j) continue;
    const a = words[i], b = words[j];
    if (a.includes(b) || b.includes(a)) continue;
    pairs.push([a, b, i + j]); // 新しい語どうしほど選ばれやすく
  }
  pairs.sort((x, y) => x[2] - y[2] + (rnd() - 0.5) * 6);
  for (const [a, b] of pairs) {
    const c = candidates(a, b).filter((x) => okLen(x.text) && !seen.has(x.text));
    if (c.length) { const pick = c[Math.floor(rnd() * c.length)]; return { ...pick, a, b }; }
  }
  return null;
}

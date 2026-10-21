// キーワード抽出（速い層）— 辞書ダウンロードなし。Intl.Segmenter + 文字種ルール。
// 依存ゼロ・ブラウザ内で完結。数ミリ秒で処理できる軽さを優先する。

const SEG = {};
function segmenter(lang) {
  const k = lang && lang.startsWith('en') ? 'en' : 'ja';
  return SEG[k] || (SEG[k] = new Intl.Segmenter(k, { granularity: 'word' }));
}

// ---- 文字種 -------------------------------------------------------------
// k: 漢字 / ka: カタカナ / h: ひらがな / l: 英字 / n: 数字 / p: 記号・約物
export function charScript(ch) {
  const c = ch.codePointAt(0);
  if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || c === 0x3005 || c === 0x3006 ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0x20000 && c <= 0x2ffff)) return 'k';
  if (c === 0x30fb) return 'p'; // ・
  if ((c >= 0x30a1 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) return 'ka';
  if (c >= 0x3041 && c <= 0x309f) return 'h';
  if (c >= 0x30 && c <= 0x39) return 'n';
  if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) return 'l';
  return 'p';
}

// 同じ文字種の連続（ラン）に分ける。長音「ー」は直前の文字種に従う。
export function runs(text) {
  const out = [];
  let prev = 'p';
  for (const ch of text) {
    let s = charScript(ch);
    if (ch === 'ー') s = prev === 'h' ? 'h' : 'ka';
    if (s === 'n' && prev === 'l') s = 'l'; // "Web3" などは英字ランに含める
    const last = out[out.length - 1];
    if (last && last.s === s) last.t += ch; else out.push({ s, t: ch });
    prev = s;
  }
  return out;
}

const NOUNISH = new Set(['k', 'ka', 'l', 'n']);
function scriptsOf(t) { const set = new Set(); for (const r of runs(t)) set.add(r.s); return set; }

// ---- 辞書（数KB） ---------------------------------------------------------
const STOP_JA = new Set(('自分 今日 今回 本当 普通 大丈夫 全然 結構 一番 多分 最近 一応 皆さん 感じ 場合 部分 以上 以下 ' +
  '前 後 中 上 下 方 人 時 事 物 今 何 私 僕 俺 我々 彼 彼女 他 的 系 次 最初 最後 全部 一緒 意味 気 話 感 形 辺 頃 ' +
  '時点 状態 関係 可能 必要 大事 色々 一つ 二つ 一回 ちょっと 毎回 今後 以前 自体 個人 本日 今度 実際 ' +
  'オッケー オーケー ナンカ ハイ ミナサン OK ok Ok').split(' '));
const STOP_EN = new Set(('the a an and or but so to of in on at for with from by as is are was were be been being am ' +
  'it its this that these those there here then than i you he she we they me him her us them my your our their ' +
  'do does did done have has had will would can could should may might must not no yes just very really ' +
  'about into over also like okay ok yeah well um uh what which who when where why how all any some more most ' +
  'one two get got going gonna want know think thing things kind lot little bit much many way stuff today now').split(' '));

// フィラー（えー、えっと…）。キャプション用。キーワード側はひらがなのみの語を拾わないので自然に除外される。
const FILLER_JA = /(?:えー+っ?と|えっと|ええと|えーと|えー+|あー+|あの[ーぉお〜~]+|その[ー〜~]+|うー+ん|うーん|んー+|まぁ|まあ(?=[、,。\s]|$)|なんか(?=[、,\s]))[、,]?\s*/g;
const FILLER_EN = /\b(?:um+|uh+|erm|uhm|hmm+)\b,?\s*/gi;

export function cleanCaption(text) {
  let t = (text || '').normalize('NFKC');
  t = t.replace(FILLER_JA, '').replace(FILLER_EN, '');
  t = t.replace(/^え[、\s]+/, '');
  t = t.replace(/([^\x00-\x7f])\s+(?=[^\x00-\x7f])/g, '$1'); // 和文中の余計な空白
  t = t.replace(/^[、,。\s]+/, '').replace(/\s{2,}/g, ' ');
  return t.trim();
}

export function parseList(s) {
  return (s || '').split(/[,、\n]/).map(x => x.trim().normalize('NFKC')).filter(Boolean);
}

export function maskNg(text, ngList) {
  let t = text;
  for (const w of ngList || []) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, '●'.repeat([...w].length));
  }
  return t;
}

// ---- 候補抽出 ------------------------------------------------------------
function classify(t) {
  if (/^\s+$/.test(t)) return 'space';
  if (t === '・' || t === '.' || t === '-' || t === '&') return 'conn';
  const sc = scriptsOf(t);
  let noun = true, hasNoun = false;
  for (const s of sc) { if (NOUNISH.has(s)) hasNoun = true; else noun = false; }
  if (noun && hasNoun) return 'noun';
  if (hasNoun && sc.has('h')) return 'mixed';
  return 'other';
}
const isLatinWord = t => /^[A-Za-z][A-Za-z0-9.\-]*$/.test(t);
const isCap = t => /^[A-Z0-9]/.test(t);

function candidatesJa(text) {
  const segs = [...segmenter('ja').segment(text)].map(s => s.segment);
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (let i = 0; i < segs.length; i++) {
    const t = segs[i];
    const cls = classify(t);
    if (cls === 'noun') {
      // 「前年比」+「120」のように語の後ろに数字が来たら別の語にする
      if (cur !== null && /^\d/.test(t) && !/[\dA-Za-z]$/.test(cur)) flush();
      cur = cur === null ? t : cur + t;
    } else if ((t === '%' || t === '％') && cur && /\d$/.test(cur)) {
      cur += '%';
    } else if (cls === 'conn' && cur && i + 1 < segs.length && classify(segs[i + 1]) === 'noun') {
      cur += t;
    } else if (cls === 'space' && cur && i + 1 < segs.length) {
      // "Web Speech API" のように大文字始まりの英単語同士は空白でつなぐ
      const lastWord = cur.split(' ').pop();
      const next = segs[i + 1];
      if (isLatinWord(lastWord) && isLatinWord(next) && isCap(lastWord) && isCap(next)) cur += ' ';
      else flush();
    } else if (cls === 'mixed') {
      const m = t.match(/^[一-鿿㐀-䶿々ァ-ヿー]+/);
      if (m && [...m[0]].length >= 2) { cur = cur === null ? m[0] : cur + m[0]; }
      flush();
    } else {
      flush();
    }
  }
  flush();
  return out;
}

function candidatesEn(text) {
  const segs = [...segmenter('en').segment(text)];
  const out = [];
  let cur = null, curCap = false;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.isWordLike) {
      const w = s.segment;
      const cap = /^[A-Z]/.test(w);
      if (cur && cap && curCap && segs[i - 1] && segs[i - 1].segment === ' ') { cur += ' ' + w; continue; }
      if (cur) out.push(cur);
      cur = w; curCap = cap;
    } else if (s.segment !== ' ') {
      if (cur) out.push(cur); cur = null; curCap = false;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function valid(w, lang) {
  const len = [...w].length;
  if (len < 2 || len > 18) return false;
  if (/^\d$/.test(w)) return false;
  if (lang.startsWith('en')) {
    const lw = w.toLowerCase();
    if (STOP_EN.has(lw)) return false;
    return len >= 3 || /^[A-Z0-9]{2,}$/.test(w);
  }
  if (STOP_JA.has(w)) return false;
  if (/^[A-Za-z]+$/.test(w) && STOP_EN.has(w.toLowerCase())) return false;
  // 先頭・末尾の数字だけ、ひらがな混じりは弾く
  const sc = scriptsOf(w);
  if (sc.has('h')) return false;
  return true;
}

// 目立たせる価値がある語か（「新出」演出の候補）
function salient(w) {
  const len = [...w].length;
  const sc = scriptsOf(w);
  if ((sc.has('ka') || sc.has('l')) && len >= 3) return true;
  return len >= 4;
}

export class Extractor {
  constructor(opts = {}) {
    this.lang = opts.lang || 'ja-JP';
    this.seen = new Map();
    this.utt = new Map();
    this.lastNewAt = -1e9;
    this.newGapMs = 5000; // アクセントは希少に：新出演出は最短でこの間隔
    this.setDict(opts);
  }
  setLang(lang) { this.lang = lang; }
  setDict({ registered = '', ng = '' } = {}) {
    this.reg = parseList(registered);
    this.ng = parseList(ng);
  }
  reset() { this.seen.clear(); this.utt.clear(); this.lastNewAt = -1e9; }

  // 発話テキスト → キーワード配列（重複なし、出現順）
  extract(text) {
    const t = cleanCaption(text);
    const lower = t.toLowerCase();
    const found = [];
    const regHits = this.reg.filter(r => lower.includes(r.toLowerCase()));
    const cands = this.lang.startsWith('en') ? candidatesEn(t) : candidatesJa(t);
    for (const raw of cands) {
      const w = raw.trim();
      if (!valid(w, this.lang)) continue;
      if (regHits.some(r => r.includes(w) || w.includes(r))) continue;
      found.push(w);
    }
    const all = [...regHits, ...found];
    const ngl = this.ng.map(n => n.toLowerCase());
    const uniq = [];
    for (const w of all) {
      const lw = w.toLowerCase();
      if (ngl.some(n => lw.includes(n))) continue;
      if (!uniq.some(u => u.toLowerCase() === lw)) uniq.push(w);
    }
    return uniq;
  }

  _emit(w) {
    const key = w.toLowerCase();
    const count = (this.seen.get(key) || 0) + 1;
    this.seen.set(key, count);
    let kind = 'normal';
    if (this.reg.some(r => r.toLowerCase() === key)) kind = 'registered';
    else if (/^\d/.test(w)) kind = 'number';
    else if (count === 1 && salient(w)) {
      const now = performance.now();
      if (now - this.lastNewAt > this.newGapMs) { kind = 'new'; this.lastNewAt = now; }
    }
    return { text: w, kind, count };
  }

  // 途中結果：2回続けて現れた語だけを出す（ちらつき防止）
  interim(id, text) {
    const st = this.utt.get(id) || { prev: new Set(), emitted: new Set() };
    this.utt.set(id, st);
    if (this.utt.size > 50) this.utt.delete(this.utt.keys().next().value); // 確定が来なかった文はためこまない
    const cur = new Set(this.extract(text));
    const out = [];
    for (const w of cur) {
      if (st.prev.has(w) && !st.emitted.has(w)) { st.emitted.add(w); out.push(this._emit(w)); }
    }
    st.prev = cur;
    return out;
  }

  final(id, text) {
    const st = this.utt.get(id) || { prev: new Set(), emitted: new Set() };
    this.utt.delete(id);
    const out = [];
    for (const w of this.extract(text)) {
      if (!st.emitted.has(w)) out.push(this._emit(w));
    }
    return out;
  }
}

// 表示言語（日本語 / 英語）。ページの <html lang> か、表示ビューでは URL の hl=en で決まる。
const hl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hl') : null;
const docLang = typeof document !== 'undefined' ? (document.documentElement.lang || 'ja') : 'ja';
export const EN = hl ? hl === 'en' : docLang.toLowerCase().startsWith('en');
export const LANG = EN ? 'en' : 'ja';
// L('日本語', 'English')：その場で言語を選ぶ
export const L = (ja, en) => (EN ? en : ja);
// 設定の定義（label / note）から、言語に合う方を取り出す
export const tr = (def, key = 'label') => (def ? ((EN && def[key + 'En']) || def[key]) : '');

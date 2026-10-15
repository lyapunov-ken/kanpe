// 色のコントラストを背景に合わせて整える（新語ミックスの色に使う）。依存ゼロ。
// 明るい背景（墨・やわらかなど）では濃く、暗い背景（夜・ポップ・VJ）では明るくして、色味は保ったまま読みやすくする。

export function parseColor(c) {
  const s = String(c || '').trim();
  let m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  m = /^hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i.exec(s);
  if (m) return hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
  return null;
}
export const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
// 相対輝度（WCAG）
export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const isLight = (bg) => { const rgb = parseColor(bg); return !!rgb && luminance(rgb) > 0.45; };

// 背景 bg に対してコントラスト min 以上になるまで、明るさだけを動かす。bg が無い（透過）ときは暗い映像の上と考える
export function tuneColor(color, bg, min = 4.5) {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const back = parseColor(bg) || [0, 0, 0];
  if (contrast(rgb, back) >= min) return toHex(rgb);
  const [h, s] = rgbToHsl(rgb);
  let l = rgbToHsl(rgb)[2];
  const dir = luminance(back) > 0.45 ? -1 : 1; // 明るい背景なら暗く、暗い背景なら明るく
  let best = rgb;
  for (let i = 0; i < 40; i++) {
    l = Math.max(0, Math.min(1, l + dir * 0.02));
    best = hslToRgb(h, Math.min(1, s * (dir < 0 ? 1 : 0.96)), l);
    if (contrast(best, back) >= min || l <= 0 || l >= 1) break;
  }
  return toHex(best);
}
// 虹の1字ぶん：背景が明るければ濃いめ、暗ければ明るめの鮮やかな色
export function rainbowColor(hue, bg, min = 4.5) {
  const light = isLight(bg);
  return tuneColor(toHex(hslToRgb(hue % 360, light ? 0.78 : 0.85, light ? 0.42 : 0.64)), bg, min);
}

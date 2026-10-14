const gamma = (c: number) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
const ungamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hsvToRgb(h: number, s: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 1 - s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

export function hsToXy(hue: number, saturation: number): { x: number; y: number } {
  const [r, g, b] = hsvToRgb(hue, saturation / 100).map(gamma);
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const sum = X + Y + Z || 1;
  return { x: X / sum, y: Y / sum };
}

export function xyToHs(x: number, y: number): { hue: number; saturation: number } {
  if (y <= 0) return { hue: 0, saturation: 0 };
  const X = x / y;
  const Z = (1 - x - y) / y;
  let rgb = [
    X * 3.2406 - 1.5372 - Z * 0.4986,
    -X * 0.9689 + 1.8758 + Z * 0.0415,
    X * 0.0557 - 0.204 + Z * 1.057,
  ].map((c) => Math.max(0, c));
  const peak = Math.max(...rgb) || 1;
  rgb = rgb.map((c) => ungamma(c / peak));
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  return { hue: Math.round((hue + 360) % 360), saturation: Math.round(max === 0 ? 0 : (d / max) * 100) };
}

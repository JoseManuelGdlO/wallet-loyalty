import sharp from "sharp";

export type Glyph = "coffee" | "star" | "heart" | "dot";

export function glyphFor(icon: string): Glyph {
  if (icon.includes("☕") || icon.toLowerCase() === "cafe") return "coffee";
  if (icon.includes("★") || icon.includes("⭐")) return "star";
  if (icon.includes("♥") || icon.includes("❤")) return "heart";
  return "dot";
}

export async function renderStrip(input: {
  current: number;
  required: number;
  background: string;
  accent: string;
  icon: string;
}) {
  const svg = stripSvg({ ...input, glyph: glyphFor(input.icon) }, 1125, 369);
  const strip3x = await sharp(Buffer.from(svg)).png().toBuffer();
  const strip2x = await sharp(strip3x).resize(750, 246).png().toBuffer();
  const strip = await sharp(strip3x).resize(375, 123).png().toBuffer();
  return { strip, strip2x, strip3x };
}

export async function renderIcons(accent: string) {
  const make = (size: number) =>
    sharp(Buffer.from(iconSvg(size, accent))).png().toBuffer();
  const [icon3x, icon2x, icon] = await Promise.all([make(87), make(58), make(29)]);
  return { icon, icon2x, icon3x };
}

export async function renderLogos(name: string, foreground: string, background: string, source?: Buffer) {
  if (source) {
    const logo3x = await sharp(source).resize(480, 150, { fit: "contain", background }).png().toBuffer();
    const logo2x = await sharp(logo3x).resize(320, 100).png().toBuffer();
    const logo = await sharp(logo3x).resize(160, 50).png().toBuffer();
    return { logo, logo2x, logo3x };
  }
  const paint = async (width: number, height: number) =>
    sharp(Buffer.from(logoSvg(name, foreground, background, width, height))).png().toBuffer();
  const [logo3x, logo2x, logo] = await Promise.all([paint(480, 150), paint(320, 100), paint(160, 50)]);
  return { logo, logo2x, logo3x };
}

function stripSvg(
  input: { current: number; required: number; background: string; accent: string; glyph: Glyph },
  width: number,
  height: number,
) {
  const cols = Math.min(5, Math.max(1, input.required));
  const rows = Math.ceil(input.required / cols);
  const gap = width * 0.04;
  const cell = Math.min((width - gap * 2) / cols, (height - gap * 2) / rows);
  const radius = cell * 0.34;
  const originX = (width - cols * cell) / 2 + cell / 2;
  const originY = (height - rows * cell) / 2 + cell / 2;
  const marks: string[] = [];
  for (let index = 0; index < input.required; index += 1) {
    const cx = originX + (index % cols) * cell;
    const cy = originY + Math.floor(index / cols) * cell;
    if (index < input.current) {
      marks.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${input.accent}"/>${mark(input.glyph, cx, cy, radius)}`);
    } else {
      marks.push(
        `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${input.accent}" stroke-width="${Math.max(3, radius * 0.1)}" stroke-dasharray="${radius * 0.35} ${radius * 0.22}" opacity="0.75"/>`,
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${escapeXml(input.background)}"/>${marks.join("")}</svg>`;
}

function mark(glyph: Glyph, cx: number, cy: number, radius: number) {
  const size = radius * 0.7;
  if (glyph === "coffee") {
    return `<g transform="translate(${cx - size} ${cy - size * 0.75})" fill="none" stroke="#F7FAFB" stroke-width="${Math.max(2, size * 0.16)}" stroke-linecap="round"><path d="M1 ${size * 0.35}h${size * 1.15}v${size * 0.62}a${size * 0.58} ${size * 0.58} 0 0 1-${size * 1.15} 0z"/><path d="M${size * 1.2} ${size * 0.5}h${size * 0.32}a${size * 0.25} ${size * 0.25} 0 0 1 0 ${size * 0.48}h-${size * 0.32}"/></g>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${size * 0.34}" fill="#F7FAFB"/>`;
}

function iconSvg(size: number, accent: string) {
  const center = size / 2;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${center}" cy="${center}" r="${size * 0.46}" fill="none" stroke="${escapeXml(accent)}" stroke-width="${Math.max(1, size * 0.06)}" stroke-dasharray="${size * 0.12} ${size * 0.08}"/><circle cx="${center}" cy="${center}" r="${size * 0.16}" fill="${escapeXml(accent)}"/></svg>`;
}

function logoSvg(name: string, foreground: string, background: string, width: number, height: number) {
  const text = escapeXml(name).slice(0, 18);
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${escapeXml(background)}"/><text x="12" y="${height * 0.68}" font-family="sans-serif" font-size="${height * 0.42}" fill="${escapeXml(foreground)}">${text}</text></svg>`;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
    return map[char];
  });
}

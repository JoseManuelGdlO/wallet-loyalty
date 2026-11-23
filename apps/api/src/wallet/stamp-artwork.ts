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
    sharp(Buffer.from(logoMarkSvg(foreground, background, width, height))).png().toBuffer();
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
  const padX = width * 0.05;
  const padY = height * 0.06;
  const cell = Math.min((width - padX * 2) / cols, (height - padY * 2) / rows);
  const radius = cell * 0.36;
  const blockHeight = rows * cell;
  const originY = (height - blockHeight) / 2 + cell / 2;
  const ink = "#F7FAFB";
  const marks: string[] = [];
  for (let index = 0; index < input.required; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const countInRow = Math.min(cols, input.required - row * cols);
    const originX = (width - countInRow * cell) / 2 + cell / 2;
    const cx = originX + col * cell;
    const cy = originY + row * cell;
    if (index < input.current) {
      marks.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${input.accent}"/>${mark(input.glyph, cx, cy, radius, ink)}`);
    } else {
      marks.push(
        `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${input.accent}" stroke-width="${Math.max(4, radius * 0.08)}"/>${mark(input.glyph, cx, cy, radius, input.accent)}`,
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${escapeXml(input.background)}"/>${marks.join("")}</svg>`;
}

function mark(glyph: Glyph, cx: number, cy: number, radius: number, color: string) {
  const size = radius * 0.62;
  if (glyph === "coffee") {
    return `<g transform="translate(${cx - size} ${cy - size * 0.72})" fill="none" stroke="${color}" stroke-width="${Math.max(2, size * 0.16)}" stroke-linecap="round"><path d="M1 ${size * 0.35}h${size * 1.15}v${size * 0.62}a${size * 0.58} ${size * 0.58} 0 0 1-${size * 1.15} 0z"/><path d="M${size * 1.2} ${size * 0.5}h${size * 0.32}a${size * 0.25} ${size * 0.25} 0 0 1 0 ${size * 0.48}h-${size * 0.32}"/></g>`;
  }
  if (glyph === "star") return `<polygon points="${starPoints(cx, cy, size)}" fill="${color}"/>`;
  if (glyph === "heart") {
    return `<path fill="${color}" transform="translate(${cx} ${cy}) scale(${size / 12})" d="M0 4c0-3 2.4-5 4.6-5 1.5 0 2.6.7 3.4 1.8C8.8-.3 9.9-1 11.4-1 13.6-1 16 1 16 4c0 5.2-6.2 8.6-8 10.2C6.2 12.6 0 9.2 0 4z"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${size * 0.38}" fill="${color}"/>`;
}

function starPoints(cx: number, cy: number, radius: number) {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * (Math.PI / 5);
    const length = index % 2 === 0 ? radius : radius * 0.42;
    points.push(`${(cx + Math.cos(angle) * length).toFixed(2)},${(cy + Math.sin(angle) * length).toFixed(2)}`);
  }
  return points.join(" ");
}

function iconSvg(size: number, accent: string) {
  const center = size / 2;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${center}" cy="${center}" r="${size * 0.46}" fill="none" stroke="${escapeXml(accent)}" stroke-width="${Math.max(1, size * 0.06)}" stroke-dasharray="${size * 0.12} ${size * 0.08}"/><circle cx="${center}" cy="${center}" r="${size * 0.16}" fill="${escapeXml(accent)}"/></svg>`;
}

function logoMarkSvg(foreground: string, background: string, width: number, height: number) {
  const radius = height * 0.28;
  const cx = radius + width * 0.04;
  const cy = height / 2;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${escapeXml(background)}"/><circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${escapeXml(foreground)}" stroke-width="${Math.max(2, radius * 0.12)}" stroke-dasharray="${radius * 0.45} ${radius * 0.28}"/><circle cx="${cx}" cy="${cy}" r="${radius * 0.38}" fill="${escapeXml(foreground)}"/></svg>`;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
    return map[char];
  });
}

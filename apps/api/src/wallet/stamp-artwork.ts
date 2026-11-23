import sharp from "sharp";

export type Glyph = "coffee" | "star" | "heart" | "smile" | "gift" | "sparkle" | "tooth" | "paw" | "check";

export function glyphFor(icon: string): Glyph {
  if (icon.includes("☕") || icon.toLowerCase() === "cafe") return "coffee";
  if (icon.includes("★") || icon.includes("⭐")) return "star";
  if (icon.includes("♥") || icon.includes("❤")) return "heart";
  if (icon.includes("😁") || icon.includes("😊") || icon.includes("🙂")) return "smile";
  if (icon.includes("🎁")) return "gift";
  if (icon.includes("✨")) return "sparkle";
  if (icon.includes("🦷")) return "tooth";
  if (icon.includes("🐾")) return "paw";
  if (icon.includes("✅") || icon.includes("✔")) return "check";
  return "star";
}

export async function renderStrip(input: {
  current: number;
  required: number;
  background: string;
  accent: string;
  icon: string;
  iconImage?: Buffer;
}) {
  const spots = stampSpots(input.current, input.required, 1125, 369);
  const svg = stripSvg({ ...input, glyph: glyphFor(input.icon), spots, drawGlyph: !input.iconImage }, 1125, 369);
  let strip3x = await sharp(Buffer.from(svg)).png().toBuffer();
  if (input.iconImage && spots.length) {
    const size = Math.max(24, Math.round(spots[0].radius * 1.45));
    const icon = await sharp(input.iconImage).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const faded = await withOpacity(icon, 0.42);
    strip3x = await sharp(strip3x)
      .composite(spots.map((spot) => ({
        input: spot.filled ? icon : faded,
        left: Math.round(spot.cx - size / 2),
        top: Math.round(spot.cy - size / 2),
      })))
      .png()
      .toBuffer();
  }
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

type StampSpot = { cx: number; cy: number; radius: number; filled: boolean };

function stampSpots(current: number, required: number, width: number, height: number): StampSpot[] {
  const count = Math.max(0, required);
  if (!count) return [];
  const cols = Math.min(5, count);
  const rows = Math.ceil(count / cols);
  const padX = width * 0.05;
  const padY = height * 0.06;
  const cell = Math.min((width - padX * 2) / cols, (height - padY * 2) / rows);
  const radius = cell * 0.38;
  const blockHeight = rows * cell;
  const originY = (height - blockHeight) / 2 + cell / 2;
  const spots: StampSpot[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const countInRow = Math.min(cols, count - row * cols);
    const originX = (width - countInRow * cell) / 2 + cell / 2;
    spots.push({
      cx: originX + col * cell,
      cy: originY + row * cell,
      radius,
      filled: index < current,
    });
  }
  return spots;
}

function stripSvg(
  input: { background: string; accent: string; glyph: Glyph; spots: StampSpot[]; drawGlyph: boolean },
  width: number,
  height: number,
) {
  const ink = "#F7FAFB";
  const marks = input.spots.map((spot) => {
    const ring = spot.filled
      ? `<circle cx="${spot.cx}" cy="${spot.cy}" r="${spot.radius}" fill="${input.accent}"/>`
      : `<circle cx="${spot.cx}" cy="${spot.cy}" r="${spot.radius}" fill="none" stroke="${input.accent}" stroke-width="${Math.max(4, spot.radius * 0.08)}"/>`;
    const glyph = input.drawGlyph ? mark(input.glyph, spot.cx, spot.cy, spot.radius, spot.filled ? ink : input.accent) : "";
    return ring + glyph;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${escapeXml(input.background)}"/>${marks.join("")}</svg>`;
}

async function withOpacity(png: Buffer, opacity: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += 4) data[index] = Math.round(data[index] * opacity);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

function mark(glyph: Glyph, cx: number, cy: number, radius: number, color: string) {
  const size = radius * 0.92;
  if (glyph === "coffee") {
    return `<g transform="translate(${cx - size * 0.55} ${cy - size * 0.42})" fill="none" stroke="${color}" stroke-width="${Math.max(3, size * 0.1)}" stroke-linecap="round"><path d="M2 ${size * 0.28}h${size * 0.72}v${size * 0.38}a${size * 0.36} ${size * 0.36} 0 0 1-${size * 0.72} 0z"/><path d="M${size * 0.76} ${size * 0.38}h${size * 0.2}a${size * 0.16} ${size * 0.16} 0 0 1 0 ${size * 0.28}h-${size * 0.2}"/></g>`;
  }
  if (glyph === "star" || glyph === "sparkle") return `<polygon points="${starPoints(cx, cy, glyph === "sparkle" ? size * 0.72 : size * 0.78)}" fill="${color}"/>`;
  if (glyph === "heart") {
    return `<path fill="${color}" transform="translate(${cx - size * 0.5} ${cy - size * 0.46}) scale(${size / 16})" d="M8 14.5C3.2 11.2 0 8.4 0 5.2 0 2.6 2 1 4.2 1c1.4 0 2.6.7 3.8 2.1C9.2 1.7 10.4 1 11.8 1 14 1 16 2.6 16 5.2c0 3.2-3.2 6-8 9.3z"/>`;
  }
  if (glyph === "smile") {
    return `<g fill="${color}" stroke="${color}" stroke-width="${Math.max(3, size * 0.08)}" stroke-linecap="round"><circle cx="${cx - size * 0.28}" cy="${cy - size * 0.12}" r="${size * 0.08}" stroke="none"/><circle cx="${cx + size * 0.28}" cy="${cy - size * 0.12}" r="${size * 0.08}" stroke="none"/><path fill="none" d="M${cx - size * 0.34} ${cy + size * 0.08} Q ${cx} ${cy + size * 0.42} ${cx + size * 0.34} ${cy + size * 0.08}"/></g>`;
  }
  if (glyph === "gift") {
    return `<g fill="none" stroke="${color}" stroke-width="${Math.max(3, size * 0.08)}" stroke-linejoin="round"><rect x="${cx - size * 0.42}" y="${cy - size * 0.08}" width="${size * 0.84}" height="${size * 0.52}" rx="${size * 0.06}"/><path d="M${cx - size * 0.42} ${cy + size * 0.12}h${size * 0.84}M${cx} ${cy - size * 0.08}v${size * 0.52}M${cx - size * 0.22} ${cy - size * 0.08}c0-${size * 0.22} ${size * 0.22}-${size * 0.28} ${size * 0.22}-${size * 0.08}M${cx + size * 0.22} ${cy - size * 0.08}c0-${size * 0.22}-${size * 0.22}-${size * 0.28}-${size * 0.22}-${size * 0.08}"/></g>`;
  }
  if (glyph === "tooth") {
    return `<path fill="${color}" transform="translate(${cx} ${cy + size * 0.04}) scale(${size / 22})" d="M-8 -9c0-4 16-4 16 0v7c0 3.2-1.6 8-3.4 8-1.6 0-2-3.2-4.6-3.2s-3 3.2-4.6 3.2c-1.8 0-3.4-4.8-3.4-8v-7z"/>`;
  }
  if (glyph === "paw") {
    const toe = size * 0.16;
    return `<g fill="${color}"><circle cx="${cx - size * 0.34}" cy="${cy - size * 0.28}" r="${toe}"/><circle cx="${cx - size * 0.12}" cy="${cy - size * 0.42}" r="${toe}"/><circle cx="${cx + size * 0.12}" cy="${cy - size * 0.42}" r="${toe}"/><circle cx="${cx + size * 0.34}" cy="${cy - size * 0.28}" r="${toe}"/><ellipse cx="${cx}" cy="${cy + size * 0.16}" rx="${size * 0.34}" ry="${size * 0.28}"/></g>`;
  }
  if (glyph === "check") {
    return `<path fill="none" stroke="${color}" stroke-width="${Math.max(4, size * 0.14)}" stroke-linecap="round" stroke-linejoin="round" d="M${cx - size * 0.38} ${cy} l${size * 0.28} ${size * 0.28} l${size * 0.5}-${size * 0.56}"/>`;
  }
  return `<polygon points="${starPoints(cx, cy, size * 0.78)}" fill="${color}"/>`;
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

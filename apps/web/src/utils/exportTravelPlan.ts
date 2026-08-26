import { CATEGORY_LABELS, PRICE_LEVEL_LABELS, TRANSPORT_MODE_LABELS } from '../constants/travel';
import type { TravelBlock, TravelConnection, TravelDay, TripFormData } from '../types/travel';

export interface ExportTravelPlanInput {
  trip: TripFormData;
  days: TravelDay[];
  connections: TravelConnection[];
}

interface PdfPageRenderState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  y: number;
}

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_MARGIN = 72;
const PDF_WIDTH = 595.28;
const PDF_HEIGHT = 841.89;

function line(value?: string): string {
  return value?.trim() || '-';
}

function sanitizeFilename(value: string): string {
  return (value || 'travel-plan').trim().replace(/[\\/:*?"<>|]/g, '-');
}

export function formatTravelPlanMarkdown({ trip, days, connections }: ExportTravelPlanInput): string {
  const title = trip.name || '여행 일정';
  const header = [
    `# ${title}`,
    '',
    `- 국가/도시: ${[trip.country, trip.city].filter(Boolean).join(' · ') || '-'}`,
    `- 기간: ${line(trip.duration)}`,
    `- 예산: ${line(trip.budget)}`,
    `- 인원: ${line(trip.travelers)}`,
    `- 스타일: ${line(trip.style)}`,
    trip.description ? `- 설명: ${trip.description}` : '',
  ].filter(Boolean);

  const daySections = days.map((day) => {
    const dayLines = [
      '',
      `## Day ${day.dayNumber}. ${day.title}`,
      day.region || day.city ? `- 지역: ${[day.city, day.region].filter(Boolean).join(' · ')}` : '',
      '',
      ...day.blocks.flatMap((block, index) => {
        const outgoingConnections = connections.filter((connection) => connection.dayId === day.id && connection.sourceBlockId === block.id);
        return [
          `${index + 1}. **${block.title}**`,
          `   - 카테고리: ${CATEGORY_LABELS[block.category]} / ${PRICE_LEVEL_LABELS[block.priceLevel]}`,
          block.time ? `   - 시간: ${block.time}` : '',
          block.location ? `   - 위치: ${block.location}` : '',
          block.estimatedCost ? `   - 예상 비용: ${block.estimatedCost}` : '',
          block.memo ? `   - 메모: ${block.memo}` : '',
          ...outgoingConnections.map((connection) => `   - 이동: ${TRANSPORT_MODE_LABELS[connection.transportMode ?? 'walk']}${connection.duration ? ` · ${connection.duration}` : ''}`),
        ].filter(Boolean);
      }),
    ].filter(Boolean);

    return dayLines.join('\n');
  });

  return [...header, ...daySections].join('\n');
}

export function formatShareText(input: ExportTravelPlanInput): string {
  const markdown = formatTravelPlanMarkdown(input);
  return markdown
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^\s+-\s/gm, '- ')
    .trim();
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function categoryEmoji(category: TravelBlock['category']): string {
  const emojis: Record<TravelBlock['category'], string> = {
    stay: '🏨',
    food: '🍽️',
    cafe: '☕',
    sightseeing: '📍',
    activity: '✨',
    transport: '🚇',
  };

  return emojis[category];
}

function priceEmoji(priceLevel: TravelBlock['priceLevel']): string {
  const emojis: Record<TravelBlock['priceLevel'], string> = {
    low: '₩',
    medium: '₩₩',
    high: '₩₩₩',
  };

  return emojis[priceLevel];
}

function createPage(): PdfPageRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('PDF 캔버스를 생성할 수 없습니다.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  ctx.textBaseline = 'top';

  return { canvas, ctx, y: PAGE_MARGIN };
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 400): void {
  ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#0f172a', weight = 400): void {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    let chunk = '';
    Array.from(word).forEach((char) => {
      const nextChunk = `${chunk}${char}`;
      if (ctx.measureText(nextChunk).width <= maxWidth) {
        chunk = nextChunk;
      } else {
        lines.push(chunk);
        chunk = char;
      }
    });
    currentLine = chunk;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, color = '#475569', weight = 400, lineHeight = size * 1.45): number {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((currentLine, index) => ctx.fillText(currentLine, x, y + index * lineHeight));
  return lines.length * lineHeight;
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function ensureSpace(pages: PdfPageRenderState[], state: PdfPageRenderState, height: number): PdfPageRenderState {
  if (state.y + height <= PAGE_HEIGHT - PAGE_MARGIN) {
    return state;
  }

  const nextPage = createPage();
  pages.push(nextPage);
  return nextPage;
}

function drawChip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, color: string): number {
  setFont(ctx, 22, 700);
  const width = Math.ceil(ctx.measureText(text).width) + 28;
  drawRoundRect(ctx, x, y, width, 38, 19, fill);
  drawText(ctx, text, x + 14, y + 8, 22, color, 700);
  return width;
}

function estimateBlockHeight(ctx: CanvasRenderingContext2D, block: TravelBlock, maxWidth: number): number {
  setFont(ctx, 28, 800);
  const titleLines = wrapText(ctx, `${categoryEmoji(block.category)} ${block.title}`, maxWidth).length;
  setFont(ctx, 22, 400);
  const memoLines = block.memo ? wrapText(ctx, block.memo, maxWidth).length : 0;
  return 70 + titleLines * 38 + memoLines * 32 + 46;
}

function drawHeader(state: PdfPageRenderState, input: ExportTravelPlanInput): void {
  const { ctx } = state;
  const { trip } = input;
  const title = trip.name || '여행 일정';

  drawText(ctx, 'Travel Blocks AI', PAGE_MARGIN, state.y, 22, '#2563eb', 900);
  state.y += 42;
  const titleHeight = drawWrappedText(ctx, `🧳 ${title}`, PAGE_MARGIN, state.y, PAGE_WIDTH - PAGE_MARGIN * 2, 48, '#0f172a', 900, 62);
  state.y += titleHeight + 18;

  if (trip.description) {
    state.y += drawWrappedText(ctx, trip.description, PAGE_MARGIN, state.y, PAGE_WIDTH - PAGE_MARGIN * 2, 24, '#475569', 400, 36) + 22;
  }

  const summaryItems = [
    ['여행지', [trip.country, trip.city].filter(Boolean).join(' · ') || '-'],
    ['기간', line(trip.duration)],
    ['예산', line(trip.budget)],
    ['인원/스타일', [trip.travelers, trip.style].filter(Boolean).join(' · ') || '-'],
  ];
  const gap = 16;
  const itemWidth = (PAGE_WIDTH - PAGE_MARGIN * 2 - gap * 3) / 4;

  summaryItems.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + index * (itemWidth + gap);
    drawRoundRect(ctx, x, state.y, itemWidth, 102, 16, '#f8fafc', '#e2e8f0');
    drawText(ctx, label, x + 18, state.y + 16, 18, '#64748b', 800);
    drawWrappedText(ctx, value, x + 18, state.y + 48, itemWidth - 36, 22, '#0f172a', 800, 28);
  });

  state.y += 128;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAGE_MARGIN, state.y);
  ctx.lineTo(PAGE_WIDTH - PAGE_MARGIN, state.y);
  ctx.stroke();
  state.y += 32;
}

function drawDaySection(pages: PdfPageRenderState[], state: PdfPageRenderState, day: TravelDay, connections: TravelConnection[]): PdfPageRenderState {
  let currentState = ensureSpace(pages, state, 150);
  const { ctx } = currentState;
  const sectionTop = currentState.y;

  drawRoundRect(ctx, PAGE_MARGIN, currentState.y, PAGE_WIDTH - PAGE_MARGIN * 2, 82, 18, '#ffffff', '#e2e8f0');
  drawRoundRect(ctx, PAGE_MARGIN + 18, currentState.y + 18, 108, 46, 23, '#dbeafe');
  drawText(ctx, `Day ${day.dayNumber}`, PAGE_MARGIN + 38, currentState.y + 30, 22, '#1d4ed8', 900);
  drawWrappedText(ctx, day.title, PAGE_MARGIN + 146, currentState.y + 15, PAGE_WIDTH - PAGE_MARGIN * 2 - 180, 30, '#0f172a', 900, 38);
  if (day.city || day.region) {
    drawText(ctx, `🗺️ ${[day.city, day.region].filter(Boolean).join(' · ')}`, PAGE_MARGIN + 146, currentState.y + 51, 20, '#64748b', 700);
  }
  currentState.y += 104;

  day.blocks.forEach((block, index) => {
    const maxTextWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - 110;
    const blockHeight = Math.max(148, estimateBlockHeight(currentState.ctx, block, maxTextWidth));
    currentState = ensureSpace(pages, currentState, blockHeight + 18);
    const blockCtx = currentState.ctx;
    const y = currentState.y;

    drawRoundRect(blockCtx, PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN * 2, blockHeight, 16, '#fbfdff', '#edf2f7');
    drawRoundRect(blockCtx, PAGE_MARGIN + 18, y + 18, 46, 46, 14, '#0f172a');
    drawText(blockCtx, String(index + 1), PAGE_MARGIN + 33, y + 28, 22, '#ffffff', 900);

    const contentX = PAGE_MARGIN + 84;
    const titleHeight = drawWrappedText(blockCtx, `${categoryEmoji(block.category)} ${block.title}`, contentX, y + 18, maxTextWidth, 28, '#0f172a', 900, 36);
    drawText(blockCtx, priceEmoji(block.priceLevel), PAGE_WIDTH - PAGE_MARGIN - 78, y + 22, 20, '#0f766e', 900);

    let chipX = contentX;
    let chipY = y + 26 + titleHeight;
    const chips = [
      CATEGORY_LABELS[block.category],
      block.time ? `🕒 ${block.time}` : '',
      block.location ? `📌 ${block.location}` : '',
      block.estimatedCost ? `💳 ${block.estimatedCost}` : '',
    ].filter(Boolean);

    chips.forEach((chip) => {
      const chipWidth = drawChip(blockCtx, chip, chipX, chipY, '#eef2ff', '#334155');
      chipX += chipWidth + 10;
      if (chipX > PAGE_WIDTH - PAGE_MARGIN - 180) {
        chipX = contentX;
        chipY += 46;
      }
    });

    let nextY = chipY + 52;
    if (block.memo) {
      nextY += drawWrappedText(blockCtx, block.memo, contentX, nextY, maxTextWidth, 22, '#475569', 400, 32) + 6;
    }

    const outgoingConnections = connections.filter((connection) => connection.dayId === day.id && connection.sourceBlockId === block.id);
    outgoingConnections.forEach((connection) => {
      drawText(blockCtx, `🚶 이동 ${TRANSPORT_MODE_LABELS[connection.transportMode ?? 'walk']}${connection.duration ? ` · ${connection.duration}` : ''}`, contentX, nextY, 20, '#0369a1', 800);
      nextY += 28;
    });

    currentState.y += blockHeight + 16;
  });

  if (currentState.y === sectionTop + 104) {
    currentState.y += 20;
  }

  return currentState;
}

function canvasToJpegBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function buildPdfFromJpegs(images: Uint8Array[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let byteOffset = 0;
  const objectCount = 2 + images.length * 3;

  const append = (chunk: Uint8Array) => {
    chunks.push(chunk);
    byteOffset += chunk.length;
  };

  const addObject = (objectNumber: number, bodyParts: Uint8Array[]) => {
    offsets[objectNumber] = byteOffset;
    append(encoder.encode(`${objectNumber} 0 obj\n`));
    bodyParts.forEach(append);
    append(encoder.encode('\nendobj\n'));
  };

  append(encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  addObject(1, [textBytes('<< /Type /Catalog /Pages 2 0 R >>')]);

  const pageObjectNumbers = images.map((_, index) => 3 + index * 3);
  addObject(2, [textBytes(`<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${images.length} >>`)]);

  images.forEach((imageBytes, index) => {
    const pageObject = 3 + index * 3;
    const imageObject = pageObject + 1;
    const contentObject = pageObject + 2;
    const content = `q\n${PDF_WIDTH} 0 0 ${PDF_HEIGHT} 0 0 cm\n/Im${index + 1} Do\nQ`;

    addObject(pageObject, [textBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /XObject << /Im${index + 1} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`)]);
    addObject(imageObject, [
      textBytes(`<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`),
      imageBytes,
      textBytes('\nendstream'),
    ]);
    addObject(contentObject, [textBytes(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)]);
  });

  const xrefOffset = byteOffset;
  append(textBytes(`xref\n0 ${objectCount + 1}\n`));
  append(textBytes('0000000000 65535 f \n'));
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    append(textBytes(`${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`));
  }
  append(textBytes(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));

  const pdfBytes = concatBytes(chunks);
  const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
  return new Blob([pdfBuffer], { type: 'application/pdf' });
}

export async function downloadTravelPlanPdf(input: ExportTravelPlanInput): Promise<void> {
  const pages = [createPage()];
  let state = pages[0];
  drawHeader(state, input);

  input.days.forEach((day) => {
    state = drawDaySection(pages, state, day, input.connections);
  });

  pages.forEach((page, index) => {
    drawText(page.ctx, `Travel Blocks AI · ${index + 1} / ${pages.length}`, PAGE_MARGIN, PAGE_HEIGHT - 44, 18, '#94a3b8', 700);
  });

  const imageBytes = pages.map((page) => canvasToJpegBytes(page.canvas));
  const pdfBlob = buildPdfFromJpegs(imageBytes);
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(input.trip.name || 'travel-plan')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

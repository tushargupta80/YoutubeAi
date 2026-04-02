import { jsPDF } from "jspdf";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 52;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);

function sanitizeFilename(value) {
  return String(value || "study-notes")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "study-notes";
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function extractTableRows(table) {
  return Array.from(table.querySelectorAll("tr"))
    .map((row) => Array.from(row.querySelectorAll("th, td")).map((cell) => normalizeText(cell.textContent)))
    .filter((row) => row.some(Boolean));
}

function extractBlocks(root) {
  const blocks = [];
  const notesRoot = root.querySelector(".prose-notes") || root;
  const children = Array.from(notesRoot.children);

  for (const node of children) {
    const tag = node.tagName?.toLowerCase();
    if (!tag) continue;

    if (tag === "h1" || tag === "h2" || tag === "h3") {
      blocks.push({ type: "heading", level: Number(tag.slice(1)), text: normalizeText(node.textContent) });
      continue;
    }

    if (tag === "p") {
      const text = normalizeText(node.textContent);
      if (text) blocks.push({ type: "paragraph", text });
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(node.querySelectorAll(":scope > li"))
        .map((item) => normalizeText(item.textContent))
        .filter(Boolean);
      if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
      continue;
    }

    if (tag === "blockquote") {
      const text = normalizeText(node.textContent);
      if (text) blocks.push({ type: "quote", text });
      continue;
    }

    if (tag === "pre") {
      const text = normalizeText(node.textContent);
      if (text) blocks.push({ type: "code", text });
      continue;
    }

    if (tag === "table") {
      const rows = extractTableRows(node);
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }

    if (node.classList.contains("diagram-shell") || node.classList.contains("mermaid-card")) {
      const text = normalizeText(node.textContent);
      if (text) blocks.push({ type: "diagram", text });
      continue;
    }

    const fallback = normalizeText(node.textContent);
    if (fallback) blocks.push({ type: "paragraph", text: fallback });
  }

  return blocks;
}

function createDocument(title) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setProperties({ title: title || "Study Notes", subject: "Study Notes PDF", creator: "AI Notes" });
  return doc;
}

function ensureSpace(doc, y, requiredHeight) {
  if (y + requiredHeight <= PAGE_HEIGHT - MARGIN_BOTTOM) {
    return y;
  }
  doc.addPage();
  return MARGIN_TOP;
}

function drawWrappedText(doc, text, x, y, options = {}) {
  const maxWidth = options.maxWidth || CONTENT_WIDTH;
  const lineHeight = options.lineHeight || 18;
  const lines = doc.splitTextToSize(text, maxWidth);
  let cursorY = ensureSpace(doc, y, lines.length * lineHeight + 4);
  lines.forEach((line) => {
    doc.text(line, x, cursorY);
    cursorY += lineHeight;
  });
  return cursorY;
}

function drawHeader(doc, title) {
  let y = MARGIN_TOP;
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  y = drawWrappedText(doc, normalizeText(title || "Study Notes"), MARGIN_X, y, { maxWidth: CONTENT_WIDTH, lineHeight: 30 });
  doc.setDrawColor(216, 211, 209);
  doc.line(MARGIN_X, y + 4, PAGE_WIDTH - MARGIN_X, y + 4);
  return y + 24;
}

function drawTable(doc, rows, y) {
  const colGap = 18;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  let cursorY = ensureSpace(doc, y, 36);

  rows.forEach((row, index) => {
    const left = normalizeText(row[0] || "");
    const right = normalizeText(row[1] || "");
    const leftLines = doc.splitTextToSize(left, colWidth);
    const rightLines = doc.splitTextToSize(right, colWidth);
    const rowHeight = Math.max(leftLines.length, rightLines.length) * 16 + 12;
    cursorY = ensureSpace(doc, cursorY, rowHeight + 8);

    if (index === 0) {
      doc.setFillColor(245, 245, 244);
      doc.rect(MARGIN_X, cursorY - 12, CONTENT_WIDTH, rowHeight, "F");
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }

    let lineY = cursorY;
    leftLines.forEach((line) => {
      doc.text(line, MARGIN_X + 8, lineY);
      lineY += 16;
    });

    lineY = cursorY;
    rightLines.forEach((line) => {
      doc.text(line, MARGIN_X + colWidth + colGap + 8, lineY);
      lineY += 16;
    });

    doc.setDrawColor(231, 229, 228);
    doc.rect(MARGIN_X, cursorY - 12, CONTENT_WIDTH, rowHeight);
    cursorY += rowHeight + 6;
  });

  return cursorY + 4;
}

export function downloadStyledPdf(title, element) {
  if (typeof window === "undefined" || !element) return;

  const doc = createDocument(title);
  const blocks = extractBlocks(element);
  let y = drawHeader(doc, title);

  blocks.forEach((block) => {
    if (block.type === "heading") {
      y = ensureSpace(doc, y, 40);
      doc.setFont("times", "bold");
      doc.setFontSize(block.level === 2 ? 18 : 15);
      y = drawWrappedText(doc, block.text, MARGIN_X, y, { maxWidth: CONTENT_WIDTH, lineHeight: block.level === 2 ? 24 : 20 });
      y += 6;
      return;
    }

    if (block.type === "paragraph") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11.5);
      y = drawWrappedText(doc, block.text, MARGIN_X, y, { maxWidth: CONTENT_WIDTH, lineHeight: 18 });
      y += 8;
      return;
    }

    if (block.type === "list") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11.5);
      block.items.forEach((item, index) => {
        const prefix = block.ordered ? `${index + 1}.` : "•";
        const textLines = doc.splitTextToSize(`${prefix} ${item}`, CONTENT_WIDTH - 10);
        y = ensureSpace(doc, y, textLines.length * 18 + 2);
        textLines.forEach((line) => {
          doc.text(line, MARGIN_X + 4, y);
          y += 18;
        });
      });
      y += 4;
      return;
    }

    if (block.type === "quote") {
      const quoteHeight = doc.splitTextToSize(block.text, CONTENT_WIDTH - 28).length * 18 + 18;
      y = ensureSpace(doc, y, quoteHeight + 8);
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(13, 148, 136);
      doc.rect(MARGIN_X, y - 12, CONTENT_WIDTH, quoteHeight, "FD");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11.5);
      y = drawWrappedText(doc, block.text, MARGIN_X + 14, y + 4, { maxWidth: CONTENT_WIDTH - 28, lineHeight: 18 });
      y += 8;
      return;
    }

    if (block.type === "table") {
      doc.setFontSize(10.5);
      y = drawTable(doc, block.rows, y);
      return;
    }

    if (block.type === "diagram") {
      const note = block.text || "Visual diagram available in the web version.";
      const boxHeight = doc.splitTextToSize(note, CONTENT_WIDTH - 24).length * 17 + 20;
      y = ensureSpace(doc, y, boxHeight + 8);
      doc.setFillColor(250, 250, 249);
      doc.setDrawColor(214, 211, 209);
      doc.roundedRect(MARGIN_X, y - 12, CONTENT_WIDTH, boxHeight, 10, 10, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Visual Diagram", MARGIN_X + 12, y + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      y = drawWrappedText(doc, note, MARGIN_X + 12, y + 22, { maxWidth: CONTENT_WIDTH - 24, lineHeight: 17 });
      y += 8;
      return;
    }

    if (block.type === "code") {
      const codeText = block.text;
      const codeHeight = doc.splitTextToSize(codeText, CONTENT_WIDTH - 24).length * 15 + 18;
      y = ensureSpace(doc, y, codeHeight + 8);
      doc.setFillColor(28, 25, 23);
      doc.roundedRect(MARGIN_X, y - 12, CONTENT_WIDTH, codeHeight, 8, 8, "F");
      doc.setTextColor(245, 245, 244);
      doc.setFont("courier", "normal");
      doc.setFontSize(9.5);
      y = drawWrappedText(doc, codeText, MARGIN_X + 12, y + 2, { maxWidth: CONTENT_WIDTH - 24, lineHeight: 15 });
      doc.setTextColor(31, 41, 55);
      y += 8;
      return;
    }
  });

  doc.save(`${sanitizeFilename(title)}.pdf`);
}

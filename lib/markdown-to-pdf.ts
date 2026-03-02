"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ────────────────────────────────────────────────────────────────────

interface AutoTableOptions {
    startY: number;
    head: string[][];
    body: string[][];
    theme: string;
    headStyles: Record<string, unknown>;
    bodyStyles: Record<string, unknown>;
    alternateRowStyles: Record<string, unknown>;
    margin: { left: number; right: number };
    tableWidth: string;
    styles: Record<string, unknown>;
}

interface JsPDFWithAutoTable extends jsPDF {
    lastAutoTable: { finalY: number };
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 210; // A4 mm
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 25;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const FONT_SIZES = {
    h1: 18,
    h2: 15,
    h3: 13,
    body: 11,
    code: 9.5,
    footer: 8,
};

const LINE_HEIGHT_FACTOR = 1.4;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLineHeight(fontSize: number): number {
    return (fontSize * LINE_HEIGHT_FACTOR * 25.4) / 72; // pt → mm
}

function stripInlineMarkdown(text: string): string {
    // Remove images ![alt](url)
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    // Remove links but keep text [text](url) → text
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    // Remove bold/italic markers
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
    text = text.replace(/\*\*(.+?)\*\*/g, "$1");
    text = text.replace(/\*(.+?)\*/g, "$1");
    text = text.replace(/__(.+?)__/g, "$1");
    text = text.replace(/_(.+?)_/g, "$1");
    // Remove inline code backticks
    text = text.replace(/`([^`]+)`/g, "$1");
    return text;
}

function addHeaderFooter(doc: jsPDF) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // Header
        doc.setFontSize(FONT_SIZES.footer);
        doc.setTextColor(160, 160, 160);
        doc.setFont("helvetica", "normal");
        doc.text("OpenClaw Insights", MARGIN_LEFT, 12);

        // Footer — page number
        const pageText = `Page ${i} of ${pageCount}`;
        const textWidth = doc.getTextWidth(pageText);
        doc.text(pageText, PAGE_WIDTH - MARGIN_RIGHT - textWidth, 290);

        // Thin header line
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(MARGIN_LEFT, 15, PAGE_WIDTH - MARGIN_RIGHT, 15);
    }
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
    if (y + needed > 297 - MARGIN_BOTTOM) {
        doc.addPage();
        return MARGIN_TOP;
    }
    return y;
}

// ── Table parser ─────────────────────────────────────────────────────────────

interface ParsedTable {
    headers: string[];
    rows: string[][];
}

function parseMarkdownTable(lines: string[], startIdx: number): { table: ParsedTable; endIdx: number } {
    const headerLine = lines[startIdx].trim();
    const headers = headerLine
        .split("|")
        .map((c) => stripInlineMarkdown(c.trim()))
        .filter((c) => c.length > 0);

    // Skip separator line (e.g. |---|---|)
    let idx = startIdx + 2;
    const rows: string[][] = [];

    while (idx < lines.length) {
        const line = lines[idx].trim();
        if (!line.startsWith("|")) break;
        const cells = line
            .split("|")
            .map((c) => stripInlineMarkdown(c.trim()))
            .filter((c) => c.length > 0);
        if (cells.length > 0) rows.push(cells);
        idx++;
    }

    return { table: { headers, rows }, endIdx: idx };
}

// ── Main export ──────────────────────────────────────────────────────────────

export function downloadMarkdownAsPdf(markdown: string, filename: string = "openclaw-insights.pdf") {
    const doc = new jsPDF({ unit: "mm", format: "a4" }) as JsPDFWithAutoTable;
    let y = MARGIN_TOP;

    const lines = markdown.split("\n");
    let i = 0;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    while (i < lines.length) {
        const line = lines[i];

        // ── Code blocks ──────────────────────────────────────────────────
        if (line.trim().startsWith("```")) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBlockContent = [];
                i++;
                continue;
            } else {
                // End of code block — render it
                inCodeBlock = false;
                const codeText = codeBlockContent.join("\n");
                doc.setFont("courier", "normal");
                doc.setFontSize(FONT_SIZES.code);
                doc.setTextColor(40, 40, 40);

                const codeLines = doc.splitTextToSize(codeText, CONTENT_WIDTH - 10);
                const codeLineHeight = getLineHeight(FONT_SIZES.code);
                const blockHeight = codeLines.length * codeLineHeight + 6;

                y = ensureSpace(doc, y, blockHeight);

                // Background
                doc.setFillColor(245, 245, 245);
                doc.roundedRect(MARGIN_LEFT, y - 2, CONTENT_WIDTH, blockHeight, 1.5, 1.5, "F");

                doc.text(codeLines, MARGIN_LEFT + 5, y + codeLineHeight);
                y += blockHeight + 4;

                doc.setFont("helvetica", "normal");
                doc.setTextColor(30, 30, 30);
                i++;
                continue;
            }
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            i++;
            continue;
        }

        // ── Tables ───────────────────────────────────────────────────────
        if (
            line.trim().startsWith("|") &&
            i + 1 < lines.length &&
            lines[i + 1].trim().match(/^\|[\s:|-]+\|/)
        ) {
            const { table, endIdx } = parseMarkdownTable(lines, i);
            y = ensureSpace(doc, y, 20);

            autoTable(doc, {
                startY: y,
                head: [table.headers],
                body: table.rows,
                theme: "grid",
                headStyles: {
                    fillColor: [55, 65, 81],
                    textColor: [255, 255, 255],
                    fontStyle: "bold",
                    fontSize: 9.5,
                    cellPadding: 3,
                },
                bodyStyles: {
                    fontSize: 9,
                    textColor: [30, 30, 30],
                    cellPadding: 2.5,
                },
                alternateRowStyles: {
                    fillColor: [248, 249, 250],
                },
                margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
                tableWidth: "auto",
                styles: {
                    overflow: "linebreak",
                    lineColor: [220, 220, 220],
                    lineWidth: 0.3,
                },
            });

            y = doc.lastAutoTable.finalY + 6;
            i = endIdx;
            continue;
        }

        // ── Horizontal rules ─────────────────────────────────────────────
        if (line.trim().match(/^[-*_]{3,}$/)) {
            y = ensureSpace(doc, y, 8);
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.4);
            doc.line(MARGIN_LEFT, y + 3, PAGE_WIDTH - MARGIN_RIGHT, y + 3);
            y += 8;
            i++;
            continue;
        }

        // ── Headings ─────────────────────────────────────────────────────
        const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
        if (headingMatch) {
            const level = headingMatch[1].length as 1 | 2 | 3;
            const text = stripInlineMarkdown(headingMatch[2]);
            const fontSize = FONT_SIZES[`h${level}`];
            const lineHeight = getLineHeight(fontSize);

            y = ensureSpace(doc, y, lineHeight + 6);

            // Extra spacing before headings
            y += level === 1 ? 6 : level === 2 ? 4 : 3;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(fontSize);
            doc.setTextColor(20, 20, 20);

            const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH);
            doc.text(wrapped, MARGIN_LEFT, y);
            y += wrapped.length * lineHeight + 2;

            // Underline for h1
            if (level === 1) {
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.5);
                doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
                y += 3;
            }

            doc.setFont("helvetica", "normal");
            i++;
            continue;
        }

        // ── Bullet lists ─────────────────────────────────────────────────
        const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)/);
        if (bulletMatch) {
            const indent = Math.min(Math.floor(bulletMatch[1].length / 2), 3);
            const text = stripInlineMarkdown(bulletMatch[3]);
            const xOffset = MARGIN_LEFT + 5 + indent * 6;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(FONT_SIZES.body);
            doc.setTextColor(30, 30, 30);
            const lineHeight = getLineHeight(FONT_SIZES.body);

            const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH - (xOffset - MARGIN_LEFT) - 4);
            y = ensureSpace(doc, y, wrapped.length * lineHeight);

            // Bullet dot
            doc.setFillColor(80, 80, 80);
            doc.circle(xOffset - 3, y - 1, 0.7, "F");

            doc.text(wrapped, xOffset, y);
            y += wrapped.length * lineHeight + 1;
            i++;
            continue;
        }

        // ── Numbered lists ───────────────────────────────────────────────
        const numberedMatch = line.match(/^(\s*)(\d+)[.)]\s+(.*)/);
        if (numberedMatch) {
            const indent = Math.min(Math.floor(numberedMatch[1].length / 2), 3);
            const num = numberedMatch[2];
            const text = stripInlineMarkdown(numberedMatch[3]);
            const xOffset = MARGIN_LEFT + 5 + indent * 6;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(FONT_SIZES.body);
            doc.setTextColor(30, 30, 30);
            const lineHeight = getLineHeight(FONT_SIZES.body);

            const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH - (xOffset - MARGIN_LEFT) - 4);
            y = ensureSpace(doc, y, wrapped.length * lineHeight);

            doc.setFont("helvetica", "bold");
            doc.text(`${num}.`, xOffset - 6, y);
            doc.setFont("helvetica", "normal");
            doc.text(wrapped, xOffset, y);
            y += wrapped.length * lineHeight + 1;
            i++;
            continue;
        }

        // ── Empty lines ──────────────────────────────────────────────────
        if (line.trim() === "") {
            y += 3;
            i++;
            continue;
        }

        // ── Body text (default) ──────────────────────────────────────────
        const text = stripInlineMarkdown(line);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(FONT_SIZES.body);
        doc.setTextColor(30, 30, 30);
        const lineHeight = getLineHeight(FONT_SIZES.body);

        const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH);
        y = ensureSpace(doc, y, wrapped.length * lineHeight);
        doc.text(wrapped, MARGIN_LEFT, y);
        y += wrapped.length * lineHeight + 1;

        i++;
    }

    // Add header/footer to all pages
    addHeaderFooter(doc);

    doc.save(filename);
}

const fs = require('fs');

const path = 'c:/Users/capy1/Desktop/New folder/main.js';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '      const ARABIC_RE = /[\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;';
const endMarker = '          children: runs,\n        }),\n      );';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find markers!");
  console.log("Start:", startIndex);
  console.log("End:", endIndex);
  process.exit(1);
}

const replacement = `      const ARABIC_RE = /[\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;
      const fullLineText = block.items.map((li) => li.item.str).join(" ");
      const lineIsArabic = ARABIC_RE.test(fullLineText);

      // STEP 1: Layout Sorting (Y-Axis Clustering & X-Axis Sequence)
      // Ensure the insertion order into the paragraph matches the reading sequence of the line's primary language.
      const lineItems = block.items;
      lineItems.sort((a, b) => lineIsArabic ? b.x - a.x : a.x - b.x);

      const runs = [];
      let lastEdge = null;

      for (const li of lineItems) {
        let raw = fixBullets(li.item.str);
        if (!raw.trim()) continue;

        // 1. Robust BiDi Normalization: map Presentation Forms to standard logical Arabic characters
        if (ARABIC_RE.test(raw)) {
          raw = raw.normalize("NFKD");
        }

        const sizePt = Math.round(
          Math.abs(li.item.transform[3]) ||
            Math.abs(li.item.transform[0]) ||
            li.item.height ||
            12
        );

        let gap = "";
        if (lastEdge !== null) {
          const gapPts = lineIsArabic 
             ? lastEdge - (li.x + (li.item.width || 0)) 
             : li.x - lastEdge;

          const spaceW = sizePt * 0.3;
          if (gapPts > spaceW * 0.8) {
            gap = " ".repeat(Math.max(1, Math.round(gapPts / spaceW)));
          }
        }
        lastEdge = lineIsArabic ? li.x : li.x + (li.item.width || 0);

        const fn = (li.item.fontName || "").toLowerCase();
        const fontFamily = fn.includes("times")
          ? "Times New Roman"
          : fn.includes("courier")
            ? "Courier New"
            : fn.includes("calibri")
              ? "Calibri"
              : "Arial";

        // 2. Strict Bidirectional (BiDi) Segmentation
        const fullText = gap + raw;
        const tokenRegex = /([\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+)|([^\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+)/g;
        let match;
        
        while ((match = tokenRegex.exec(fullText)) !== null) {
          const tokenText = match[0];
          const isArabicToken = ARABIC_RE.test(tokenText);
          
          runs.push(
            new docx.TextRun({
              text: tokenText,
              font: isArabicToken ? "Arial" : fontFamily,
              size: ptToHp(sizePt),
              color: li.colorHex,
              bold: fn.includes("bold"),
              italics: fn.includes("italic"),
              underline: fn.includes("underline") ? {} : undefined,
              rightToLeft: isArabicToken
            })
          );
        }
      }

      if (runs.length === 0) continue;

      // 3. Paragraph Level Configuration
      allChildren.push(
        new docx.Paragraph({
          bidirectional: lineIsArabic,
          alignment: lineIsArabic ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
          spacing: { before: 120, after: 120, line: 360 },
          children: runs,
        }),
      );`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex + endMarker.length);
fs.writeFileSync(path, newContent, 'utf8');
console.log("Successfully patched main.js");

      const lineItems = block.items;
      lineItems.sort((a, b) => a.x - b.x); // STEP 1: sort horizontally

      const fullLineText = lineItems.map((li) => li.item.str).join(" ");
      const lineIsArabic = ARABIC_RE.test(fullLineText);

      // --- NEW BIDI UNSHUFFLER ---
      const visualItems = [];
      let lastEdge = null;
      for (const li of lineItems) {
        const sizePt = Math.round(
          Math.abs(li.item.transform[3]) ||
            Math.abs(li.item.transform[0]) ||
            li.item.height ||
            12
        );
        if (lastEdge !== null) {
          const gapPts = li.x - lastEdge;
          const spaceW = sizePt * 0.3;
          if (gapPts > spaceW * 0.8) {
            const numSpaces = Math.max(1, Math.round(gapPts / spaceW));
            visualItems.push({
              isSpace: true,
              str: " ".repeat(numSpaces),
              colorHex: li.colorHex,
              fontFamily: "Arial",
              sizePt: sizePt,
              bold: false,
              italics: false
            });
          }
        }
        
        const fn = (li.item.fontName || "").toLowerCase();
        const fontFamily = fn.includes("times")
          ? "Times New Roman"
          : fn.includes("courier")
            ? "Courier New"
            : fn.includes("calibri")
              ? "Calibri"
              : "Arial";
              
        visualItems.push({
          isSpace: false,
          str: fixBullets(li.item.str).trim(), // avoid extra spaces as we calc gaps
          colorHex: li.colorHex,
          fontFamily,
          sizePt,
          bold: fn.includes("bold"),
          italics: fn.includes("italic")
        });
        lastEdge = li.x + (li.item.width || 0);
      }

      // Group into LTR / RTL blocks
      let bidiBlocks = [];
      let currentBidiBlock = [];
      let currentType = lineIsArabic ? 'RTL' : 'LTR';

      for (const v of visualItems) {
        if (!v.str) continue;
        const hasArabic = /[\u0600-\u06FF]/.test(v.str);
        const hasEnglish = /[a-zA-Z]/.test(v.str);
        
        let type = currentType;
        if (hasArabic) type = 'RTL';
        else if (hasEnglish) type = 'LTR';
        
        if (type === currentType) {
          currentBidiBlock.push(v);
        } else {
          if (currentBidiBlock.length > 0) bidiBlocks.push({ type: currentType, items: currentBidiBlock });
          currentType = type;
          currentBidiBlock = [v];
        }
      }
      if (currentBidiBlock.length > 0) bidiBlocks.push({ type: currentType, items: currentBidiBlock });

      if (lineIsArabic) {
        bidiBlocks.reverse(); // Reverse block order for RTL base
      }

      let logicalItems = [];
      for (const b of bidiBlocks) {
        if (b.type === 'RTL') {
          const rev = [...b.items].reverse();
          for (const item of rev) {
            if (!item.isSpace) {
              item.str = item.str.split('').reverse().join('');
            }
          }
          logicalItems.push(...rev);
        } else {
          logicalItems.push(...b.items);
        }
      }

      const runs = [];
      for (const item of logicalItems) {
        if (!item.str) continue;
        const segIsArabic = /[\u0600-\u06FF]/.test(item.str);
        runs.push(
          new docx.TextRun({
            text: item.str,
            font: item.fontFamily,
            size: ptToHp(item.sizePt),
            color: item.colorHex,
            bold: item.bold,
            italics: item.italics,
            rightToLeft: segIsArabic
          })
        );
      }
const fs = require('fs');

const filePath = 'c:\\Users\\capy1\\Desktop\\New folder\\main.js';
let code = fs.readFileSync(filePath, 'utf8');

const START = 'async function convertPDFToWord(arrayBuffer) {';
const END   = '  return docx.Packer.toBlob(doc);\n}';
const si    = code.indexOf(START);
const ei    = code.indexOf(END, si) + END.length;
if (si < 0 || ei < END.length) { console.error('markers not found'); process.exit(1); }

/* ─────────────────────────────────────────────────────────────────────────
   COMPLETE REPLACEMENT FUNCTION
   ───────────────────────────────────────────────────────────────────────── */
const fn = `async function convertPDFToWord(arrayBuffer) {
  /* ── guard ─────────────────────────────────────────────────────────────── */
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded.');
  if (typeof docx    === 'undefined') throw new Error('docx.js not loaded.');

  /* ── constants ─────────────────────────────────────────────────────────── */
  const SCALE      = 2.5;   // render DPI multiplier
  const LINE_TOL   = 4;     // y-grouping tolerance (PDF points)
  const MIN_IMG    = 20;    // ignore images smaller than this (pts)
  const MAX_W_PX   = 490;   // max image width in Word (px)
  const GRID_PT    = 14;    // cell size for vector-graphics scan (pts)
  const AR = /[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFD\\uFE70-\\uFEFF]/;

  /* ── helpers ────────────────────────────────────────────────────────────── */
  const canvasToPng = (c) =>
    new Promise((ok, err) =>
      c.toBlob(async (b) =>
        b ? ok(new Uint8Array(await b.arrayBuffer())) : err(new Error('toBlob')),
        'image/png'));

  /** Average dominant non-white colour in a canvas region → 6-char hex. */
  const sampleHex = (ctx, x, y, w, h) => {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const sw = Math.max(1, Math.min(Math.ceil(w),  ctx.canvas.width  - x0));
    const sh = Math.max(1, Math.min(Math.ceil(h),  ctx.canvas.height - y0));
    if (sw <= 0 || sh <= 0) return '000000';
    const d = ctx.getImageData(x0, y0, sw, sh).data;
    let r=0, g=0, b=0, n=0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 25) continue;
      if (d[i]>242 && d[i+1]>242 && d[i+2]>242) continue;
      r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++;
    }
    if (!n) return '000000';
    return [r,g,b].map(v => Math.round(v/n).toString(16).padStart(2,'0')).join('');
  };

  /** 6-element affine matrix multiply (PDF convention). */
  const mul = (a, b) => [
    a[0]*b[0]+a[1]*b[2],  a[0]*b[1]+a[1]*b[3],
    a[2]*b[0]+a[3]*b[2],  a[2]*b[1]+a[3]*b[3],
    a[4]*b[0]+a[5]*b[2]+b[4],
    a[4]*b[1]+a[5]*b[3]+b[5]
  ];

  /** PDF font-size pts → Word half-points (clamped 16..144). */
  const ptToHp = (pt) => Math.max(16, Math.min(144, Math.round(Math.abs(pt) * 2)));

  /**
   * Is Arabic the dominant script?
   * Counts Arabic codepoints vs Latin letters.
   */
  const dominantArabic = (str) => {
    const ar = (str.match(AR)  || []).length;
    const en = (str.match(/[a-zA-Z]/g) || []).length;
    return ar > 0 && ar >= en;
  };

  /**
   * Split a string into [{text, arabic}] bidi segments.
   * Does NOT reverse characters — Word's shaping engine handles glyph order.
   */
  const splitBidi = (str) => {
    const segs = [];
    const re   = /([\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFD\\uFE70-\\uFEFF][\\s\\S]*?(?=[^\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFD\\uFE70-\\uFEFF]|$))|([^\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFD\\uFE70-\\uFEFF]+)/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      if (!m[0]) continue;
      segs.push({ text: m[0], arabic: AR.test(m[0]) });
    }
    if (!segs.length) segs.push({ text: str, arabic: AR.test(str) });
    return segs;
  };

  const prog = (p, msg) => {
    if (typeof setProgress === 'function') setProgress('pdf2word', p, msg);
  };

  /* ── load PDF ────────────────────────────────────────────────────────────── */
  prog(8, 'Loading PDF…');
  const pdfDoc = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
  }).promise;

  const numPages = pdfDoc.numPages;
  const children = [];

  /* ══════════════════════════════════════════════════════════════════════════
     PER-PAGE LOOP
     ══════════════════════════════════════════════════════════════════════════ */
  for (let pn = 1; pn <= numPages; pn++) {
    prog(10 + Math.floor((pn-1)/numPages*80), \`Page \${pn} / \${numPages}…\`);

    const page = await pdfDoc.getPage(pn);
    const vp   = page.getViewport({ scale: SCALE });
    const W_pt = page.view[2];  // page width  in PDF pts
    const H_pt = page.view[3];  // page height in PDF pts
    const cW   = Math.round(W_pt * SCALE);
    const cH   = Math.round(H_pt * SCALE);

    /* ── 1. Render page to canvas ─────────────────────────────────────────── */
    const canvas = document.createElement('canvas');
    canvas.width  = cW;
    canvas.height = cH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cW, cH);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    /* ── 2. Parse operator list: raster images + underlines ──────────────── */
    const rasterImgs  = [];  // extracted raster images
    const rasterBoxes = [];  // PDF-pt bounding boxes (for masking later)
    const underlines  = [];  // { x0, x1, y } in PDF pts (Y-up)
    const seenKeys    = new Set();

    try {
      const OPS    = pdfjsLib.OPS;
      const opList = await page.getOperatorList();
      const PAINT  = new Set([OPS.paintImageXObject, OPS.paintImageXObjectRepeat,
                               OPS.paintJpegXObject,  OPS.paintInlineImageXObject]);
      const FILLS  = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke]);
      const STRKS  = new Set([OPS.stroke, OPS.fillStroke, OPS.eoFillStroke]);

      let ctm = [1,0,0,1,0,0];
      const stack = [];
      let path = [], lx = 0, ly = 0;

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn2  = opList.fnArray[i];
        const args = opList.argsArray[i];

        if      (fn2 === OPS.save)       { stack.push([...ctm]); }
        else if (fn2 === OPS.restore)    { ctm = stack.length ? stack.pop() : [1,0,0,1,0,0]; }
        else if (fn2 === OPS.transform)  { ctm = mul(ctm, args); }
        else if (fn2 === OPS.beginPath)  { path = []; lx = ly = 0; }
        else if (fn2 === OPS.moveTo)     { lx=args[0]; ly=args[1]; path.push({t:'M',x:lx,y:ly}); }
        else if (fn2 === OPS.lineTo)     { lx=args[0]; ly=args[1]; path.push({t:'L',x:lx,y:ly}); }
        else if (fn2 === OPS.rectangle)  { path.push({t:'R',x:args[0],y:args[1],w:args[2],h:args[3]}); }

        else if (FILLS.has(fn2) || STRKS.has(fn2)) {
          let px = null, py = null;
          for (const cmd of path) {
            if (cmd.t === 'R') {
              const ax = ctm[0]*cmd.x+ctm[2]*cmd.y+ctm[4];
              const ay = ctm[1]*cmd.x+ctm[3]*cmd.y+ctm[5];
              const bx = ctm[0]*(cmd.x+cmd.w)+ctm[2]*(cmd.y+cmd.h)+ctm[4];
              const by = ctm[1]*(cmd.x+cmd.w)+ctm[3]*(cmd.y+cmd.h)+ctm[5];
              const rW = Math.abs(bx-ax), rH = Math.abs(by-ay);
              // Thin wide rect → underline
              if (rH <= 2.5 && rW >= 8) {
                underlines.push({ x0: Math.min(ax,bx), x1: Math.max(ax,bx), y: Math.max(ay,by) });
              }
            } else if (cmd.t === 'M') {
              px = cmd.x; py = cmd.y;
            } else if (cmd.t === 'L') {
              if (px !== null) {
                const ax=ctm[0]*px+ctm[2]*py+ctm[4], ay=ctm[1]*px+ctm[3]*py+ctm[5];
                const bx=ctm[0]*cmd.x+ctm[2]*cmd.y+ctm[4], by=ctm[1]*cmd.x+ctm[3]*cmd.y+ctm[5];
                if (Math.abs(by-ay)<=1.5 && Math.abs(bx-ax)>=8) {
                  underlines.push({ x0: Math.min(ax,bx), x1: Math.max(ax,bx), y: Math.max(ay,by) });
                }
              }
              px = cmd.x; py = cmd.y;
            }
          }
          path = [];
        }

        else if (PAINT.has(fn2)) {
          const ref = args[0]; if (!ref) continue;
          const key = (typeof ref === 'string') ? ref : ('i' + i);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          const [a,b,c,d,e,f] = ctm;
          const cs = [[e,f],[a+e,b+f],[c+e,d+f],[a+c+e,b+d+f]];
          const pX = Math.min(...cs.map(p=>p[0]));
          const pY = Math.min(...cs.map(p=>p[1]));
          const pW = Math.max(...cs.map(p=>p[0]))-pX;
          const pH = Math.max(...cs.map(p=>p[1]))-pY;
          if (pW < MIN_IMG || pH < MIN_IMG) continue;

          rasterBoxes.push({ x:pX, y:pY, w:pW, h:pH });

          try {
            let obj = null;
            if (fn2===OPS.paintInlineImageXObject && ref && ref.data) {
              obj = ref;
            } else if (typeof ref==='object' && ref!==null && ref.data) {
              obj = ref;
            } else {
              obj = await new Promise(res => {
                const t = setTimeout(() => res(null), 700);
                const done = v => { clearTimeout(t); res(v||null); };
                try {
                  if (page.objs.has(ref))                        { const v=page.objs.get(ref,done);       if(v!==undefined)done(v); }
                  else if (page.commonObjs&&page.commonObjs.has(ref)) { const v=page.commonObjs.get(ref,done); if(v!==undefined)done(v); }
                  else done(null);
                } catch(_){ done(null); }
              });
            }

            let u8 = null;
            if (obj) {
              const tw = obj.width  || Math.round(pW*SCALE);
              const th = obj.height || Math.round(pH*SCALE);
              const tmp = document.createElement('canvas');
              tmp.width=tw; tmp.height=th;
              const tc = tmp.getContext('2d');
              tc.fillStyle='#fff'; tc.fillRect(0,0,tw,th);
              if (obj instanceof ImageBitmap||obj instanceof HTMLImageElement||obj instanceof HTMLCanvasElement) {
                tc.drawImage(obj,0,0,tw,th);
              } else if (obj.data && obj.width && obj.height) {
                tc.putImageData(new ImageData(new Uint8ClampedArray(obj.data),obj.width,obj.height),0,0);
              } else if (obj.bitmap) {
                tc.drawImage(obj.bitmap,0,0,tw,th);
              }
              u8 = await canvasToPng(tmp);
            }
            if (!u8) {
              const cx=Math.max(0,Math.round(pX*SCALE));
              const cy=Math.max(0,Math.round((H_pt-pY-pH)*SCALE));
              const cw=Math.max(1,Math.round(pW*SCALE));
              const ch=Math.max(1,Math.round(pH*SCALE));
              if (cx+cw<=cW && cy+ch<=cH) {
                const cr=document.createElement('canvas'); cr.width=cw; cr.height=ch;
                const cc=cr.getContext('2d');
                cc.fillStyle='#fff'; cc.fillRect(0,0,cw,ch);
                cc.drawImage(canvas,cx,cy,cw,ch,0,0,cw,ch);
                u8 = await canvasToPng(cr);
              }
            }
            if (u8) rasterImgs.push({ sortY:pY+pH, imgU8:u8, dispW:Math.round(pW), dispH:Math.round(pH) });
          } catch(e){ console.warn('[PDF2WORD] img err:',e); }
        }
      }
    } catch(e){ console.warn('[PDF2WORD] opList:',e); }

    /* ── 3. Extract text with rich metadata ───────────────────────────────── */
    const textContent = await page.getTextContent({ normalizeWhitespace: false });
    const lineMap     = new Map();  // rawY → token[]

    for (const item of textContent.items) {
      const s = item.str; if (!s || !s.trim()) continue;
      const rawX  = item.transform[4];
      const rawY  = item.transform[5];
      const itemW = item.width || 0;

      /*
       * FONT SIZE — most reliable formula for PDF text matrices:
       *   transform = [sx*cos, sx*sin, -sy*sin, sy*cos, tx, ty]
       *   rendered font size = ||(transform[0], transform[1])||
       * Fallback chain: hypot(0,1) → hypot(2,3) → item.height → 12
       */
      const sz0 = Math.hypot(item.transform[0], item.transform[1]);
      const sz1 = Math.hypot(item.transform[2], item.transform[3]);
      const sizePt = (sz0 > 0.5 ? sz0 : sz1 > 0.5 ? sz1 : item.height > 0 ? item.height : 12);

      /* Colour sample */
      const cX  = rawX * SCALE;
      const cY  = (H_pt - rawY - sizePt * 1.2) * SCALE;
      const cW2 = Math.max(2, itemW * SCALE);
      const cH2 = Math.max(2, sizePt * SCALE * 1.4);
      const hex = sampleHex(ctx, cX, cY, cW2, cH2);

      /* Underline check */
      let ul = false;
      for (const u of underlines) {
        if (u.x0 < rawX + itemW && u.x1 > rawX && u.y >= rawY - 6 && u.y <= rawY + 2) {
          ul = true; break;
        }
      }

      /* Font style */
      const fn3  = (item.fontName || '').toLowerCase();
      const bold = fn3.includes('bold');
      const ital = fn3.includes('italic') || fn3.includes('oblique');
      let   font = 'Times New Roman';
      if (fn3.includes('arial') || fn3.includes('helvetica')) font = 'Arial';
      else if (fn3.includes('calibri'))                       font = 'Calibri';
      else if (fn3.includes('courier'))                       font = 'Courier New';

      /* Group into line */
      let lk = null;
      for (const k of lineMap.keys()) {
        if (Math.abs(k - rawY) <= LINE_TOL) { lk = k; break; }
      }
      if (lk === null) { lk = rawY; lineMap.set(lk, []); }
      lineMap.get(lk).push({ str:s, x:rawX, y:rawY, w:itemW, sizePt, font, bold, ital, hex, ul });
    }

    /* ── 4. Detect vector graphics (arrows, diagrams) via canvas remnant scan ─
     *
     * Algorithm:
     *  a. Clone the rendered canvas into a mask canvas.
     *  b. Paint white over every text bounding box and every raster image region.
     *  c. Divide remaining canvas into GRID_PT×GRID_PT cells.
     *  d. Mark cells that contain non-white pixels.
     *  e. BFS to find connected components of marked cells.
     *  f. For each component large enough, crop from original canvas → image block.
     * ─────────────────────────────────────────────────────────────────────────── */
    const vectorImgs = [];
    try {
      const mask = document.createElement('canvas');
      mask.width  = cW; mask.height = cH;
      const mCtx = mask.getContext('2d');
      mCtx.drawImage(canvas, 0, 0);
      mCtx.fillStyle = '#ffffff';

      // White-out text
      for (const [, toks] of lineMap) {
        for (const tok of toks) {
          const mx = (tok.x - 3) * SCALE;
          const my = (H_pt - tok.y - tok.sizePt * 1.4) * SCALE - 3;
          const mw = (tok.w + 6) * SCALE;
          const mh = tok.sizePt * 1.8 * SCALE + 6;
          mCtx.fillRect(mx, my, mw, mh);
        }
      }
      // White-out raster images
      for (const r of rasterBoxes) {
        mCtx.fillRect(
          (r.x - 3) * SCALE,
          (H_pt - r.y - r.h - 3) * SCALE,
          (r.w + 6) * SCALE,
          (r.h + 6) * SCALE
        );
      }

      /* Cell grid scan */
      const GW   = Math.ceil(W_pt / GRID_PT);
      const GH   = Math.ceil(H_pt / GRID_PT);
      const CELLS = new Uint8Array(GW * GH);

      const imgData = mCtx.getImageData(0, 0, cW, cH).data;
      for (let py2 = 0; py2 < cH; py2++) {
        for (let px2 = 0; px2 < cW; px2++) {
          const idx = (py2 * cW + px2) * 4;
          if (imgData[idx+3] < 25) continue;
          if (imgData[idx]>244 && imgData[idx+1]>244 && imgData[idx+2]>244) continue;
          const gx = Math.min(GW-1, Math.floor(px2 / SCALE / GRID_PT));
          const gy = Math.min(GH-1, Math.floor(py2 / SCALE / GRID_PT));
          CELLS[gy*GW + gx] = 1;
        }
      }

      /* BFS connected components */
      const visited = new Uint8Array(GW * GH);
      const DIRS    = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
      const MIN_CW  = Math.max(1, Math.ceil(15 / GRID_PT));
      const MIN_CH  = Math.max(1, Math.ceil(8  / GRID_PT));

      for (let gy = 0; gy < GH; gy++) {
        for (let gx = 0; gx < GW; gx++) {
          if (!CELLS[gy*GW+gx] || visited[gy*GW+gx]) continue;
          const q = [{x:gx,y:gy}];
          visited[gy*GW+gx] = 1;
          let minX=gx, maxX=gx, minY=gy, maxY=gy, head=0;
          while (head < q.length) {
            const {x:qx,y:qy} = q[head++];
            for (const [dx,dy] of DIRS) {
              const nx=qx+dx, ny=qy+dy;
              if (nx<0||nx>=GW||ny<0||ny>=GH||!CELLS[ny*GW+nx]||visited[ny*GW+nx]) continue;
              visited[ny*GW+nx]=1; q.push({x:nx,y:ny});
              if(nx<minX)minX=nx; if(nx>maxX)maxX=nx;
              if(ny<minY)minY=ny; if(ny>maxY)maxY=ny;
            }
          }
          if (maxX-minX+1 < MIN_CW || maxY-minY+1 < MIN_CH) continue;

          /* Crop from ORIGINAL canvas (not mask) */
          const rx = Math.max(0, Math.round(minX*GRID_PT*SCALE) - 6);
          const ry = Math.max(0, Math.round(minY*GRID_PT*SCALE) - 6);
          const rw = Math.min(cW-rx, Math.round((maxX-minX+1)*GRID_PT*SCALE) + 12);
          const rh = Math.min(cH-ry, Math.round((maxY-minY+1)*GRID_PT*SCALE) + 12);
          if (rw < 10 || rh < 10) continue;

          const crop = document.createElement('canvas');
          crop.width = rw; crop.height = rh;
          const cCtx = crop.getContext('2d');
          cCtx.fillStyle='#fff'; cCtx.fillRect(0,0,rw,rh);
          cCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);

          const u8 = await canvasToPng(crop);
          if (u8) {
            // sortY in PDF Y-up coords (top of cropped region in PDF space)
            const pdfYTop = H_pt - (ry / SCALE);
            vectorImgs.push({
              sortY : pdfYTop,
              imgU8 : u8,
              dispW : Math.round(rw / SCALE),
              dispH : Math.round(rh / SCALE)
            });
          }
        }
      }
    } catch(e){ console.warn('[PDF2WORD] vector scan:', e); }

    /* ── 5. Build and sort all blocks ─────────────────────────────────────── */
    const sortedYs = [...lineMap.keys()].sort((a,b) => b-a);
    const blocks   = [];

    for (let i = 0; i < sortedYs.length; i++) {
      const lineY = sortedYs[i];
      let sp = 80;
      if (i > 0) {
        const gap = sortedYs[i-1] - lineY;
        if (gap > 18) sp = Math.min(Math.round(gap * 14), 1440);
      }
      blocks.push({ type:'text', sortY:lineY, sp, toks:lineMap.get(lineY) });
    }
    for (const img of rasterImgs) blocks.push({ type:'img', sortY:img.sortY, sp:180, img });
    for (const img of vectorImgs) blocks.push({ type:'img', sortY:img.sortY, sp:100, img });

    /* highest PDF Y = page top = comes first in Word */
    blocks.sort((a, b) => b.sortY - a.sortY);

    /* ── 6. Convert blocks → docx paragraphs ─────────────────────────────── */
    for (const blk of blocks) {

      /* ── Image paragraph ──────────────────────────────────────────────────── */
      if (blk.type === 'img') {
        try {
          const { imgU8, dispW, dispH } = blk.img;
          const sc  = Math.min(1, MAX_W_PX / Math.max(1, dispW));
          const ow  = Math.round(dispW * sc);
          const oh  = Math.round(dispH * sc);
          children.push(new docx.Paragraph({
            alignment : docx.AlignmentType.CENTER,
            spacing   : { before: blk.sp, after: blk.sp, line: 276 },
            children  : [new docx.ImageRun({ data:imgU8, transformation:{width:ow,height:oh}, type:'png' })]
          }));
        } catch(e){ console.warn('[PDF2WORD] imgRun:', e); }
        continue;
      }

      /* ── Text paragraph ───────────────────────────────────────────────────── */
      const toks    = blk.toks;
      const fullStr = toks.map(t=>t.str).join('');
      const lineAr  = dominantArabic(fullStr);

      /*
       * ══ KEY ARABIC FIX ══════════════════════════════════════════════════════
       *
       * In PDFs, Arabic text is stored in VISUAL order (the way glyphs appear
       * on screen from left to right).  Each text item's X coordinate is the
       * LEFT edge of that glyph cluster.
       *
       * Arabic reads right-to-left.  On screen, the FIRST logical Arabic char
       * sits at the RIGHTMOST position (largest X), and the last sits at the
       * LEFTMOST position (smallest X).
       *
       * If we sort by X ascending (left→right) we get REVERSE logical order,
       * which when Word renders RTL it reverses again → double reversal = wrong.
       *
       * Fix: sort Arabic-dominant lines by X DESCENDING (right→left visual)
       * which gives LOGICAL order.  Word's Unicode BiDi engine then correctly
       * shapes and displays the logical string right-to-left.
       *
       * English/numeric items within the line may also be present; they will
       * be tagged with rightToLeft:false so Word treats them LTR.
       * ════════════════════════════════════════════════════════════════════════
       */
      if (lineAr) {
        toks.sort((a, b) => b.x - a.x);  // Right→Left: logical Arabic order
      } else {
        toks.sort((a, b) => a.x - b.x);  // Left→Right: logical Latin order
      }

      const runs = [];
      for (const tok of toks) {
        const segs = splitBidi(tok.str);
        for (const seg of segs) {
          if (!seg.text) continue;
          const runFont = seg.arabic ? 'Arial' : tok.font;
          const runDef  = {
            text       : seg.text,
            font       : runFont,
            size       : ptToHp(tok.sizePt),
            color      : tok.hex,
            bold       : tok.bold,
            italics    : tok.ital,
            rightToLeft: seg.arabic
          };
          if (tok.ul) {
            runDef.underline = { type: docx.UnderlineType.SINGLE, color: tok.hex };
          }
          runs.push(new docx.TextRun(runDef));
        }
      }
      if (!runs.length) continue;

      children.push(new docx.Paragraph({
        bidirectional: lineAr,
        alignment    : lineAr ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
        spacing      : { before: blk.sp, after: 60, line: 276, lineRule: docx.LineRuleType.AUTO },
        children     : runs
      }));
    }

    /* Page break (not after last page) */
    if (pn < numPages) {
      children.push(new docx.Paragraph({
        pageBreakBefore: true,
        children: [new docx.TextRun('')]
      }));
    }
  }

  /* ── 7. Assemble document ────────────────────────────────────────────────── */
  prog(93, 'Building .docx…');
  const doc = new docx.Document({
    sections: [{
      properties: {},
      children  : children.length
        ? children
        : [new docx.Paragraph({ children: [new docx.TextRun('(No content extracted)')] })]
    }]
  });
  return docx.Packer.toBlob(doc);
}`;

code = code.substring(0, si) + fn + code.substring(ei);
fs.writeFileSync(filePath, code, 'utf8');

const fsize = fs.statSync(filePath).size;
console.log('Success. File size:', fsize, 'bytes');

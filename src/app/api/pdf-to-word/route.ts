import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";
const pdfParse = require("pdf-parse");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    const data = await pdfParse(buffer);
    const textContent = data.text;

    // Split text into paragraphs
    const lines = textContent.split('\n').filter((line: string) => line.trim().length > 0);

    // Create a new Word document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: lines.map((line: string) => {
            // Basic RTL detection for Arabic
            const isArabic = /[\u0600-\u06FF]/.test(line);
            return new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  rightToLeft: isArabic,
                  font: isArabic ? "Arial" : "Calibri",
                }),
              ],
              bidirectional: isArabic,
            });
          }),
        },
      ],
    });

    // Generate buffer
    const docxBuffer = await Packer.toBuffer(doc);

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="converted.docx"`,
      },
    });

  } catch (error: any) {
    console.error("PDF to Word Error:", error);
    return NextResponse.json({ error: error.message || "Failed to convert" }, { status: 500 });
  }
}

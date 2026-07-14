import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont('Helvetica');
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i} - Test Content`, { x: 50, y: 700, size: 20, font });
    page.drawText('This is a test PDF document for PDFBox tools.', { x: 50, y: 650, size: 12, font });
    page.drawText('Lorem ipsum dolor sit amet, consectetur adipiscing elit.', { x: 50, y: 620, size: 12, font });
  }
  const bytes = await doc.save();
  fs.writeFileSync('C:/Users/capy1/Desktop/front end2/test-sample.pdf', Buffer.from(bytes));
  console.log('Created test-sample.pdf (3 pages)');

  const doc2 = await PDFDocument.create();
  for (let i = 1; i <= 5; i++) {
    const page = doc2.addPage([612, 792]);
    page.drawText(`Page ${i} of 5`, { x: 50, y: 700, size: 24, font });
  }
  const bytes2 = await doc2.save();
  fs.writeFileSync('C:/Users/capy1/Desktop/front end2/test-5pages.pdf', Buffer.from(bytes2));
  console.log('Created test-5pages.pdf (5 pages)');
}

main().catch(console.error);

import os
import re

# Read index.html to extract navbar and footer
with open('index.html', 'r', encoding='utf-8') as f:
    index_html = f.read()

# Extract navbar
nav_match = re.search(r'<!-- ===== NAVBAR ===== -->(.*?)<!-- Mobile Menu -->.*?</div>', index_html, re.DOTALL)
if nav_match:
    navbar_content = nav_match.group(0)
else:
    print("Could not find navbar")
    exit(1)

# Extract footer
footer_match = re.search(r'<!-- ===== FOOTER ===== -->(.*?)</footer>', index_html, re.DOTALL)
if footer_match:
    footer_content = footer_match.group(0)
else:
    print("Could not find footer")
    exit(1)

articles = [
    {
        "slug": "how-to-protect-sensitive-pdf-documents",
        "title": "How to Protect Sensitive PDF Documents",
        "date": "Aug 15, 2026",
        "excerpt": "Learn the best practices for securing your PDFs before emailing them, including password protection and local processing.",
        "content": """
            <p>Sharing sensitive information over email or cloud storage can be risky. Whether it's a financial statement, a legal contract, or personal medical records, ensuring your PDF is protected is crucial.</p>
            <h2>1. Use Strong Password Protection</h2>
            <p>Adding a password to your PDF is the first line of defense. Using standard AES-128 or AES-256 encryption ensures that only authorized individuals can open the document.</p>
            <h2>2. Process Files Locally</h2>
            <p>One of the biggest security risks is uploading sensitive documents to online converters. These servers can store, read, or even get hacked, exposing your data. This is why <strong>browser-based tools like PDF BOX</strong> are vastly superior. The processing happens locally on your device, meaning the file never leaves your computer.</p>
            <h2>3. Redact Sensitive Information</h2>
            <p>If you don't want to password-protect the entire document, consider blacking out or removing specific text before sharing.</p>
        """
    },
    {
        "slug": "pdf-vs-docx-when-to-use-which-format",
        "title": "PDF vs. DOCX: When to Use Which Format",
        "date": "Aug 12, 2026",
        "excerpt": "A comprehensive guide on when you should be using PDF documents versus Microsoft Word DOCX files.",
        "content": """
            <p>Understanding the difference between PDF (Portable Document Format) and DOCX (Microsoft Word Document) can save you hours of formatting headaches.</p>
            <h2>When to use DOCX</h2>
            <p>DOCX is designed for editing. If a document is a work in progress and requires collaboration, tracked changes, and heavy text editing, DOCX is the absolute best choice.</p>
            <h2>When to use PDF</h2>
            <p>PDF is designed for sharing and archiving. It locks down the formatting, fonts, and layout so that the document looks exactly the same on any device or operating system.</p>
            <ul>
                <li><strong>Resumes:</strong> Always send resumes as PDFs.</li>
                <li><strong>Contracts:</strong> PDFs cannot be easily altered without leaving a trace.</li>
                <li><strong>Printing:</strong> Print shops strongly prefer PDFs.</li>
            </ul>
        """
    },
    {
        "slug": "how-to-compress-large-pdfs",
        "title": "How to Compress Large PDFs Without Losing Quality",
        "date": "Aug 10, 2026",
        "excerpt": "Struggling with email attachment limits? Here is how you can easily compress large PDF files.",
        "content": """
            <p>We've all been there: you try to email an important document, and you get hit with the dreaded "Attachment exceeds size limit" error. PDFs, especially those with high-resolution images, can become massive.</p>
            <h2>Why do PDFs get so large?</h2>
            <p>Most of the time, the culprit is unoptimized images. When you insert a 10MB photo into a Word document and save it as a PDF, the PDF retains a lot of that heavy image data.</p>
            <h2>How to shrink them</h2>
            <p>Using a tool like the <strong>PDF BOX Compressor</strong>, you can instantly reduce the file size. The tool intelligently optimizes the internal structure of the PDF and removes unnecessary metadata, often reducing the file size by 50-80% without any noticeable drop in quality.</p>
        """
    },
    {
        "slug": "guide-to-merging-pdf-files",
        "title": "The Ultimate Guide to Merging PDF Files",
        "date": "Aug 05, 2026",
        "excerpt": "Combine multiple documents, images, and reports into a single, cohesive PDF file in seconds.",
        "content": """
            <p>Whether you're a student compiling research or a professional assembling a monthly report, merging PDFs is an essential skill.</p>
            <h2>The Challenge of Multiple Files</h2>
            <p>Sending someone 15 different PDF attachments is guaranteed to cause confusion. Merging them into a single file with a logical flow makes life easier for the recipient.</p>
            <h2>How to Merge Easily</h2>
            <p>Using the PDF BOX Merge tool, you can simply drag and drop your files, rearrange them into the correct order, and click merge. Since the process runs locally in your browser, it's instantaneous and completely private.</p>
        """
    },
    {
        "slug": "why-browser-based-tools-are-safer",
        "title": "Why Browser-Based PDF Tools Are Safer",
        "date": "Aug 01, 2026",
        "excerpt": "Understand the privacy implications of cloud-based PDF converters versus modern, browser-based local processing.",
        "content": """
            <p>For years, modifying a PDF meant either buying expensive software or uploading your file to a sketchy website. Today, modern web technologies have changed the game.</p>
            <h2>The Danger of Cloud Converters</h2>
            <p>When you upload a file to a cloud converter, you are literally giving them a copy of your document. You have to trust that they will delete it, that their servers are secure, and that they aren't reading your data to sell it.</p>
            <h2>The Power of Local Processing</h2>
            <p>Tools like PDF BOX use WebAssembly and JavaScript to process the PDF <em>inside your browser</em>. The file never leaves your computer. Your internet connection could drop out completely, and the tool would still work.</p>
        """
    },
    {
        "slug": "how-to-extract-pages-from-pdf",
        "title": "How to Extract Specific Pages from a PDF",
        "date": "Jul 28, 2026",
        "excerpt": "Need just one page from a 100-page document? Here is how to split and extract pages efficiently.",
        "content": """
            <p>Sometimes you receive a massive manual or a long report, but you only need a single page or a specific chapter.</p>
            <h2>Splitting vs Extracting</h2>
            <p>Splitting usually refers to breaking a document into multiple smaller files (e.g., a 10-page doc into ten 1-page docs). Extracting is about pulling out a specific range (e.g., pages 4-7) into a new file.</p>
            <h2>Using the Extract Tool</h2>
            <p>With our free tool, you just select the file, type in the page range (like '4-7' or '1, 5, 9'), and instantly get a new, clean PDF containing only what you need.</p>
        """
    },
    {
        "slug": "add-watermarks-to-pdf",
        "title": "Why You Should Add Watermarks to Your PDFs",
        "date": "Jul 20, 2026",
        "excerpt": "Protect your intellectual property by adding custom text watermarks to your documents.",
        "content": """
            <p>If you are sharing original research, photography, or proprietary business information, watermarking is a simple but effective deterrent against unauthorized sharing.</p>
            <h2>What makes a good watermark?</h2>
            <p>A good watermark should be visible enough to deter theft but transparent enough not to obscure the underlying content. Diagonal text across the center of the page is the industry standard.</p>
            <p>Using the PDF BOX Watermark tool, you can easily overlay custom text across all pages of your document before distribution.</p>
        """
    },
    {
        "slug": "converting-images-to-pdf",
        "title": "Converting Images to PDF: Best Practices",
        "date": "Jul 15, 2026",
        "excerpt": "Learn how to combine multiple JPG or PNG images into a single, highly readable PDF document.",
        "content": """
            <p>Have you ever taken photos of a physical document and needed to submit them online? Submitting 5 separate JPG files looks unprofessional. Converting them into a single PDF is the answer.</p>
            <h2>Maintain Quality</h2>
            <p>When converting, make sure your original images are well-lit and legible. A PDF is just a container; it won't fix a blurry photo.</p>
            <p>Our Images to PDF tool allows you to select multiple images, arrange them, and combine them into a single, standardized document perfectly suited for professional submission.</p>
        """
    },
    {
        "slug": "how-to-rotate-scanned-pdfs",
        "title": "How to Fix Upside-Down Scanned PDFs",
        "date": "Jul 10, 2026",
        "excerpt": "Scanners often get the orientation wrong. Here's how to permanently rotate your PDF pages.",
        "content": """
            <p>We've all received that one scanned document where half the pages are upside down and the other half are sideways.</p>
            <h2>Viewing vs. Saving</h2>
            <p>Most PDF viewers let you rotate the page temporarily, but the next time you open it, it's upside down again. You need a tool that modifies the actual file.</p>
            <p>The PDF BOX Rotate tool permanently changes the rotation metadata of the pages so that it opens correctly on every device, forever.</p>
        """
    },
    {
        "slug": "benefits-of-pdf-a-for-archiving",
        "title": "The Benefits of PDF/A for Long-Term Archiving",
        "date": "Jul 05, 2026",
        "excerpt": "An introduction to the PDF/A standard and why it is crucial for archiving digital documents.",
        "content": """
            <p>Standard PDFs are great, but what happens if you try to open one 50 years from now, and the fonts it used no longer exist?</p>
            <h2>Enter PDF/A</h2>
            <p>PDF/A is an ISO-standardized version of the Portable Document Format specialized for use in the archiving and long-term preservation of electronic documents.</p>
            <p>It prohibits features ill-suited for long-term archiving, such as font linking (as opposed to font embedding) and encryption. This ensures the document can be reproduced exactly the same way using various software for decades to come.</p>
        """
    },
    {
        "slug": "reduce-carbon-footprint-digital-docs",
        "title": "Reducing Your Carbon Footprint with Digital Documents",
        "date": "Jun 28, 2026",
        "excerpt": "How moving from paper to digital PDFs can help your business become more environmentally friendly.",
        "content": """
            <p>The shift towards a paperless office is not just about efficiency; it's also about sustainability.</p>
            <h2>The Cost of Paper</h2>
            <p>Printing requires paper, ink, and electricity, and physically storing or mailing those documents has a significant carbon footprint.</p>
            <h2>Digital Alternatives</h2>
            <p>By utilizing digital signatures, PDF forms, and electronic archiving, businesses can drastically reduce their environmental impact while saving money on office supplies.</p>
        """
    },
    {
        "slug": "understanding-pdf-encryption",
        "title": "Understanding PDF Encryption and Security",
        "date": "Jun 20, 2026",
        "excerpt": "A deep dive into how PDF encryption works and the difference between user passwords and owner passwords.",
        "content": """
            <p>When you secure a PDF, you are typically using one of two types of passwords.</p>
            <h2>User vs. Owner Passwords</h2>
            <p>The <strong>User Password</strong> (or Document Open Password) encrypts the file. You cannot even open the document without it. The <strong>Owner Password</strong> (or Permissions Password) allows the document to be opened, but restricts actions like printing, copying text, or editing.</p>
            <p>Always use a User Password if the contents are truly confidential.</p>
        """
    },
    {
        "slug": "extracting-text-from-pdf",
        "title": "How to Extract Text from a PDF (OCR)",
        "date": "Jun 15, 2026",
        "excerpt": "Learn about Optical Character Recognition (OCR) and how to make scanned PDFs searchable.",
        "content": """
            <p>If you scan a piece of paper, the resulting PDF is essentially just a photograph of text. You can't select it, copy it, or search for keywords.</p>
            <h2>What is OCR?</h2>
            <p>Optical Character Recognition (OCR) analyzes the image and converts the shapes of the letters into actual digital text. Running OCR on a scanned document makes it searchable and significantly more useful.</p>
        """
    },
    {
        "slug": "future-of-document-management",
        "title": "The Future of Document Management",
        "date": "Jun 10, 2026",
        "excerpt": "Exploring upcoming trends in how we handle digital documents and files.",
        "content": """
            <p>The way we manage documents is constantly evolving. From physical filing cabinets to local hard drives, and now to cloud storage and AI-powered categorization.</p>
            <h2>AI and Documents</h2>
            <p>In the near future, AI will be able to automatically categorize, summarize, and extract key data points from vast archives of PDFs, making document retrieval instantaneous and context-aware.</p>
        """
    },
    {
        "slug": "how-to-convert-pdf-to-word",
        "title": "How to Convert PDF to Word Reliably",
        "date": "Jun 01, 2026",
        "excerpt": "Tips for getting the best possible results when converting a PDF back into an editable Word document.",
        "content": """
            <p>Converting a PDF to a Word document is notoriously difficult because PDFs don't understand concepts like 'paragraphs' or 'margins'—they only know exactly where a character should be placed on a page.</p>
            <h2>Using the Right Tool</h2>
            <p>Our new PDF to Word tool analyzes the layout and attempts to reconstruct the paragraphs and tables. For best results, use documents that were originally born-digital (exported directly from Word or Google Docs) rather than scanned images.</p>
        """
    }
]

# Generate blog.html
blog_html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/png" href="./favicon.png" />
  <title>Blog - PDF BOX Guides & Tips</title>
  <meta name="description" content="Read our latest articles, guides, and tips on managing, securing, and editing PDF documents." />
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  {navbar_content}

  <header class="blog-header">
    <h1 class="blog-title">PDF BOX <span class="gradient-text">Blog</span></h1>
    <p class="blog-subtitle">Expert guides, tips, and insights on managing your documents securely and efficiently.</p>
  </header>

  <main class="blog-container">
    <div class="blog-grid" id="blogGrid">
"""

for article in articles:
    blog_html_content += f"""
      <article class="blog-card" data-title="{article['title'].lower()}">
        <span class="blog-date">{article['date']}</span>
        <h3>{article['title']}</h3>
        <p>{article['excerpt']}</p>
        <a href="./articles/{article['slug']}.html" class="blog-read-more">
          Read Article
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </a>
      </article>
"""

blog_html_content += f"""
    </div>
  </main>

  {footer_content}

  <!-- Script for search functionality -->
  <script>
    document.addEventListener("DOMContentLoaded", () => {{
      const params = new URLSearchParams(window.location.search);
      const query = params.get("q");
      if (query) {{
        const searchTerms = query.toLowerCase().split(' ');
        const cards = document.querySelectorAll(".blog-card");
        let hasResults = false;
        cards.forEach(card => {{
          const title = card.getAttribute("data-title");
          const matches = searchTerms.every(term => title.includes(term));
          if (matches) {{
            card.style.display = "flex";
            hasResults = true;
          }} else {{
            card.style.display = "none";
          }}
        }});
        if (!hasResults) {{
          document.getElementById("blogGrid").innerHTML = "<p style='grid-column: 1/-1; text-align:center; color: var(--text-secondary);'>No articles found matching your search.</p>";
        }}
      }}
    }});
  </script>
</body>
</html>
"""

with open('blog.html', 'w', encoding='utf-8') as f:
    f.write(blog_html_content)

print("Generated blog.html")

# Create articles directory
os.makedirs('articles', exist_ok=True)

# Adjust navbar and footer for subdirectories (need to fix relative links)
# Change ./style.css to ../style.css
# Change ./index.html to ../index.html
# Change ./about.html to ../about.html etc.
nav_sub = navbar_content.replace('href="./', 'href="../').replace('src="./', 'src="../').replace('href=".', 'href="..')
# Fix hash links like href="#tools" -> href="../index.html#tools"
nav_sub = re.sub(r'href="#([a-zA-Z0-9_-]+)"', r'href="../index.html#\1"', nav_sub)
nav_sub = nav_sub.replace("window.location.href='./blog.html?q='", "window.location.href='../blog.html?q='")

footer_sub = footer_content.replace('href="./', 'href="../').replace("onclick=\"openModal('", "onclick=\"window.location.href='../index.html'\"")

for article in articles:
    article_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/png" href="../favicon.png" />
  <title>{article['title']} - PDF BOX</title>
  <meta name="description" content="{article['excerpt']}" />
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
  {nav_sub}

  <header class="article-header">
    <a href="../blog.html" class="article-back">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      Back to Blog
    </a>
    <h1 class="article-title">{article['title']}</h1>
    <div class="article-meta">
      <span>Published on {article['date']}</span>
      <span>•</span>
      <span>PDF BOX Guides</span>
    </div>
  </header>

  <main class="article-content">
    {article['content']}
  </main>

  {footer_sub}
</body>
</html>
"""
    with open(f"articles/{article['slug']}.html", 'w', encoding='utf-8') as f:
        f.write(article_html)

print("Generated 15 articles in articles/")

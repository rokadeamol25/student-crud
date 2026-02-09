# Docs

## USER_GUIDE.md (English)

Step-by-step user guide for the Billing app: login, products, customers, suppliers, purchase bills, invoices, reports, and settings, with examples.

## USER_GUIDE_MARATHI.md (मराठी)

Same guide in Marathi (Devanagari). To generate PDF:  
`npx --yes md-to-pdf docs/USER_GUIDE_MARATHI.md`

### Generate PDF from USER_GUIDE.md (no Pandoc needed)

**Option 1 — npx (no install)**  
From the project root, run (downloads the tool once, then creates the PDF):

```bash
npx --yes md-to-pdf docs/USER_GUIDE.md
```

The PDF is created as `docs/USER_GUIDE.pdf`. If you want a different path:

```bash
npx --yes md-to-pdf docs/USER_GUIDE.md -o USER_GUIDE.pdf
```

**Option 2 — VS Code**  
1. Open `docs/USER_GUIDE.md` in VS Code.  
2. Install the **“Markdown PDF”** extension (by yzane).  
3. Right-click in the editor → **Markdown PDF: Export (pdf)**.  
4. The PDF is saved in the same folder (or as set in the extension).

**Option 3 — Browser (no extra software)**  
1. Open `docs/USER_GUIDE.md` in VS Code and open **Preview** (right-click → Open Preview, or the preview icon).  
2. Or view the file on GitHub if the repo is pushed.  
3. Press **Ctrl+P** (Windows/Linux) or **Cmd+P** (Mac) → choose **Save as PDF** or **Print to PDF** as the destination.

**Option 4 — Online converter**  
1. Open https://www.markdowntopdf.com/ or https://cloudconvert.com/md-to-pdf  
2. Upload `docs/USER_GUIDE.md` and download the generated PDF.

**If you have Pandoc**  
```bash
pandoc docs/USER_GUIDE.md -o docs/USER_GUIDE.pdf
```

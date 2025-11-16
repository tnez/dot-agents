---
name: markdown-to-pdf
description: Convert Markdown documents to professional PDF files with syntax highlighting, custom templates, and BibTeX citations. Use when creating printable documents, reports, or academic papers from Markdown.
license: MIT
metadata:
  author: tnez
  version: "1.0.0"
---

# Markdown to PDF

Convert Markdown files to professional, well-formatted PDF documents using Pandoc with modern templates and extensive customization options.

## When to Use This Skill

Use markdown-to-pdf when you need to:

- Convert Markdown documents to PDF for printing or sharing
- Generate professional technical documentation
- Create academic papers with citations
- Produce reports with code blocks and syntax highlighting
- Export notes or writing to a portable format
- Generate PDFs with custom styling and templates

## Prerequisites

This skill requires the following to be installed:

1. **Pandoc** (document converter)

   ```bash
   # macOS
   brew install pandoc

   # Ubuntu/Debian
   apt-get install pandoc
   ```

2. **LaTeX** (PDF rendering engine)

   ```bash
   # macOS
   brew install --cask basictex
   # Then install additional packages
   sudo tlmgr install collection-fontsrecommended

   # Ubuntu/Debian
   apt-get install texlive texlive-fonts-extra
   ```

3. **Eisvogel Template** (optional, for modern styling)

   ```bash
   # Download and install
   curl -L https://github.com/Wandmalfarbe/pandoc-latex-template/releases/latest/download/Eisvogel.tar.gz -o eisvogel.tar.gz
   tar -xzf eisvogel.tar.gz
   mkdir -p ~/.pandoc/templates
   mv eisvogel.latex ~/.pandoc/templates/
   ```

To verify installation:

```bash
pandoc --version
pdflatex --version
ls ~/.pandoc/templates/eisvogel.latex  # If using Eisvogel
```

## Conversion Process

### Step 1: Prepare Your Markdown

Ensure your Markdown file is ready for conversion:

1. **Check for valid Markdown syntax**
   - Headers, lists, code blocks, images
   - Links should be properly formatted

2. **Add YAML frontmatter** (optional but recommended):

   ```yaml
   ---
   title: "Document Title"
   author: "Your Name"
   date: "2025-11-15"
   ---
   ```

3. **Verify file paths** for images and assets are correct

### Step 2: Choose Conversion Options

Determine which conversion approach fits your needs:

**Basic Conversion** (default Pandoc styling):

```bash
python scripts/convert.py input.md -o output.pdf
```

**Modern Template** (Eisvogel - recommended):

```bash
python scripts/convert.py input.md -o output.pdf --template eisvogel
```

**With Custom Variables**:

```bash
python scripts/convert.py input.md -o output.pdf \
  --template eisvogel \
  --var linkcolor=blue \
  --var mainfont="Georgia"
```

**With Citations** (requires .bib file):

```bash
python scripts/convert.py input.md -o output.pdf \
  --template eisvogel \
  --bibliography references.bib
```

### Step 3: Run the Conversion

Execute the conversion script:

```bash
# Show all available options
python scripts/convert.py --help

# Basic usage
python scripts/convert.py document.md -o document.pdf

# With Eisvogel template and blue links
python scripts/convert.py document.md -o document.pdf \
  --template eisvogel \
  --var linkcolor=blue

# With syntax highlighting theme
python scripts/convert.py document.md -o document.pdf \
  --template eisvogel \
  --highlight-style zenburn
```

### Step 4: Review Output

1. **Open the generated PDF** to verify formatting
2. **Check for issues**:
   - Missing images
   - Broken code blocks
   - Incorrect syntax highlighting
   - Citation formatting (if using BibTeX)
3. **Iterate** with different options if needed

## Configuration File

For repeated conversions with the same settings, create a `pdf-config.yaml`:

```yaml
# pdf-config.yaml
template: eisvogel
variables:
  linkcolor: blue
  mainfont: Georgia
  geometry: margin=1in
highlight-style: zenburn
bibliography: references.bib
```

Then use:

```bash
python scripts/convert.py document.md -o output.pdf --config pdf-config.yaml
```

## Advanced Features

### Syntax Highlighting Themes

Available themes (use with `--highlight-style`):

- `pygments` (default)
- `tango`
- `espresso`
- `zenburn`
- `kate`
- `monochrome`
- `breezedark`
- `haddock`

Preview themes:

```bash
python scripts/convert.py --list-highlight-styles
```

### Custom Variables

Common Pandoc variables for Eisvogel template:

```yaml
titlepage: true # Add a title page
titlepage-color: "1A1A1A" # Title page background
titlepage-text-color: "FFFFFF"
toc: true # Include table of contents
toc-own-page: true # TOC on separate page
linkcolor: blue # Hyperlink color
codeBlockCaptions: true # Show code block captions
listings: true # Use listings package for code
```

### Image Borders and Styling

Add borders to images using LaTeX header includes:

```bash
python scripts/convert.py document.md -o output.pdf \
  --template eisvogel \
  --header-include '\usepackage[export]{adjustbox}'
```

### BibTeX Citations

1. Create a `.bib` file with your references:

   ```bibtex
   @article{knuth1984,
     title={Literate Programming},
     author={Knuth, Donald E.},
     journal={The Computer Journal},
     year={1984}
   }
   ```

2. Reference in Markdown:

   ```markdown
   As described by @knuth1984, literate programming...
   ```

3. Convert with bibliography:

   ```bash
   python scripts/convert.py paper.md -o paper.pdf \
     --bibliography references.bib \
     --csl ieee.csl  # Citation style (optional)
   ```

## Examples

### Example 1: Simple Document Conversion

**Input** (`notes.md`):

```markdown
# Meeting Notes

## Action Items

- Review PR #123
- Update documentation

## Code Review

\`\`\`python
def hello():
print("Hello, world!")
\`\`\`
```

**Command**:

```bash
python scripts/convert.py notes.md -o notes.pdf
```

**Output**: Basic PDF with default styling

### Example 2: Technical Documentation with Eisvogel

**Input** (`api-docs.md`):

```markdown
---
title: "API Documentation"
author: "Engineering Team"
date: "2025-11-15"
---

# REST API Reference

## Authentication

All requests require Bearer token...

\`\`\`javascript
fetch('/api/users', {
headers: {
'Authorization': 'Bearer token123'
}
})
\`\`\`
```

**Command**:

```bash
python scripts/convert.py api-docs.md -o api-docs.pdf \
  --template eisvogel \
  --var linkcolor=blue \
  --var titlepage=true \
  --highlight-style zenburn
```

**Output**: Professional PDF with title page, syntax-highlighted code, and blue hyperlinks

### Example 3: Academic Paper with Citations

**Input** (`paper.md`):

```markdown
---
title: "Research Paper"
author: "Dr. Smith"
date: "2025-11-15"
bibliography: references.bib
---

# Introduction

Recent work by @knuth1984 demonstrates...

# References
```

**References** (`references.bib`):

```bibtex
@article{knuth1984,
  title={Literate Programming},
  author={Knuth, Donald E.},
  journal={The Computer Journal},
  year={1984}
}
```

**Command**:

```bash
python scripts/convert.py paper.md -o paper.pdf \
  --template eisvogel \
  --bibliography references.bib \
  --csl ieee.csl
```

**Output**: Academic paper with properly formatted citations and reference list

### Example 4: Using Configuration File

**Config** (`pdf-config.yaml`):

```yaml
template: eisvogel
variables:
  linkcolor: blue
  titlepage: true
  toc: true
  geometry: margin=1.25in
highlight-style: tango
```

**Command**:

```bash
python scripts/convert.py document.md -o output.pdf --config pdf-config.yaml
```

**Output**: PDF with all settings from config file applied

## Troubleshooting

### Missing Fonts Error

```text
Error: Font 'ClearSans' not found
```

**Solution**: Install texlive-fonts-extra package

### Template Not Found

```text
Error: template eisvogel not found
```

**Solution**: Verify template is in `~/.pandoc/templates/eisvogel.latex`

### Image Not Found

```text
Warning: Could not find image 'path/to/image.png'
```

**Solution**: Use absolute paths or paths relative to the markdown file

### LaTeX Errors

If you see LaTeX compilation errors, run with verbose flag:

```bash
python scripts/convert.py document.md -o output.pdf --verbose
```

## Best Practices

1. **Use YAML frontmatter** for document metadata
2. **Test with basic template first** before applying custom styling
3. **Keep images in same directory** or use relative paths
4. **Use configuration files** for consistent styling across documents
5. **Preview syntax highlighting themes** before choosing one
6. **Validate BibTeX** files before conversion
7. **Use version control** for both markdown and config files

## Resources

- [Pandoc User Guide](https://pandoc.org/MANUAL.html)
- [Eisvogel Template](https://github.com/Wandmalfarbe/pandoc-latex-template)
- [Pandoc Templates Repository](https://github.com/jgm/pandoc-templates)
- [Citation Styles (CSL)](https://www.zotero.org/styles)
- Conversion script: `scripts/convert.py`

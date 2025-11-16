#!/usr/bin/env python3
"""
Markdown to PDF Converter

Convert Markdown documents to professional PDF files using Pandoc with
support for templates, syntax highlighting, and BibTeX citations.
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Optional, Dict, Any
import yaml


class MarkdownToPDFConverter:
    """Handles conversion of Markdown files to PDF using Pandoc."""

    def __init__(self):
        self.pandoc_path = self._find_pandoc()

    def _find_pandoc(self) -> str:
        """Find pandoc executable."""
        try:
            result = subprocess.run(
                ["which", "pandoc"],
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            print("Error: pandoc not found. Please install pandoc first.", file=sys.stderr)
            print("  macOS: brew install pandoc", file=sys.stderr)
            print("  Ubuntu/Debian: apt-get install pandoc", file=sys.stderr)
            sys.exit(1)

    def check_dependencies(self) -> bool:
        """Check if required dependencies are installed."""
        missing = []

        # Check for xelatex (preferred) or pdflatex
        has_latex = False
        for engine in ["xelatex", "pdflatex"]:
            try:
                subprocess.run(
                    [engine, "--version"],
                    capture_output=True,
                    check=True
                )
                has_latex = True
                break
            except (subprocess.CalledProcessError, FileNotFoundError):
                continue

        if not has_latex:
            missing.append("LaTeX (install: brew install basictex or apt-get install texlive)")

        if missing:
            print("Missing dependencies:", file=sys.stderr)
            for dep in missing:
                print(f"  - {dep}", file=sys.stderr)
            return False

        return True

    def list_highlight_styles(self) -> List[str]:
        """Get list of available syntax highlighting styles."""
        try:
            result = subprocess.run(
                [self.pandoc_path, "--list-highlight-styles"],
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout.strip().split('\n')
        except subprocess.CalledProcessError:
            return []

    def build_pandoc_command(
        self,
        input_file: Path,
        output_file: Path,
        template: Optional[str] = None,
        variables: Optional[Dict[str, Any]] = None,
        highlight_style: str = "pygments",
        bibliography: Optional[Path] = None,
        csl: Optional[Path] = None,
        header_file: Optional[Path] = None,
        verbose: bool = False,
        pdf_engine: str = "xelatex"
    ) -> List[str]:
        """Build the pandoc command with all options."""
        cmd = [
            self.pandoc_path,
            str(input_file),
            "-o", str(output_file),
            f"--pdf-engine={pdf_engine}",
            f"--syntax-highlighting={highlight_style}",
        ]

        # Add template
        if template:
            cmd.extend(["--template", template])

        # Set default variables for better rendering (GitHub-like)
        default_vars = {
            "geometry": "margin=0.75in",
            "fontsize": "11pt",
            "linestretch": "1.15",
        }

        # Only set fonts if using XeLaTeX (better Unicode support)
        if pdf_engine == "xelatex":
            default_vars.update({
                "mainfont": "Arial",
                "monofont": "Courier New",
                "monofontoptions": "Scale=0.9",
            })

        # Merge with user variables (user variables take precedence)
        merged_vars = {**default_vars, **(variables or {})}

        # Add variables
        for key, value in merged_vars.items():
            cmd.extend(["-V", f"{key}={value}"])

        # Add header includes file for code wrapping
        if header_file:
            cmd.extend(["-H", str(header_file)])

        # Add bibliography
        if bibliography:
            cmd.extend(["--bibliography", str(bibliography)])
            cmd.append("--citeproc")

        # Add CSL file
        if csl:
            cmd.extend(["--csl", str(csl)])

        # Add verbose flag
        if verbose:
            cmd.append("--verbose")

        return cmd

    def create_header_file(self) -> Path:
        """Create a temporary LaTeX header file for code wrapping."""
        header_content = r"""\usepackage{fvextra}
\DefineVerbatimEnvironment{Highlighting}{Verbatim}{breaklines,breakanywhere,commandchars=\\\{\}}
"""
        # Create temp file that won't be deleted until Python exits
        temp = tempfile.NamedTemporaryFile(mode='w', suffix='.tex', delete=False)
        temp.write(header_content)
        temp.close()
        return Path(temp.name)

    def convert(
        self,
        input_file: Path,
        output_file: Path,
        **kwargs
    ) -> bool:
        """
        Convert Markdown to PDF.

        Args:
            input_file: Path to input Markdown file
            output_file: Path to output PDF file
            **kwargs: Additional conversion options

        Returns:
            True if successful, False otherwise
        """
        # Verify input file exists
        if not input_file.exists():
            print(f"Error: Input file not found: {input_file}", file=sys.stderr)
            return False

        # Create header file for code wrapping
        header_file = self.create_header_file()

        try:
            # Build command
            cmd = self.build_pandoc_command(
                input_file,
                output_file,
                header_file=header_file,
                **kwargs
            )

            # Print command if verbose
            if kwargs.get('verbose'):
                print("Running command:", ' '.join(cmd))

            # Execute pandoc
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )

            if kwargs.get('verbose') and result.stdout:
                print(result.stdout)

            print(f"✓ Successfully created: {output_file}")
            return True

        except subprocess.CalledProcessError as e:
            print(f"Error during conversion:", file=sys.stderr)
            if e.stderr:
                print(e.stderr, file=sys.stderr)
            return False
        finally:
            # Clean up temp header file
            try:
                header_file.unlink()
            except:
                pass


def load_config(config_file: Path) -> Dict[str, Any]:
    """Load configuration from YAML file."""
    try:
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)
            return config or {}
    except Exception as e:
        print(f"Error loading config file: {e}", file=sys.stderr)
        sys.exit(1)


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Convert Markdown to PDF using Pandoc",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic conversion
  %(prog)s input.md -o output.pdf

  # With Eisvogel template
  %(prog)s input.md -o output.pdf --template eisvogel

  # With custom variables
  %(prog)s input.md -o output.pdf --var linkcolor=blue

  # With bibliography
  %(prog)s paper.md -o paper.pdf --bibliography refs.bib

  # Using config file
  %(prog)s input.md -o output.pdf --config pdf-config.yaml
        """
    )

    parser.add_argument(
        "input",
        type=Path,
        nargs='?',
        help="Input Markdown file"
    )

    parser.add_argument(
        "-o", "--output",
        type=Path,
        help="Output PDF file"
    )

    parser.add_argument(
        "--template",
        help="Pandoc template to use (e.g., 'eisvogel')"
    )

    parser.add_argument(
        "--var",
        action="append",
        dest="variables",
        metavar="KEY=VALUE",
        help="Set template variable (can be used multiple times)"
    )

    parser.add_argument(
        "--highlight-style",
        default="pygments",
        help="Syntax highlighting style (default: pygments)"
    )

    parser.add_argument(
        "--pdf-engine",
        default="xelatex",
        choices=["xelatex", "pdflatex", "lualatex"],
        help="PDF engine to use (default: xelatex for Unicode support)"
    )

    parser.add_argument(
        "--bibliography",
        type=Path,
        help="BibTeX bibliography file (.bib)"
    )

    parser.add_argument(
        "--csl",
        type=Path,
        help="Citation Style Language file (.csl)"
    )

    parser.add_argument(
        "--config",
        type=Path,
        help="Load options from YAML config file"
    )

    parser.add_argument(
        "--list-highlight-styles",
        action="store_true",
        help="List available syntax highlighting styles and exit"
    )

    parser.add_argument(
        "--check-deps",
        action="store_true",
        help="Check dependencies and exit"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    converter = MarkdownToPDFConverter()

    # Handle special commands
    if args.list_highlight_styles:
        print("Available syntax highlighting styles:")
        for style in converter.list_highlight_styles():
            print(f"  - {style}")
        sys.exit(0)

    if args.check_deps:
        if converter.check_dependencies():
            print("✓ All dependencies are installed")
            sys.exit(0)
        else:
            sys.exit(1)

    # Require input and output for conversion
    if not args.input or not args.output:
        print("Error: input and output files are required for conversion", file=sys.stderr)
        print("Use --help for usage information", file=sys.stderr)
        sys.exit(1)

    # Check dependencies before conversion
    if not converter.check_dependencies():
        sys.exit(1)

    # Load config file if provided
    config = {}
    if args.config:
        config = load_config(args.config)

    # Parse variables
    variables = config.get('variables', {})
    if args.variables:
        for var in args.variables:
            if '=' in var:
                key, value = var.split('=', 1)
                variables[key] = value

    # Merge CLI args with config
    conversion_options = {
        'template': args.template or config.get('template'),
        'variables': variables if variables else None,
        'highlight_style': args.highlight_style or config.get('highlight-style', 'pygments'),
        'pdf_engine': args.pdf_engine or config.get('pdf-engine', 'xelatex'),
        'bibliography': args.bibliography or config.get('bibliography'),
        'csl': args.csl or config.get('csl'),
        'verbose': args.verbose
    }

    # Convert
    success = converter.convert(
        args.input,
        args.output,
        **conversion_options
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

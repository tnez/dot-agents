#!/usr/bin/env python3
"""
Semi-automated skill evaluation assistance.

Extracts objective metrics and generates evaluation report template.
Final scoring requires human/agent judgment.

Usage:
    python run_evaluation.py <skill-directory>
    python run_evaluation.py --help
"""

import argparse
import re
from datetime import datetime
from pathlib import Path

import yaml


def extract_skill_metadata(skill_path: Path) -> dict:
    """Extract metadata from SKILL.md."""
    skill_md = skill_path / "SKILL.md"

    if not skill_md.exists():
        return {"error": "SKILL.md not found"}

    content = skill_md.read_text(encoding="utf-8")

    # Extract YAML frontmatter
    pattern = r"^---\s*\n(.*?)\n---\s*\n(.*)$"
    match = re.match(pattern, content, re.DOTALL)

    if not match:
        return {"error": "No YAML frontmatter found"}

    frontmatter_text = match.group(1)
    body = match.group(2)

    try:
        frontmatter = yaml.safe_load(frontmatter_text)
    except yaml.YAMLError:
        return {"error": "Invalid YAML frontmatter"}

    # Calculate metrics
    word_count = len(body.split())
    line_count = len(body.split("\n"))

    # Count examples
    example_count = body.lower().count("### example")

    # Check for "when to use" section
    has_when_section = bool(re.search(r"##\s+when to use", body, re.IGNORECASE))

    # Extract sections
    sections = re.findall(r"^##\s+(.+)$", body, re.MULTILINE)

    return {
        "name": frontmatter.get("name", "unknown"),
        "description": frontmatter.get("description", ""),
        "license": frontmatter.get("license", ""),
        "word_count": word_count,
        "line_count": line_count,
        "example_count": example_count,
        "has_when_section": has_when_section,
        "sections": sections,
        "frontmatter": frontmatter,
    }


def check_bundled_resources(skill_path: Path) -> dict:
    """Check for bundled resources in skill directory."""
    resources = {
        "scripts": [],
        "templates": [],
        "assets": [],
        "references": [],
    }

    for resource_type in resources.keys():
        resource_dir = skill_path / resource_type
        if resource_dir.exists() and resource_dir.is_dir():
            resources[resource_type] = [
                f.name for f in resource_dir.iterdir() if f.is_file()
            ]

    return resources


def generate_evaluation_template(skill_path: Path, metadata: dict, resources: dict) -> str:
    """Generate evaluation report template."""
    template = f"""# Skill Evaluation Report

**Skill Name**: {metadata.get('name', 'unknown')}
**Evaluated By**: [Your name/agent ID]
**Date**: {datetime.now().strftime('%Y-%m-%d')}

---

## Executive Summary

**Total Score**: __/20 ([Excellent/Strong/Adequate/Weak/Poor])

[One paragraph summarizing overall assessment]

---

## Objective Metrics

- **Word Count**: {metadata.get('word_count', 0)} words
- **Example Count**: {metadata.get('example_count', 0)} examples
- **Has "When to Use" Section**: {metadata.get('has_when_section', False)}
- **Description Length**: {len(metadata.get('description', ''))} characters

### Bundled Resources

- **Scripts**: {len(resources.get('scripts', []))} file(s) - {', '.join(resources.get('scripts', [])) or 'None'}
- **Templates**: {len(resources.get('templates', []))} file(s) - {', '.join(resources.get('templates', [])) or 'None'}
- **Assets**: {len(resources.get('assets', []))} file(s) - {', '.join(resources.get('assets', [])) or 'None'}
- **References**: {len(resources.get('references', []))} file(s) - {', '.join(resources.get('references', [])) or 'None'}

### Sections Detected

{chr(10).join(f'- {section}' for section in metadata.get('sections', []))}

---

## Dimension Scores

### Clarity: __/5

**Observations**:
- Description: "{metadata.get('description', '')[:100]}..."
- [Assess if description explains WHAT and WHEN]
- [Assess if instructions are imperative]
- [Assess language precision]

**Score Rationale**:
[Explain score]

---

### Completeness: __/5

**Observations**:
- [Check if all steps documented]
- [Check if dependencies stated]
- [Check if error handling covered]
- [Check if prerequisites listed]

**Score Rationale**:
[Explain score]

---

### Examples: __/5

**Objective Metric**: {metadata.get('example_count', 0)} example(s) found

**Observations**:
- [Assess if examples are concrete]
- [Assess if examples show inputs and outputs]
- [Assess scenario coverage]
- [Assess realism and practicality]

**Score Rationale**:
[Explain score]

---

### Focus: __/5

**Observations**:
- [Can you describe purpose in one sentence?]
- [Is scope appropriate?]
- [Should this be split?]
- [Are responsibilities clear?]

**Score Rationale**:
[Explain score]

---

## Summary Table

| Dimension | Score | Notes |
|-----------|-------|-------|
| Clarity | __/5 | |
| Completeness | __/5 | |
| Examples | __/5 | |
| Focus | __/5 | |
| **Total** | **__/20** | |

---

## Detailed Analysis

### Strengths

1. [Identify key strength]
2. [Identify key strength]
3. [Identify key strength]

### Weaknesses

1. [Identify key weakness]
2. [Identify key weakness]
3. [Identify key weakness]

---

## Recommendations

### High Priority (Critical for improvement)

1. [Specific recommendation]
   - **Why**: [Rationale]
   - **Impact**: [Expected improvement]

### Medium Priority (Should address)

1. [Specific recommendation]
   - **Why**: [Rationale]
   - **Impact**: [Expected improvement]

### Low Priority (Nice to have)

1. [Specific recommendation]
   - **Why**: [Rationale]
   - **Impact**: [Expected improvement]

---

## Deployment Recommendation

- [ ] **Deploy as-is** - Meets quality standards (≥18/20)
- [ ] **Deploy with minor improvements** - Strong quality (15-17/20)
- [ ] **Refine before deployment** - Adequate but needs work (12-14/20)
- [ ] **Major revision required** - Not ready for deployment (<12/20)

---

## Next Steps

1. [Immediate action]
2. [Follow-up action]
3. [Re-evaluation timing]
"""

    return template


def main():
    parser = argparse.ArgumentParser(
        description="Generate skill evaluation report template with objective metrics"
    )
    parser.add_argument(
        "skill_directory",
        type=Path,
        help="Path to skill directory to evaluate",
    )
    parser.add_argument(
        "-o", "--output",
        type=Path,
        help="Output file path (default: stdout)",
    )
    args = parser.parse_args()

    # Extract metadata and resources
    metadata = extract_skill_metadata(args.skill_directory)

    if "error" in metadata:
        print(f"Error: {metadata['error']}")
        return 1

    resources = check_bundled_resources(args.skill_directory)

    # Generate template
    template = generate_evaluation_template(args.skill_directory, metadata, resources)

    # Output
    if args.output:
        args.output.write_text(template)
        print(f"Evaluation template written to: {args.output}")
    else:
        print(template)

    return 0


if __name__ == "__main__":
    exit(main())

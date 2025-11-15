#!/usr/bin/env python3
"""
Validate agent skill structure and compliance with Agent Skills Specification v1.0.

Usage:
    python validate_skill.py <skill-directory>
    python validate_skill.py --help
"""

import argparse
import re
import sys
from pathlib import Path
from typing import List, Tuple

import yaml


class SkillValidator:
    """Validates agent skills against the specification."""

    def __init__(self, skill_path: Path):
        self.skill_path = skill_path
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.passes: List[str] = []

    def validate(self) -> bool:
        """Run all validation checks. Returns True if all checks pass."""
        self._check_directory_exists()
        self._check_skill_md_exists()

        if not self.skill_path.exists() or not (self.skill_path / "SKILL.md").exists():
            return False

        skill_md_path = self.skill_path / "SKILL.md"
        frontmatter, body = self._parse_skill_md(skill_md_path)

        if frontmatter is not None:
            self._validate_yaml_frontmatter(frontmatter)
            self._validate_name_matching(frontmatter)
            self._validate_description(frontmatter)

        if body is not None:
            self._validate_body_content(body, skill_md_path)
            self._validate_file_references(body)

        return len(self.errors) == 0

    def _check_directory_exists(self):
        """Check if skill directory exists."""
        if not self.skill_path.exists():
            self.errors.append(f"Directory does not exist: {self.skill_path}")
        elif not self.skill_path.is_dir():
            self.errors.append(f"Path is not a directory: {self.skill_path}")
        else:
            self.passes.append(f"Directory exists: {self.skill_path}")

    def _check_skill_md_exists(self):
        """Check if SKILL.md file exists."""
        skill_md = self.skill_path / "SKILL.md"
        if not skill_md.exists():
            self.errors.append("SKILL.md file not found (case-sensitive)")
        elif not skill_md.is_file():
            self.errors.append("SKILL.md exists but is not a file")
        else:
            self.passes.append("SKILL.md file exists")

    def _parse_skill_md(self, skill_md_path: Path) -> Tuple[dict | None, str | None]:
        """Parse SKILL.md file and extract YAML frontmatter and body."""
        try:
            content = skill_md_path.read_text(encoding="utf-8")
        except Exception as e:
            self.errors.append(f"Failed to read SKILL.md: {e}")
            return None, None

        # Extract YAML frontmatter
        pattern = r"^---\s*\n(.*?)\n---\s*\n(.*)$"
        match = re.match(pattern, content, re.DOTALL)

        if not match:
            self.errors.append("SKILL.md missing YAML frontmatter (must start with ---)")
            return None, None

        frontmatter_text = match.group(1)
        body = match.group(2)

        try:
            frontmatter = yaml.safe_load(frontmatter_text)
            self.passes.append("YAML frontmatter is valid")
            return frontmatter, body
        except yaml.YAMLError as e:
            self.errors.append(f"Invalid YAML frontmatter: {e}")
            return None, body

    def _validate_yaml_frontmatter(self, frontmatter: dict):
        """Validate YAML frontmatter fields."""
        # Check required fields
        required_fields = ["name", "description"]
        for field in required_fields:
            if field not in frontmatter:
                self.errors.append(f"Missing required field in YAML: '{field}'")
            else:
                self.passes.append(f"Required field present: '{field}'")

        # Validate name field
        if "name" in frontmatter:
            name = frontmatter["name"]
            if not isinstance(name, str):
                self.errors.append("Field 'name' must be a string")
            else:
                self._validate_skill_name(name)

        # Validate description field
        if "description" in frontmatter:
            desc = frontmatter["description"]
            if not isinstance(desc, str):
                self.errors.append("Field 'description' must be a string")
            elif len(desc) > 1024:
                self.errors.append(f"Description exceeds 1024 characters ({len(desc)} chars)")
            elif len(desc) > 200:
                self.warnings.append(f"Description is {len(desc)} chars (recommended ~200)")
            else:
                self.passes.append(f"Description length appropriate ({len(desc)} chars)")

    def _validate_skill_name(self, name: str):
        """Validate skill name format."""
        # Check length
        if len(name) > 64:
            self.errors.append(f"Skill name exceeds 64 characters: {len(name)}")

        # Check format: hyphen-case (lowercase alphanumeric and hyphens only)
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", name):
            self.errors.append(
                f"Skill name must be hyphen-case (lowercase, hyphens only): '{name}'"
            )
        else:
            self.passes.append(f"Skill name format is valid: '{name}'")

    def _validate_name_matching(self, frontmatter: dict):
        """Validate directory name matches YAML name field."""
        if "name" not in frontmatter:
            return

        yaml_name = frontmatter["name"]
        dir_name = self.skill_path.name

        if yaml_name != dir_name:
            self.errors.append(
                f"Directory name '{dir_name}' does not match YAML name '{yaml_name}'"
            )
        else:
            self.passes.append(f"Directory name matches YAML name: '{yaml_name}'")

    def _validate_description(self, frontmatter: dict):
        """Validate description quality."""
        if "description" not in frontmatter:
            return

        desc = frontmatter["description"].lower()

        # Check if description explains WHEN to use the skill
        when_indicators = ["when", "use when", "for", "to help", "if you need"]
        has_when = any(indicator in desc for indicator in when_indicators)

        if not has_when:
            self.warnings.append(
                "Description should explain WHEN to use the skill (contains no 'when' indicators)"
            )
        else:
            self.passes.append("Description explains when to use the skill")

    def _validate_body_content(self, body: str, skill_md_path: Path):
        """Validate SKILL.md body content."""
        # Check word count
        word_count = len(body.split())
        if word_count > 5000:
            self.warnings.append(
                f"SKILL.md body has {word_count} words (recommended <5,000)"
            )
        else:
            self.passes.append(f"SKILL.md body has {word_count} words (<5,000)")

        # Check for hardcoded credentials (simple check)
        credential_patterns = [
            r"password\s*[:=]\s*['\"].*['\"]",
            r"api[_-]?key\s*[:=]\s*['\"].*['\"]",
            r"secret\s*[:=]\s*['\"].*['\"]",
            r"token\s*[:=]\s*['\"].*['\"]",
        ]

        for pattern in credential_patterns:
            if re.search(pattern, body, re.IGNORECASE):
                self.warnings.append(
                    f"Possible hardcoded credential detected (pattern: {pattern})"
                )

    def _validate_file_references(self, body: str):
        """Validate that referenced files exist."""
        # Find markdown links and code references to local files
        patterns = [
            r"\[(.*?)\]\(((?!http)[^\)]+)\)",  # Markdown links (not HTTP)
            r"`(scripts/[^`]+)`",  # Inline code with scripts/
            r"`(templates/[^`]+)`",  # Inline code with templates/
            r"`(assets/[^`]+)`",  # Inline code with assets/
            r"`(references/[^`]+)`",  # Inline code with references/
        ]

        referenced_files = set()
        for pattern in patterns:
            for match in re.finditer(pattern, body):
                file_ref = match.group(1) if pattern.startswith(r"\[") else match.group(1)
                # Clean up the reference
                file_ref = file_ref.strip()
                if file_ref and not file_ref.startswith("http"):
                    referenced_files.add(file_ref)

        # Check if referenced files exist
        for file_ref in referenced_files:
            file_path = self.skill_path / file_ref
            if not file_path.exists():
                self.errors.append(f"Referenced file does not exist: {file_ref}")
            else:
                self.passes.append(f"Referenced file exists: {file_ref}")

    def print_report(self):
        """Print validation report."""
        print(f"\n{'='*60}")
        print(f"Skill Validation Report: {self.skill_path.name}")
        print(f"{'='*60}\n")

        if self.passes:
            print(f"✓ PASSED ({len(self.passes)})")
            for msg in self.passes:
                print(f"  ✓ {msg}")
            print()

        if self.warnings:
            print(f"⚠ WARNINGS ({len(self.warnings)})")
            for msg in self.warnings:
                print(f"  ⚠ {msg}")
            print()

        if self.errors:
            print(f"✗ FAILED ({len(self.errors)})")
            for msg in self.errors:
                print(f"  ✗ {msg}")
            print()

        # Summary
        print(f"{'='*60}")
        if self.errors:
            print("RESULT: FAILED - Fix errors before using this skill")
        elif self.warnings:
            print("RESULT: PASSED with warnings - Consider addressing warnings")
        else:
            print("RESULT: PASSED - Skill is valid")
        print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Validate agent skill structure and spec compliance"
    )
    parser.add_argument(
        "skill_directory",
        type=Path,
        help="Path to skill directory to validate",
    )
    args = parser.parse_args()

    validator = SkillValidator(args.skill_directory)
    is_valid = validator.validate()
    validator.print_report()

    sys.exit(0 if is_valid else 1)


if __name__ == "__main__":
    main()

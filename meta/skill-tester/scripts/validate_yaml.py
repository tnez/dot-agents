#!/usr/bin/env python3
"""
Validate YAML frontmatter in agent skill SKILL.md files.

Usage:
    python validate_yaml.py <skill-directory>
    python validate_yaml.py --help
"""

import argparse
import re
import sys
from pathlib import Path

import yaml


def validate_yaml_frontmatter(skill_path: Path) -> bool:
    """Validate YAML frontmatter in SKILL.md. Returns True if valid."""
    skill_md = skill_path / "SKILL.md"

    if not skill_md.exists():
        print(f"✗ SKILL.md not found in {skill_path}")
        return False

    try:
        content = skill_md.read_text(encoding="utf-8")
    except Exception as e:
        print(f"✗ Failed to read SKILL.md: {e}")
        return False

    # Extract YAML frontmatter
    pattern = r"^---\s*\n(.*?)\n---\s*\n"
    match = re.match(pattern, content, re.DOTALL)

    if not match:
        print("✗ SKILL.md missing YAML frontmatter (must start with ---)")
        return False

    frontmatter_text = match.group(1)

    try:
        frontmatter = yaml.safe_load(frontmatter_text)
        print("✓ YAML frontmatter is valid")
    except yaml.YAMLError as e:
        print(f"✗ Invalid YAML frontmatter: {e}")
        return False

    # Check required fields
    required_fields = ["name", "description"]
    all_present = True

    for field in required_fields:
        if field not in frontmatter:
            print(f"✗ Missing required field: '{field}'")
            all_present = False
        else:
            print(f"✓ Required field present: '{field}'")

    # Validate field types
    if "name" in frontmatter and not isinstance(frontmatter["name"], str):
        print("✗ Field 'name' must be a string")
        all_present = False

    if "description" in frontmatter and not isinstance(frontmatter["description"], str):
        print("✗ Field 'description' must be a string")
        all_present = False

    # Validate constraints
    if "name" in frontmatter:
        name = frontmatter["name"]
        if len(name) > 64:
            print(f"✗ Skill name exceeds 64 characters: {len(name)}")
            all_present = False

        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", name):
            print(f"✗ Skill name must be hyphen-case: '{name}'")
            all_present = False
        else:
            print(f"✓ Skill name format valid: '{name}'")

    if "description" in frontmatter:
        desc = frontmatter["description"]
        if len(desc) > 1024:
            print(f"✗ Description exceeds 1024 characters: {len(desc)}")
            all_present = False
        elif len(desc) > 200:
            print(f"⚠ Description is {len(desc)} chars (recommended ~200)")
        else:
            print(f"✓ Description length appropriate: {len(desc)} chars")

    # Check name matches directory
    if "name" in frontmatter:
        yaml_name = frontmatter["name"]
        dir_name = skill_path.name

        if yaml_name != dir_name:
            print(f"✗ Directory '{dir_name}' does not match YAML name '{yaml_name}'")
            all_present = False
        else:
            print(f"✓ Directory name matches YAML name: '{yaml_name}'")

    return all_present


def main():
    parser = argparse.ArgumentParser(
        description="Validate YAML frontmatter in SKILL.md"
    )
    parser.add_argument(
        "skill_directory",
        type=Path,
        help="Path to skill directory",
    )
    args = parser.parse_args()

    print(f"\nValidating YAML in: {args.skill_directory}\n")
    is_valid = validate_yaml_frontmatter(args.skill_directory)

    print("\n" + "="*60)
    if is_valid:
        print("RESULT: VALID")
    else:
        print("RESULT: INVALID - Fix errors above")
    print("="*60 + "\n")

    sys.exit(0 if is_valid else 1)


if __name__ == "__main__":
    main()

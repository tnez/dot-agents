---
name: SKILL-NAME-HERE
description: Brief explanation of what this skill does and when Claude should use it
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
---

# Skill Name

Brief introduction to what this skill accomplishes.

## When to Use This Skill

Use this skill when:

- Scenario requiring script execution 1
- Scenario requiring script execution 2
- Scenario requiring script execution 3

## Process

### Step 1: Preparation

Gather necessary information:

- Input requirement 1
- Input requirement 2

### Step 2: Run Scripts

This skill includes helper scripts in the `scripts/` directory.

**Check available options**:

```bash
python scripts/helper_script.py --help
```

**Run the script**:

```bash
python scripts/helper_script.py --input data.json --output results.json
```

Treat scripts as black boxes - always check `--help` first.

### Step 3: Process Results

After script execution:

1. Read output files
2. Validate results
3. Format for user presentation

### Step 4: Validation

Verify the results:

- Check output meets requirements
- Confirm quality standards
- Validate script exit codes

## Scripts

### helper_script.py

**Purpose**: Brief description of what this script does

**Usage**:

```bash
python scripts/helper_script.py [options]
```

**Options**:

- `--input FILE`: Input file path
- `--output FILE`: Output file path
- `--verbose`: Enable verbose logging

**Output**: Description of what the script produces

## Examples

### Example 1: Basic Usage

**Input**:

```json
{
  "data": "example"
}
```

**Commands**:

```bash
# Save input to file
echo '{"data": "example"}' > input.json

# Run script
python scripts/helper_script.py --input input.json --output results.json

# Read results
cat results.json
```

**Expected Output**:

```json
{
  "processed": "example",
  "status": "success"
}
```

### Example 2: Advanced Usage

**Scenario**: Handling larger datasets

**Commands**:

```bash
python scripts/helper_script.py --input large_data.json --output results.json --verbose
```

**Process**:

1. Script validates input format
2. Processes data in chunks
3. Writes results with metadata

## Templates

Use bundled templates for common patterns:

```bash
cat templates/template_name.ext
```

## Best Practices

- Always run scripts with `--help` first
- Validate input before processing
- Check script exit codes for errors
- Read script output files carefully

## Common Pitfalls

- Not checking script dependencies
- Assuming script paths (use relative paths from skill root)
- Ignoring error messages from scripts
- Hardcoding file paths

## Dependencies

### Python Packages

- package-name>=1.0.0
- another-package>=2.0.0

Install with:

```bash
pip install package-name another-package
```

### System Requirements

- Python 3.8+
- Required system tools or libraries

## Error Handling

Common errors and solutions:

### Script not found

- Ensure you're running from the correct directory
- Check path: `scripts/helper_script.py`

### Permission denied

- Make script executable: `chmod +x scripts/helper_script.py`

### Missing dependencies

- Install required packages (see Dependencies section)

---
name: skill-installer
description: Install agent skills from GitHub repositories into local environment. Pure agentic installation - no scripts required. Use when adding new skills or updating existing ones.
license: MIT
---

# Skill Installer

Install agent skills from GitHub repositories directly into your local environment using agent capabilities - no external scripts or dependencies required.

## When to Use This Skill

Use skill-installer when you need to:

- Install a specific skill from a GitHub repository
- Add skills from the tnez/agent-skills collection
- Update existing skills to latest versions
- Set up skills in a new project or environment
- Install skills from any repository following the agent skills specification

## Installation Process

### Step 1: Parse Installation Request

Extract key information from the user's request:

**Required**:

- Skill name (e.g., "find-local-events")
- Repository (e.g., "tnez/agent-skills")

**Optional**:

- Category/path (e.g., "examples/", "meta/", "documents/")
- Branch (defaults to "main")
- Target location (auto-detected if not specified)

**Example Requests**:

- "Install find-local-events from tnez/agent-skills"
- "Install the skill-creator skill"
- "Add markdown-to-pdf from tnez/agent-skills/documents"

### Step 2: Determine Installation Location

Discover where to install skills by checking these locations in priority order:

**Priority Order**:

1. `.agents/skills/` (project-level, agent-agnostic) - **preferred**
2. `.claude/skills/` (project-level, Claude-specific)
3. `~/.agents/skills/` (global, agent-agnostic)
4. `~/.claude/skills/` (global, Claude-specific)

**Discovery Method**:

Use the Glob tool to search for existing skills:

````text
**/.agents/skills/*/SKILL.md
**/.claude/skills/*/SKILL.md
~/.agents/skills/*/SKILL.md
~/.claude/skills/*/SKILL.md
```text

**Decision Logic**:

- If skills found in `.agents/skills/` → use that directory
- If found in `.claude/skills/` only → use that directory
- If found in multiple → prefer agent-agnostic over agent-specific, project over global
- If none found → ask user where to install (suggest `.agents/skills/`)

### Step 3: Construct GitHub Raw URLs

Build URLs to fetch skill files from GitHub:

**URL Format**:

```text
https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}/{skill-name}/{file}
```text

**Required Files**:

- `SKILL.md` (always required)

**Optional Files** (check if they exist):

- `CONTEXT.md` (user context template)
- `README.md` (additional documentation)
- `scripts/` directory contents
- `templates/` directory contents

**Example URLs**:

```text
https://raw.githubusercontent.com/tnez/agent-skills/main/examples/find-local-events/SKILL.md
https://raw.githubusercontent.com/tnez/agent-skills/main/examples/find-local-events/CONTEXT.md
```text

### Step 4: Fetch Skill Files

Use the WebFetch tool to download files:

**Process**:

1. Fetch `SKILL.md` first (required)
2. Parse YAML frontmatter to extract skill name
3. Check for optional files by fetching (404 = doesn't exist)
4. For directory contents (scripts/, templates/), fetch GitHub API to list files

**Validation**:

- Verify SKILL.md has valid YAML frontmatter
- Confirm `name:` field exists
- Check `description:` field exists

### Step 5: Create Installation Directory

Create the target directory structure:

**Path Structure**:

```text
{installation-location}/{skill-name}/
```text

**Example**:

```text
.agents/skills/find-local-events/
```text

**Create Directory**:

Use the Bash tool:

```bash
mkdir -p .agents/skills/{skill-name}
```text

### Step 6: Save Files

Write fetched content to local files:

**Core Files**:

- Save `SKILL.md` to `{install-dir}/{skill-name}/SKILL.md`
- Save `CONTEXT.md` to `{install-dir}/{skill-name}/CONTEXT.md` (if exists)

**Supporting Files**:

- Maintain directory structure for scripts/ and templates/
- Preserve file permissions for scripts (make executable)

**Use Write Tool**:

```text
Write file_path=".agents/skills/{skill-name}/SKILL.md" content="{fetched-content}"
```text

### Step 7: Handle Existing Skills (Smart Updates)

If skill already exists at target location, perform intelligent semantic merging instead of blind overwriting:

**Detection**:

1. Check if `{install-dir}/{skill-name}/` exists
2. Check if `SKILL.md` exists in that directory
3. Read existing files to determine update strategy

**Update Strategy by File Type**:

**SKILL.md** (Upstream Content):

- Read existing SKILL.md
- Fetch new SKILL.md from repository
- Compare content (simple string comparison)
- If identical → skip, report "already up to date"
- If different → ask user: "Update SKILL.md? This will replace your local version. [Y/n]"
- If yes → overwrite
- If no → keep existing

**CONTEXT.md** (User-Modified Content):

- Read existing CONTEXT.md
- Check if it's still a template:
  - Look for placeholder comments like `<!-- REPLACE with...` or `<!-- CUSTOMIZE`
  - Look for generic placeholder values (e.g., "Seattle, WA", "REPLACE ME")
- **If template** (not personalized):
  - Safe to update
  - Ask: "Update CONTEXT.md template? [Y/n]"
  - Overwrite if yes
- **If personalized** (user has customized):
  - **Never overwrite user's personalized context**
  - Fetch new version and save as `CONTEXT.md.new`
  - Tell user: "New CONTEXT.md template available. Your personalized version preserved. Review CONTEXT.md.new for new fields you may want to add."
  - User manually merges changes

**Scripts and Templates**:

- Check if script files exist locally
- Fetch new versions
- Compare (could use basic diff)
- If identical → skip
- If different → ask: "Update scripts/? This will overwrite local changes. [Y/n]"
- Show which files will be updated

**Recommended Update Flow**:

```text
1. Detect existing skill
2. Inform user: "Skill 'find-local-events' is already installed. Checking for updates..."
3. Compare each file:
   - SKILL.md: different → offer update
   - CONTEXT.md: check if personalized
     - If template → offer update
     - If personalized → save as .new
   - scripts/: different → offer update
4. Show summary:
   "Updates available:
    - SKILL.md (content updated)
    - scripts/convert.sh (new version available)
    - CONTEXT.md (personalized - new template saved as CONTEXT.md.new)

   Apply updates? [Y/n]"
5. Apply user's choices
6. Report results
```text

### Step 8: Verify Installation

Confirm successful installation:

**Checks**:

- [ ] Directory exists: `{install-dir}/{skill-name}/`
- [ ] SKILL.md file exists and is readable
- [ ] SKILL.md has valid YAML frontmatter
- [ ] All fetched files were saved successfully

**Report to User**:

```text
✓ Installed skill: {skill-name}
  Location: {install-dir}/{skill-name}/
  Files: SKILL.md, CONTEXT.md, scripts/convert.sh

To use this skill, invoke it by name or ask your agent to apply it.
```text

## Examples

### Example 1: Install Single Skill

**User Request**:
"Install find-local-events from tnez/agent-skills"

**Process**:

1. Parse: skill="find-local-events", repo="tnez/agent-skills"
2. Detect installation location → `.agents/skills/`
3. Construct URL: `https://raw.githubusercontent.com/tnez/agent-skills/main/examples/find-local-events/SKILL.md`
4. Fetch SKILL.md and CONTEXT.md
5. Create `.agents/skills/find-local-events/`
6. Save both files
7. Report success

**Expected Output**:

```text
✓ Installed skill: find-local-events
  Location: .agents/skills/find-local-events/
  Files: SKILL.md, CONTEXT.md

This skill helps you search for local events with location and datetime disambiguation.
```text

### Example 2: Install with Category Path

**User Request**:
"Install skill-creator from tnez/agent-skills/meta"

**Process**:

1. Parse: skill="skill-creator", repo="tnez/agent-skills", path="meta"
2. Construct URL with path: `.../main/meta/skill-creator/SKILL.md`
3. Follow standard installation process

**Note**: Path helps locate skill but doesn't affect installation location.

### Example 3: Update Existing Skill

**User Request**:
"Update my installed skills from tnez/agent-skills"

**Process**:

1. List currently installed skills in `.agents/skills/`
2. For each skill, check if it exists in tnez/agent-skills
3. Fetch latest version
4. Compare with installed version (check file dates/content)
5. Ask user which to update
6. Update selected skills

### Example 4: First-Time Setup

**User Request**:
"Install skill-creator and skill-browser from tnez/agent-skills"

**Process**:

1. No skills directory exists
2. Ask user: "Where should I install skills? (Recommended: .agents/skills/)"
3. Create chosen directory
4. Install first skill → establishes installation location
5. Install second skill → uses same location
6. Report both installations

## Handling GitHub Repository Variants

### Direct Repository Reference

**Input**: "Install find-local-events from tnez/agent-skills"

**Resolution**:

1. Check CATALOG.md for skill location
2. If not in catalog, search common paths: examples/, meta/, documents/
3. Construct URL and attempt fetch

### Full GitHub URL

**Input**: "Install from <https://github.com/tnez/agent-skills/tree/main/examples/find-local-events>"

**Resolution**:

1. Parse URL to extract: owner, repo, branch, path
2. Convert tree URL to raw URL
3. Fetch SKILL.md

### Raw URL

**Input**: "Install from <https://raw.githubusercontent.com/tnez/agent-skills/main/examples/find-local-events/SKILL.md>"

**Resolution**:

1. Use URL directly
2. Extract skill name from path
3. Fetch and install

## Best Practices

### Installation Location

- **Prefer `.agents/skills/`**: Agent-agnostic, works with any agent
- **Use project-level for projects**: Keep skills with project
- **Use global for personal skills**: Skills you want everywhere

### Verification

- Always verify SKILL.md exists before installation
- Check YAML frontmatter is valid
- Confirm skill name matches expectation
- Test skill after installation

### Updates

- Back up existing skills before overwriting
- Check for breaking changes in skill updates
- Review new CONTEXT.md templates after updates

### Multiple Skills

- Install related skills together (e.g., skill-creator, skill-tester, skill-evaluator)
- Use consistent installation location for all skills
- Consider dependencies when installing

## Common Pitfalls

- **Skill not found**: Check CATALOG.md for correct path
- **Network errors**: Retry fetch with error handling
- **Permission denied**: Check write access to installation directory
- **Name mismatch**: Use skill name from YAML frontmatter, not directory name
- **Missing CONTEXT.md**: Normal - not all skills have context templates
- **Invalid YAML**: Skill may be malformed, report error to user

## Error Handling

### Skill Not Found (404)

```text
✗ Skill not found: find-local-events
  Checked: https://raw.githubusercontent.com/tnez/agent-skills/main/examples/find-local-events/SKILL.md

Try:
  1. Check CATALOG.md for available skills
  2. Verify skill name spelling
  3. Check repository and branch are correct
```text

### Invalid SKILL.md

```text
✗ Invalid SKILL.md: missing YAML frontmatter
  File exists but doesn't have required 'name:' field

This may not be a valid agent skill.
```text

### Permission Error

```text
✗ Cannot create directory: .agents/skills/find-local-events/
  Permission denied

Try:
  1. Check write permissions on .agents/skills/
  2. Use a different installation location
  3. Run with appropriate permissions
```text

### Network Error

```text
✗ Failed to fetch skill files
  Network error or repository unavailable

Try:
  1. Check internet connection
  2. Verify repository URL is correct
  3. Try again in a moment
```text

## Integration with Other Skills

### With skill-browser

Use skill-browser to discover skills, then skill-installer to install selected ones:

```text
User: "Show me available skills from tnez/agent-skills"
Agent: [Uses skill-browser to list skills]
User: "Install find-local-events"
Agent: [Uses skill-installer to install]
```text

### With skill-tester

After installation, validate the skill:

```text
User: "Install and test find-local-events"
Agent: [Installs skill, then runs skill-tester to validate]
```text

### With skill-creator

Install skill-creator to enable creating new skills:

```text
User: "Install skill-creator so I can make custom skills"
Agent: [Installs skill-creator to .agents/skills/]
```text

## Dependencies

**None** - This is a pure agentic skill that uses built-in agent capabilities:

- WebFetch (for downloading files from GitHub)
- Bash (for directory creation)
- Write (for saving files)
- Glob (for finding existing skills)
- Read (for verification)

No external tools, scripts, or package managers required.

## Advanced Usage

### Installing from Other Repositories

This skill works with any GitHub repository following the agent skills specification:

```text
"Install skill-name from user/repo/path/to/skill"
```text

### Custom Branches

```text
"Install find-local-events from tnez/agent-skills branch dev"
```text

Modify URL construction to use specified branch instead of "main".

### Batch Installation

```text
"Install skill-creator, skill-tester, and skill-evaluator from tnez/agent-skills"
```text

Loop through skill list and install each one.

## Troubleshooting

### Q: How do I know where skills are installed?

A: Check these locations in order:

```bash
ls -la .agents/skills/
ls -la .claude/skills/
ls -la ~/.agents/skills/
ls -la ~/.claude/skills/
```text

### Q: Can I install skills without internet?

A: No - this skill fetches from GitHub which requires network access. For offline use, manually copy skill directories.

### Q: What if CATALOG.md doesn't exist?

A: Installation works without it - you just need to provide the full path to the skill. CATALOG.md makes discovery easier.

### Q: How do I uninstall a skill?

A: Remove the skill directory:

```bash
rm -rf .agents/skills/{skill-name}
```text

Or use the skill-uninstaller skill if available.

## Resources

- Agent Skills Repository: <https://github.com/tnez/agent-skills>
- Agent Skills Specification: <https://github.com/anthropics/skills/blob/main/agent_skills_spec.md>
- Skills Catalog: CATALOG.md in repository root
````

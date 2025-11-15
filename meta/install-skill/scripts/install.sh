#!/usr/bin/env bash
set -euo pipefail

# install.sh - Install agent skills from various sources
#
# Usage:
#   install.sh <skill-source> [target-directory]
#
# Skill sources:
#   - GitHub URL: https://github.com/user/repo/tree/main/path/to/skill
#   - Local path: /path/to/skill-directory
#   - Shorthand (from agent-skills repo): meta/skill-creator, examples/get-weather
#
# Examples:
#   install.sh meta/skill-creator
#   install.sh /path/to/custom-skill
#   install.sh https://github.com/user/repo/tree/main/skills/my-skill

VERSION="1.0.0"
AGENT_SKILLS_REPO="https://github.com/tnez/agent-skills"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output (all to stderr so they don't interfere with function returns)
info() { echo -e "${BLUE}ℹ${NC} $*" >&2; }
success() { echo -e "${GREEN}✓${NC} $*" >&2; }
warning() { echo -e "${YELLOW}⚠${NC} $*" >&2; }
error() { echo -e "${RED}✗${NC} $*" >&2; }

# Show usage
usage() {
    cat <<EOF
install.sh - Install agent skills from various sources

Usage:
  install.sh <skill-source> [target-directory]
  install.sh --help
  install.sh --version

Skill Sources:
  Shorthand (from agent-skills repo):
    meta/skill-creator
    examples/get-weather

  Local path:
    /path/to/skill-directory
    ../skills/my-skill

  GitHub URL:
    https://github.com/user/repo/tree/main/path/to/skill

Target Directory:
  If not specified, will auto-detect by searching for existing SKILL.md files.
  Priority order:
    1. .agents/skills/ (project-level, agent-agnostic)
    2. .claude/skills/ (project-level, Claude-specific)
    3. ~/.agents/skills/ (global, agent-agnostic)
    4. ~/.claude/skills/ (global, Claude-specific)

Examples:
  install.sh meta/skill-creator
  install.sh examples/get-weather ~/.agents/skills
  install.sh /path/to/custom-skill
  install.sh https://github.com/user/repo/tree/main/skills/my-skill

Version: $VERSION
EOF
    exit 0
}

# Show version
show_version() {
    echo "install.sh version $VERSION"
    exit 0
}

# Discover skills installation directory
discover_skills_dir() {
    info "Discovering skills installation directory..."

    # Search for SKILL.md files in common locations
    local search_paths=(
        "./.agents/skills"
        "./.claude/skills"
        "$HOME/.agents/skills"
        "$HOME/.claude/skills"
    )

    local found_dirs=()

    for search_path in "${search_paths[@]}"; do
        if [[ -d "$search_path" ]]; then
            # Check if any SKILL.md files exist in subdirectories
            if find "$search_path" -maxdepth 2 -name "SKILL.md" -type f 2>/dev/null | grep -q .; then
                found_dirs+=("$search_path")
                info "Found skills in: $search_path"
            fi
        fi
    done

    # Return the first match (highest priority)
    if [[ ${#found_dirs[@]} -gt 0 ]]; then
        echo "${found_dirs[0]}"
        return 0
    fi

    # No existing skills found, check for empty directories
    for search_path in "${search_paths[@]}"; do
        if [[ -d "$search_path" ]]; then
            warning "Found empty skills directory: $search_path"
            echo "$search_path"
            return 0
        fi
    done

    # No directories found, prompt user
    warning "No skills directories found."
    echo ""
    echo "Where would you like to install skills?"
    echo "  1) ./.agents/skills (project-level, recommended)"
    echo "  2) ./.claude/skills (project-level, Claude-specific)"
    echo "  3) ~/.agents/skills (global)"
    echo "  4) ~/.claude/skills (global, Claude-specific)"
    echo "  5) Custom path"
    read -rp "Choice [1-5]: " choice

    case $choice in
        1) echo "./.agents/skills" ;;
        2) echo "./.claude/skills" ;;
        3) echo "$HOME/.agents/skills" ;;
        4) echo "$HOME/.claude/skills" ;;
        5) read -rp "Enter custom path: " custom_path; echo "$custom_path" ;;
        *) error "Invalid choice"; exit 1 ;;
    esac
}

# Extract skill name from SKILL.md YAML frontmatter
extract_skill_name() {
    local skill_md="$1"

    if [[ ! -f "$skill_md" ]]; then
        error "SKILL.md not found: $skill_md"
        return 1
    fi

    # Extract name field from YAML frontmatter
    # Read between --- markers and find name: field
    local name
    name=$(sed -n '/^---$/,/^---$/p' "$skill_md" | grep '^name:' | head -1 | awk '{print $2}')

    if [[ -z "$name" ]]; then
        error "Could not extract skill name from SKILL.md"
        return 1
    fi

    echo "$name"
}

# Install from local path
install_from_local() {
    local source_path="$1"
    local target_dir="$2"

    # Expand path
    source_path="${source_path/#\~/$HOME}"

    if [[ ! -d "$source_path" ]]; then
        error "Source directory does not exist: $source_path"
        exit 1
    fi

    if [[ ! -f "$source_path/SKILL.md" ]]; then
        error "SKILL.md not found in: $source_path"
        exit 1
    fi

    # Extract skill name
    local skill_name
    skill_name=$(extract_skill_name "$source_path/SKILL.md")

    # Create target directory
    local target_path="$target_dir/$skill_name"

    if [[ -d "$target_path" ]]; then
        warning "Skill already exists: $target_path"
        read -rp "Overwrite? [y/N]: " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            info "Installation cancelled"
            exit 0
        fi
        rm -rf "$target_path"
    fi

    # Copy skill
    info "Installing $skill_name from $source_path"
    cp -r "$source_path" "$target_path"
    success "Installed skill: $skill_name → $target_path"
}

# Install from shorthand (agent-skills repo)
install_from_shorthand() {
    local shorthand="$1"
    local target_dir="$2"

    # Try to find in local agent-skills repo first
    local local_paths=(
        "$(pwd)/$shorthand"
        "$(pwd)/main/$shorthand"
        "$HOME/agent-skills/$shorthand"
        "$HOME/agent-skills/main/$shorthand"
    )

    for path in "${local_paths[@]}"; do
        if [[ -d "$path" && -f "$path/SKILL.md" ]]; then
            info "Found skill locally: $path"
            install_from_local "$path" "$target_dir"
            return 0
        fi
    done

    # Not found locally, fetch from GitHub
    info "Fetching from agent-skills repository..."

    local temp_dir
    temp_dir=$(mktemp -d)
    trap 'rm -rf "$temp_dir"' EXIT

    # Clone the repo (sparse checkout for efficiency)
    info "Cloning agent-skills repository..."
    git clone --depth 1 --filter=blob:none --sparse "$AGENT_SKILLS_REPO" "$temp_dir" 2>/dev/null || {
        error "Failed to clone agent-skills repository"
        exit 1
    }

    cd "$temp_dir" || exit 1
    git sparse-checkout set "main/$shorthand" 2>/dev/null || {
        error "Skill not found: $shorthand"
        exit 1
    }

    local skill_path="$temp_dir/main/$shorthand"
    if [[ ! -d "$skill_path" || ! -f "$skill_path/SKILL.md" ]]; then
        error "Skill not found in repository: $shorthand"
        exit 1
    fi

    install_from_local "$skill_path" "$target_dir"
}

# Install from GitHub URL
install_from_github() {
    local url="$1"
    local target_dir="$2"

    # Parse GitHub URL
    # Format: https://github.com/user/repo/tree/branch/path/to/skill
    if [[ ! "$url" =~ github\.com ]]; then
        error "Not a GitHub URL: $url"
        exit 1
    fi

    # Extract components
    local repo_url repo_path
    repo_url=$(echo "$url" | sed -E 's|(https://github.com/[^/]+/[^/]+).*|\1|')
    repo_path=$(echo "$url" | sed -E 's|https://github.com/[^/]+/[^/]+/tree/[^/]+/(.+)|\1|')

    info "Fetching from GitHub: $repo_url"
    info "Skill path: $repo_path"

    local temp_dir
    temp_dir=$(mktemp -d)
    trap 'rm -rf "$temp_dir"' EXIT

    # Clone with sparse checkout
    git clone --depth 1 --filter=blob:none --sparse "$repo_url" "$temp_dir" 2>/dev/null || {
        error "Failed to clone repository: $repo_url"
        exit 1
    }

    cd "$temp_dir" || exit 1
    git sparse-checkout set "$repo_path" 2>/dev/null || {
        error "Path not found in repository: $repo_path"
        exit 1
    }

    local skill_path="$temp_dir/$repo_path"
    if [[ ! -d "$skill_path" || ! -f "$skill_path/SKILL.md" ]]; then
        error "SKILL.md not found at: $repo_path"
        exit 1
    fi

    install_from_local "$skill_path" "$target_dir"
}

# Main function
main() {
    # Parse arguments
    if [[ $# -eq 0 ]]; then
        usage
    fi

    case "${1:-}" in
        --help|-h) usage ;;
        --version|-v) show_version ;;
    esac

    local skill_source="$1"
    local target_dir="${2:-}"

    # Discover target directory if not provided
    if [[ -z "$target_dir" ]]; then
        target_dir=$(discover_skills_dir)
        info "Target directory: $target_dir"
    fi

    # Expand target directory path
    target_dir="${target_dir/#\~/$HOME}"

    # Create target directory if it doesn't exist
    if [[ ! -d "$target_dir" ]]; then
        info "Creating directory: $target_dir"
        mkdir -p "$target_dir"
    fi

    # Determine source type and install
    if [[ "$skill_source" =~ ^https?:// ]]; then
        # URL
        if [[ "$skill_source" =~ github\.com ]]; then
            install_from_github "$skill_source" "$target_dir"
        else
            error "Unsupported URL type. Only GitHub URLs are supported."
            exit 1
        fi
    elif [[ "$skill_source" =~ ^[./~] || "$skill_source" =~ ^/ ]]; then
        # Absolute or relative path
        install_from_local "$skill_source" "$target_dir"
    else
        # Shorthand (from agent-skills repo)
        install_from_shorthand "$skill_source" "$target_dir"
    fi
}

main "$@"

---
name: skill-evaluator
description: Evaluate agent skill quality using rubric-based assessment. Use when assessing skill effectiveness, identifying improvement opportunities, or ensuring quality standards.
license: MIT
allowed-tools:
  - Read
  - Bash
---

# Skill Evaluator

Assess agent skill quality through comprehensive rubric-based evaluation.

## When to Use This Skill

Use skill-evaluator when you need to:

- Evaluate a new skill's quality before deployment
- Assess an existing skill's effectiveness
- Identify specific improvement opportunities
- Measure skill quality objectively
- Compare skills against quality standards
- Generate improvement recommendations

## Evaluation Process

### Phase 1: Preparation

#### Gather Context

1. Identify the skill to evaluate
2. Read the complete SKILL.md
3. Review any bundled resources (scripts, templates)
4. Understand the skill's intended purpose

#### Load Evaluation Rubric

```bash
cat templates/evaluation-rubric.md
```

### Phase 2: Rubric-Based Evaluation

Evaluate the skill across four dimensions:

#### 1. Clarity (1-5)

**What to Assess**:

- Are instructions imperative and actionable?
- Is the description clear about WHAT the skill does?
- Is the description clear about WHEN to use it?
- Are technical terms explained?
- Is the language precise and unambiguous?

**Scoring Guide**:

- **5**: Exceptionally clear, every instruction actionable, perfect balance of detail
- **4**: Very clear, minor improvements possible
- **3**: Generally clear, some vague sections
- **2**: Unclear in multiple places, hard to follow
- **1**: Confusing, missing critical information

**Questions to Ask**:

- Can someone unfamiliar with the domain understand this?
- Are all steps clearly defined?
- Is there any ambiguous language?

#### 2. Completeness (1-5)

**What to Assess**:

- Are all necessary steps documented?
- Are dependencies clearly stated?
- Are edge cases addressed?
- Is error handling covered?
- Are prerequisites listed?

**Scoring Guide**:

- **5**: Comprehensive, covers all scenarios, no gaps
- **4**: Very complete, minor edge cases missing
- **3**: Generally complete, some steps assumed
- **2**: Significant gaps, missing key information
- **1**: Incomplete, critical steps missing

**Questions to Ask**:

- Could someone execute this skill without asking questions?
- Are dependencies explicit?
- What happens when things go wrong?

#### 3. Examples (1-5)

**What to Assess**:

- Are concrete examples provided?
- Do examples show expected outcomes?
- Are multiple scenarios covered?
- Do examples help clarify instructions?
- Are examples realistic and practical?

**Scoring Guide**:

- **5**: Excellent examples, multiple scenarios, clear outcomes
- **4**: Good examples, covers main use cases
- **3**: Basic examples present, could be more detailed
- **2**: Minimal examples, not very helpful
- **1**: No examples or examples are confusing

**Questions to Ask**:

- Do examples demonstrate the skill in action?
- Are edge cases illustrated?
- Can users adapt examples to their needs?

#### 4. Focus (1-5)

**What to Assess**:

- Does the skill address a specific, well-defined task?
- Is it too broad or monolithic?
- Does it try to do too much?
- Is the scope appropriate?
- Are responsibilities clear?

**Scoring Guide**:

- **5**: Perfectly focused, single clear purpose
- **4**: Well-focused, minor scope creep
- **3**: Generally focused, some unnecessary breadth
- **2**: Too broad, trying to do too much
- **1**: Unfocused, unclear purpose

**Questions to Ask**:

- Can you describe the skill's purpose in one sentence?
- Should this be split into multiple skills?
- Is anything out of scope included?

### Phase 3: Scoring

#### Calculate Scores

For each dimension:

1. Review the assessment criteria
2. Assign a score (1-5)
3. Document specific observations
4. Note evidence supporting the score

#### Total Score

Sum all dimensions (max: 20)

#### Quality Thresholds

- **18-20**: Excellent - Production ready
- **15-17**: Strong - Minor improvements recommended
- **12-14**: Adequate - Needs refinement
- **9-11**: Weak - Significant improvements required
- **1-8**: Poor - Major rework needed

### Phase 4: Recommendations

#### Generate Actionable Feedback

For each dimension with score <5:

1. Identify specific weaknesses
2. Provide concrete improvement suggestions
3. Prioritize recommendations (high/medium/low)

**Example Recommendations**:

Clarity (3/5):

- High: Rewrite Phase 2 instructions in imperative form
- Medium: Define technical term "API endpoint" in context
- Low: Add section headings for better scanning

Completeness (4/5):

- Medium: Add error handling section
- Low: List Python version requirement

Examples (3/5):

- High: Add 2 more concrete examples showing different scenarios
- Medium: Include expected output for Example 1
- Medium: Add edge case example (empty input)

Focus (5/5):

- No recommendations - well-focused

### Phase 5: Generate Report

#### Create Evaluation Report

Use the rubric template:

```bash
cat templates/evaluation-rubric.md
```

Fill in:

- Skill name and date
- Scores for each dimension
- Total score and quality level
- Detailed observations
- Prioritized recommendations
- Overall assessment

#### Report Structure

```markdown
# Skill Evaluation Report

**Skill**: skill-name
**Date**: YYYY-MM-DD
**Evaluator**: [Agent/Human name]

## Scores

| Dimension    | Score     | Notes                          |
| ------------ | --------- | ------------------------------ |
| Clarity      | 4/5       | Very clear, minor improvements |
| Completeness | 5/5       | Comprehensive coverage         |
| Examples     | 3/5       | Needs more concrete examples   |
| Focus        | 5/5       | Well-scoped and focused        |
| **Total**    | **17/20** | **Strong**                     |

## Detailed Assessment

[Per-dimension analysis]

## Recommendations

[Prioritized improvement suggestions]

## Overall Assessment

[Summary and final thoughts]
```

### Phase 6: Iterate

#### Support Improvement Cycle

1. Share evaluation report with skill author
2. Implement high-priority recommendations
3. Re-evaluate after changes
4. Compare scores to measure improvement
5. Iterate until quality threshold met

## Evaluation Rubric

Use the bundled rubric template:

```bash
cat templates/evaluation-rubric.md
```

The template provides:

- Detailed scoring criteria for each dimension
- Example assessments
- Report structure
- Question prompts

## Scripts

### run_evaluation.py

**Purpose**: Semi-automated evaluation assistance

**Usage**:

```bash
python scripts/run_evaluation.py /path/to/skill-directory
```

**Features**:

- Extracts skill metadata
- Calculates word counts
- Identifies missing sections
- Generates report template
- Assists with objective metrics

**Note**: Final scoring requires human/agent judgment

## Examples

### Example 1: High-Quality Skill Evaluation

**Skill**: brand-guidelines

**Assessment**:

#### Clarity: 5/5

- Description perfectly explains what and when
- Instructions are imperative and actionable
- Technical terms clear from context
- Language is precise

#### Completeness: 5/5

- All necessary information present
- Color codes, typography, spacing all specified
- No external dependencies needed
- Self-contained and complete

#### Examples: 4/5

- Color examples provided with hex codes
- Typography examples with sizes and weights
- Could benefit from visual mockup examples

#### Focus: 5/5

- Single clear purpose: brand guidelines
- Not trying to do design work, just provide standards
- Perfect scope

#### Total: 19/20 (Excellent)

**Recommendations**:

- Low: Add 1-2 visual mockup examples showing guidelines applied

### Example 2: Skill Needing Improvement

**Skill**: code-helper

**Assessment**:

#### Clarity: 2/5

- Description vague: "Helps with code"
- Instructions use passive voice
- Many undefined terms
- Ambiguous steps

#### Completeness: 3/5

- Missing dependency information
- No error handling guidance
- Prerequisites not stated
- Some steps documented

#### Examples: 2/5

- Only one example provided
- Example doesn't show expected output
- No edge cases illustrated

#### Focus: 2/5

- Tries to do too much: formatting, analysis, documentation
- Should be 3 separate skills
- Unclear primary purpose

#### Total: 9/20 (Weak)

**Recommendations**:

High Priority:

- Split into 3 focused skills: code-formatter, code-analyzer, code-documenter
- Rewrite description to explain specific purpose and when to use
- Rewrite all instructions in imperative form

Medium Priority:

- Add 3-4 concrete examples with inputs and outputs
- Document all dependencies (Python version, packages)
- Add error handling section

Low Priority:

- Define all technical terms in context
- Add edge case examples

### Example 3: Re-Evaluation After Improvements

**Initial Evaluation**: 12/20 (Adequate)
**After Improvements**: 17/20 (Strong)

**Changes Made**:

- Added 3 concrete examples (+2 points)
- Clarified description to explain when to use (+1 point)
- Rewrote vague instructions in imperative form (+2 points)

**Impact**: Moved from "Needs refinement" to "Minor improvements recommended"

## Best Practices

### Be Objective

- Use the rubric consistently
- Base scores on evidence, not feelings
- Compare against criteria, not other skills

### Be Specific

- Document exact issues
- Provide concrete examples of problems
- Suggest specific improvements

### Be Constructive

- Focus on helping improve the skill
- Acknowledge what works well
- Prioritize feedback (don't overwhelm)

### Be Thorough

- Read the entire skill before scoring
- Check all bundled resources
- Consider real-world usage

## Common Evaluation Pitfalls

### Leniency Bias

❌ Scoring too high because skill "seems okay"
✓ Compare against explicit rubric criteria

### Recency Effect

❌ Letting recent sections heavily influence score
✓ Evaluate each dimension independently

### Halo Effect

❌ One strong area influences scoring of others
✓ Score each dimension separately

### Comparison Bias

❌ Scoring relative to other skills
✓ Score against absolute rubric criteria

## Quality Gates

**Minimum Thresholds**:

- **For deployment**: ≥15/20 total, no dimension <3
- **For production**: ≥18/20 total, all dimensions ≥4
- **Best practice**: All dimensions ≥4

**Red Flags** (immediate revision needed):

- Any dimension scored 1
- Total score <12
- Missing examples entirely
- Vague description

## Evaluation Checklist

Before finalizing evaluation:

- [ ] Read complete SKILL.md
- [ ] Reviewed all bundled resources
- [ ] Scored all four dimensions
- [ ] Calculated total score
- [ ] Documented specific observations
- [ ] Generated prioritized recommendations
- [ ] Identified quality threshold met
- [ ] Created evaluation report

## Templates

### Evaluation Rubric Template

```bash
cat templates/evaluation-rubric.md
```

Provides:

- Scoring criteria details
- Report structure
- Example assessments

## Resources

- Evaluation script: `scripts/run_evaluation.py`
- Rubric template: `templates/evaluation-rubric.md`
- Agent Skills Specification: <https://github.com/anthropics/skills/blob/main/agent_skills_spec.md>

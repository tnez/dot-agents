# Agent Skills Workflows

This document provides concrete examples of how agents and humans use the skills in this repository.

## Workflow 1: Creating a New Skill (Agent Perspective)

**Scenario**: You need to create a skill for analyzing code complexity.

### Steps

1. **Invoke skill-creator**
   ```
   User: "I need to create a skill for analyzing code complexity"
   Agent: *loads skill-creator skill*
   ```

2. **Scaffold the skill**
   - Generate `code-complexity-analyzer/SKILL.md` with proper frontmatter
   - Create directory structure with `scripts/` for analysis tools
   - Validate skill name format (hyphen-case, ≤64 chars)

3. **Fill in content**
   - Write imperative instructions for complexity analysis
   - Add examples showing expected output
   - Reference any bundled scripts or templates

4. **Validate structure**
   - Use skill-creator's validation to check:
     - YAML frontmatter is valid
     - Directory name matches `name` field
     - File references are correct

5. **Test the skill**
   - Switch to skill-tester
   - Run validation suite
   - Fix any issues identified

6. **Evaluate quality**
   - Use skill-evaluator with rubric
   - Check clarity, completeness, focus
   - Iterate based on feedback

**Expected Result**: A well-structured, validated skill ready for use.

---

## Workflow 2: Testing an Existing Skill (Human Perspective)

**Scenario**: You want to verify a skill follows the specification before deploying it.

### Steps

1. **Navigate to skill directory**
   ```bash
   cd agent-skills/main/meta/skill-creator
   ```

2. **Invoke skill-tester**
   - Load the skill-tester skill
   - Point it at the target skill directory

3. **Run validation suite**
   The tester checks:
   - ✓ YAML frontmatter has required fields (name, description)
   - ✓ `name` field matches directory name exactly
   - ✓ Skill name is hyphen-case, ≤64 characters
   - ✓ Description explains WHAT and WHEN
   - ✓ All file references exist
   - ✓ SKILL.md is under 5,000 words
   - ✓ No hardcoded credentials found

4. **Review test report**
   ```
   PASS: YAML frontmatter valid
   PASS: Directory name matches 'skill-creator'
   PASS: Description is clear and actionable
   WARN: SKILL.md is 3,200 words (recommend <5,000)
   PASS: All file references exist
   ```

5. **Fix any failures**
   - Address FAIL items immediately
   - Consider WARN items for improvement

**Expected Result**: Confidence that the skill meets specification requirements.

---

## Workflow 3: Evaluating Skill Quality

**Scenario**: You've created a skill and want to assess its quality before sharing.

### Steps

1. **Invoke skill-evaluator**
   - Load the evaluator skill
   - Specify the skill to evaluate

2. **Run rubric-based evaluation**
   The evaluator assesses:

   **Clarity (1-5)**
   - Are instructions imperative and actionable?
   - Is the description clear about WHAT and WHEN?

   **Completeness (1-5)**
   - Are all necessary steps documented?
   - Are dependencies clearly stated?

   **Examples (1-5)**
   - Are concrete examples provided?
   - Do examples show expected outcomes?

   **Focus (1-5)**
   - Does the skill address a specific task?
   - Is it too broad or monolithic?

3. **Review evaluation report**
   ```
   Skill: code-complexity-analyzer

   Clarity: 4/5
   - Instructions are clear and imperative
   - Minor improvement: add more "when to use" guidance

   Completeness: 5/5
   - All steps documented
   - Dependencies clearly listed

   Examples: 3/5
   - Only one example provided
   - Recommendation: add examples for different languages

   Focus: 5/5
   - Well-scoped to complexity analysis
   - Not trying to do too much

   Overall: 17/20 (Strong)

   Recommendations:
   - Add 2-3 more concrete examples
   - Expand "when to use" section
   ```

4. **Iterate based on feedback**
   - Address low scores
   - Implement recommendations
   - Re-evaluate to measure improvement

**Expected Result**: Objective assessment with actionable improvement suggestions.

---

## Workflow 4: Full Development Cycle

**Scenario**: End-to-end skill development with quality gates.

### Phases

#### Phase 1: Creation
- Use **skill-creator** to scaffold
- Write initial instructions and examples
- Add supporting resources (scripts, templates)

#### Phase 2: Validation
- Use **skill-tester** to validate structure
- Fix any spec violations
- Ensure all files referenced exist

#### Phase 3: Evaluation
- Use **skill-evaluator** for quality check
- Identify improvement areas
- Score against rubric

#### Phase 4: Refinement
- Address evaluation feedback
- Add more examples if needed
- Clarify instructions

#### Phase 5: Re-test
- Run skill-tester again to ensure still valid
- Confirm no regressions

#### Phase 6: Final Evaluation
- Re-run skill-evaluator
- Compare scores to initial evaluation
- Ensure quality threshold met (e.g., ≥15/20)

### Quality Gates

- **Must Pass**: skill-tester validation (no FAIL items)
- **Recommended**: skill-evaluator score ≥15/20
- **Best Practice**: All rubric categories ≥3/5

**Expected Result**: High-quality, specification-compliant skill ready for production use.

---

## Workflow 5: Using Meta-Skills on Themselves (Dogfooding)

**Scenario**: Test meta-skills by applying them to themselves.

### Example: Evaluate skill-evaluator

1. **Invoke skill-evaluator**
2. **Target**: `meta/skill-evaluator/`
3. **Run evaluation**: Score skill-evaluator using its own rubric
4. **Review results**: Identify meta-skill improvement opportunities
5. **Iterate**: Improve skill-evaluator based on its own recommendations

**Benefits**:
- Validates meta-skills work correctly
- Ensures meta-skills meet their own quality standards
- Surfaces inconsistencies or gaps

---

## Quick Reference

| Task | Skill to Use | Key Output |
|------|--------------|------------|
| Create new skill | skill-creator | Scaffolded directory with SKILL.md |
| Validate structure | skill-tester | Pass/fail validation report |
| Assess quality | skill-evaluator | Rubric scores and recommendations |
| Full development | All three in sequence | Production-ready skill |

## Tips

- **Always validate first**: Run skill-tester before evaluation
- **Iterate quickly**: Use evaluation feedback to improve rapidly
- **Concrete examples**: The more specific, the better
- **Focus**: One skill, one well-defined task
- **Test on real tasks**: Use skills in actual workflows to validate effectiveness

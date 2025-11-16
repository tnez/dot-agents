# Skill Evaluation Rubric

Use this rubric to evaluate agent skill quality objectively.

## Evaluation Dimensions

### 1. Clarity (1-5)

**Evaluation Criteria**:

- Are instructions imperative and actionable?
- Is the description clear about WHAT the skill does?
- Is the description clear about WHEN to use it?
- Are technical terms explained?
- Is the language precise and unambiguous?

**Scoring Guide**:

#### 5 - Exceptional

- Every instruction is actionable and clear
- Description perfectly explains what and when
- Technical terms defined in context
- No ambiguous language
- Perfect balance of detail

#### 4 - Very Clear

- Instructions mostly actionable
- Description clear on what and when
- Minor improvements possible
- Generally unambiguous

#### 3 - Generally Clear

- Most instructions understandable
- Some vague or passive language
- Description adequate but could be sharper
- A few undefined terms

#### 2 - Unclear

- Many instructions vague or passive
- Description missing what or when
- Multiple undefined terms
- Hard to follow in places

#### 1 - Confusing

- Instructions not actionable
- Description vague or missing
- Confusing language throughout
- Missing critical information

**Assessment Questions**:

- Can someone unfamiliar with the domain understand this?
- Are all steps clearly defined?
- Is there any ambiguous language?
- Does the description explain both what and when?

---

### 2. Completeness (1-5)

**Evaluation Criteria**:

- Are all necessary steps documented?
- Are dependencies clearly stated?
- Are edge cases addressed?
- Is error handling covered?
- Are prerequisites listed?

**Scoring Guide**:

#### 5 - Comprehensive

- All steps documented in detail
- Dependencies explicitly listed
- Edge cases covered
- Error handling addressed
- Prerequisites clear
- Nothing assumed

#### 4 - Very Complete

- Key steps well documented
- Main dependencies stated
- Minor edge cases missing
- Generally self-contained

#### 3 - Generally Complete

- Main steps present
- Some dependencies implicit
- Some steps assumed
- Edge cases not addressed

#### 2 - Significant Gaps

- Missing key steps
- Dependencies unclear
- Lots of assumed knowledge
- Incomplete coverage

#### 1 - Incomplete

- Critical steps missing
- No dependency information
- Cannot be executed as written
- Major gaps

**Assessment Questions**:

- Could someone execute this skill without asking questions?
- Are all dependencies explicit?
- What happens when things go wrong?
- Are prerequisites stated?

---

### 3. Examples (1-5)

**Evaluation Criteria**:

- Are concrete examples provided?
- Do examples show expected outcomes?
- Are multiple scenarios covered?
- Do examples help clarify instructions?
- Are examples realistic and practical?

**Scoring Guide**:

#### 5 - Excellent Examples

- Multiple concrete examples (3+)
- Examples show inputs AND outputs
- Various scenarios covered (common + edge cases)
- Examples are realistic and practical
- Examples clarify instructions significantly

#### 4 - Good Examples

- 2+ concrete examples
- Shows expected outcomes
- Covers main use cases
- Examples are helpful

#### 3 - Basic Examples

- 1-2 examples present
- Examples somewhat helpful
- Limited scenario coverage
- Could be more detailed

#### 2 - Minimal Examples

- Only 1 example or examples are vague
- Outputs not shown
- Not very helpful
- Too abstract

#### 1 - No Examples

- No examples provided
- Or examples are confusing
- Don't illustrate the skill

**Assessment Questions**:

- Do examples demonstrate the skill in action?
- Are edge cases illustrated?
- Can users adapt examples to their needs?
- Are inputs and expected outputs shown?

---

### 4. Focus (1-5)

**Evaluation Criteria**:

- Does the skill address a specific, well-defined task?
- Is it too broad or monolithic?
- Does it try to do too much?
- Is the scope appropriate?
- Are responsibilities clear?

**Scoring Guide**:

#### 5 - Perfectly Focused

- Single, clear purpose
- Well-defined scope
- Not trying to do too much
- Responsibilities crystal clear
- Could describe purpose in one sentence

#### 4 - Well-Focused

- Clear primary purpose
- Slight scope creep but manageable
- Generally well-scoped
- Minor improvements possible

#### 3 - Generally Focused

- Main purpose identifiable
- Some unnecessary breadth
- Could be tighter
- Mix of related tasks

#### 2 - Too Broad

- Trying to do too much
- Should be multiple skills
- Scope unclear
- Responsibilities mixed

#### 1 - Unfocused

- No clear purpose
- Monolithic
- Should be split into many skills
- Unclear what it's for

**Assessment Questions**:

- Can you describe the skill's purpose in one sentence?
- Should this be split into multiple skills?
- Is anything out of scope included?
- Are there multiple distinct responsibilities?

---

## Scoring Summary

| Dimension    | Score   | Weight   | Notes |
| ------------ | ------- | -------- | ----- |
| Clarity      | /5      | 25%      |       |
| Completeness | /5      | 25%      |       |
| Examples     | /5      | 25%      |       |
| Focus        | /5      | 25%      |       |
| **Total**    | **/20** | **100%** |       |

---

## Quality Thresholds

**Total Score Interpretation**:

- **18-20**: Excellent - Production ready, exemplary quality
- **15-17**: Strong - Minor improvements recommended, deployable
- **12-14**: Adequate - Needs refinement, significant improvements needed
- **9-11**: Weak - Major improvements required before deployment
- **1-8**: Poor - Significant rework needed, not ready for use

**Dimension Thresholds**:

- **Minimum for deployment**: No dimension <3
- **Best practice**: All dimensions ≥4
- **Production quality**: All dimensions ≥4, total ≥18

---

## Evaluation Report Template

```markdown
# Skill Evaluation Report

**Skill Name**: [skill-name]
**Evaluated By**: [Agent/Human name]
**Date**: [YYYY-MM-DD]
**Skill Version**: [if applicable]

---

## Executive Summary

**Total Score**: X/20 ([Excellent/Strong/Adequate/Weak/Poor])

[One paragraph summarizing overall assessment]

---

## Dimension Scores

### Clarity: X/5

**Observations**:

- [Specific observation 1]
- [Specific observation 2]
- [Specific observation 3]

**Evidence**:

- [Quote or reference from skill]

### Completeness: X/5

**Observations**:

- [Specific observation 1]
- [Specific observation 2]
- [Specific observation 3]

**Evidence**:

- [Quote or reference from skill]

### Examples: X/5

**Observations**:

- [Specific observation 1]
- [Specific observation 2]
- [Specific observation 3]

**Evidence**:

- [Number and quality of examples]

### Focus: X/5

**Observations**:

- [Specific observation 1]
- [Specific observation 2]
- [Specific observation 3]

**Evidence**:

- [Skill's stated purpose vs. actual content]

---

## Detailed Analysis

### Strengths

1. [Key strength 1]
2. [Key strength 2]
3. [Key strength 3]

### Weaknesses

1. [Key weakness 1]
2. [Key weakness 2]
3. [Key weakness 3]

---

## Recommendations

### High Priority (Critical for improvement)

1. [Recommendation with specific action]
   - **Why**: [Rationale]
   - **Impact**: [Expected improvement]

2. [Recommendation with specific action]
   - **Why**: [Rationale]
   - **Impact**: [Expected improvement]

### Medium Priority (Should address)

1. [Recommendation with specific action]
   - **Why**: [Rationale]
   - **Impact**: [Expected improvement]

2. [Recommendation with specific action]
   - **Why**: [Rationale]
   - **Impact**: [Expected improvement]

### Low Priority (Nice to have)

1. [Recommendation with specific action]
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

1. [Immediate action item]
2. [Follow-up action item]
3. [Re-evaluation timing]

---

## Evaluation Metadata

- **Rubric Version**: 1.0
- **Evaluation Duration**: [time spent]
- **Resources Reviewed**: [SKILL.md, scripts, templates, etc.]
```

---

## Example Evaluation

### Skill: brand-guidelines

#### Total Score

19/20 (Excellent)

#### Clarity: 5/5

- Description: "Apply brand visual identity guidelines including colors, typography, and spacing. Use when creating branded materials or reviewing designs."
- Perfect explanation of what and when
- All instructions clear and actionable
- No ambiguity

#### Completeness: 5/5

- All brand elements documented (colors, typography, spacing)
- No dependencies required
- Self-contained
- Nothing assumed

#### Examples: 4/5

- Concrete color examples with hex codes
- Typography with sizes and weights
- Spacing with pixel values
- Could add visual mockups showing guidelines applied

#### Focus: 5/5

- Single clear purpose: provide brand guidelines
- Not trying to do design work
- Perfect scope

**Recommendations**:

- Low: Add 1-2 visual examples showing guidelines in use

**Deployment**: Deploy as-is - Exemplary quality

---

## Tips for Evaluators

1. **Read completely first** - Don't score during initial read
2. **Use the rubric** - Compare against criteria, not gut feel
3. **Be specific** - Document exact issues with examples
4. **Be constructive** - Focus on improvement, not criticism
5. **Be consistent** - Apply same standards across all skills
6. **Be objective** - Base on evidence, not preference
7. **Consider context** - Understand skill's intended use
8. **Check resources** - Review scripts, templates, not just SKILL.md

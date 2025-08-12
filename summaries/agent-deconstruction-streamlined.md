# Agent Deconstruction - Actionable Protocol

## Mandatory Workflow (No Deviations)

### Phase 1: Count & Categorize (10 minutes max)
```python
# 1. Line count
total_lines = count_lines(agent_prompt)
if total_lines < 800:
    STOP("Agent too small for decomposition")

# 2. Extract functions (literal search)
functions = []
for line in agent_prompt:
    if matches_pattern(["def ", "function", "Step:", "###"]):
        functions.append(line)

# 3. Count responsibilities
responsibilities = len(functions)
target_agents = ceil(total_lines / 200)
```

### Phase 2: Slice into Agents (Follow These Exact Rules)

#### Rule 1: Identify Valid Split Points
```python
# Scan for ALL valid boundaries in document
boundaries = []
for line_num, line in enumerate(agent_prompt):
    if is_boundary(line):
        boundaries.append({
            'line': line_num,
            'type': boundary_type,
            'priority': get_priority(boundary_type)
        })

# Boundary types (in priority order):
BOUNDARY_PRIORITY = {
    'section_header': 1,    # ### Title, ## Title
    'step_marker': 2,       # Step N:, Phase N:
    'function_end': 3,      # } or end of function
    'code_block_end': 4,    # ```
    'empty_line': 5,        # blank line
    'paragraph_end': 6,     # line ending with .
    'list_item_end': 7      # line starting with - or *
}
```

#### Rule 2: Size Enforcement with Boundary Respect
```python
for each_chunk:
    if lines > 200:
        # Find nearest boundary BEFORE line 200
        split_point = find_last_boundary_before(200)
        # Boundaries in priority order:
        # 1. Empty line (best)
        # 2. End of code block (```)  
        # 3. End of list item
        # 4. End of paragraph (. followed by \n)
        # 5. End of function/method
        # 6. Section header (###, Step N:)
        
    if lines < 50:
        MUST merge with adjacent chunk
```

#### Rule 3: Naming Convention
```
Agent 1: [Original-Name]-validator     # Always first
Agent 2: [Original-Name]-processor     # Core logic
Agent 3: [Original-Name]-formatter     # Output generation
Agent N: [Original-Name]-verifier      # Always last
```

### Phase 3: Create Handoff Protocol (Use This Template)

```yaml
# Between EVERY agent pair:
handoff:
  from: agent_1
  to: agent_2
  data_format: JSON
  required_fields: [list_exact_fields]
  validation: 
    - field_x must be string
    - field_y must be > 0
  on_error: STOP_CHAIN
```

### Phase 4: Generate Agent Prompts (Exact Structure)

```markdown
# Agent N: [Name]
## Lines: [X]/200

## Input Contract
- Format: JSON
- Required: {exact_fields}
- Validation: [exact_rules]

## Single Responsibility
[ONE sentence describing ONLY what this agent does]

## Processing Logic
[Copy EXACT lines from original, no modifications]

## Output Contract  
- Format: JSON
- Fields: {exact_fields}
- Next: Agent_[N+1] or COMPLETE
```

## Non-Negotiable Constraints

### What You MUST Do:
1. **Count lines mechanically** - No interpretation
2. **Cut at boundaries BEFORE 200 lines** - Never mid-sentence
3. **Name systematically** - validator→processor→formatter→verifier
4. **Create JSON handoffs** - No other formats
5. **Copy logic verbatim** - No improvements

### What You MUST NOT Do:
1. **Analyze complexity** - Just count and cut
2. **Optimize logic** - Copy as-is
3. **Create custom patterns** - Use the 4 standard agents
4. **Add error handling** - Unless it existed in original
5. **Explain decisions** - Just execute the protocol

## Output Template (Fill This Exactly)

```markdown
## Decomposition Report

### Metrics
- Original: [X] lines
- Created: [N] agents
- Largest agent: [Y] lines
- Smallest agent: [Z] lines

### Agent Chain
1. [name]-validator ([X] lines) → 
2. [name]-processor ([Y] lines) →
3. [name]-formatter ([Z] lines) →
4. [name]-verifier ([W] lines)

### Handoffs
1→2: JSON with fields [a,b,c]
2→3: JSON with fields [d,e,f]  
3→4: JSON with fields [g,h,i]

### Implementation Files
- agent_1_validator.md (Created)
- agent_2_processor.md (Created)
- agent_3_formatter.md (Created)
- agent_4_verifier.md (Created)
- orchestrator.json (Created)
```

## Execution Checklist

- [ ] Count total lines
- [ ] Verify > 800 lines
- [ ] Identify cut points (Step/###/Phase markers)
- [ ] Create agents at exactly 200 line intervals
- [ ] Name using standard pattern
- [ ] Define JSON handoffs
- [ ] Copy logic segments verbatim
- [ ] Generate individual agent files
- [ ] Create orchestrator config
- [ ] Report metrics

## Splitting Algorithm (Execute This Exactly)

```python
def split_at_boundaries(content, max_lines=200):
    agents = []
    current_start = 0
    
    while current_start < total_lines:
        # Look ahead up to 200 lines
        search_end = min(current_start + 200, total_lines)
        
        # Find ALL boundaries in this range
        boundaries_in_range = [
            b for b in boundaries 
            if current_start < b['line'] < search_end
        ]
        
        # Pick the LAST valid boundary before 200 lines
        if boundaries_in_range:
            # Sort by line number, take the last one
            split_point = max(boundaries_in_range, key=lambda x: x['line'])['line']
        else:
            # No boundary found - MUST find one by looking back
            # Check lines 180-200 for ANY boundary
            for line in range(search_end - 1, max(current_start + 150, current_start), -1):
                if lines[line].strip() == '':  # Empty line
                    split_point = line
                    break
                elif lines[line].strip().endswith('.'):  # End of sentence
                    split_point = line + 1
                    break
            else:
                # Emergency: split at 180 lines regardless
                split_point = current_start + 180
        
        agents.append((current_start, split_point))
        current_start = split_point
    
    return agents
```

## Example with Clean Boundaries

```
Input: 850-line agent with natural breaks

Line 001-179: Introduction (ends with empty line)
Line 180-359: ### Validation Section (ends with ```)
Line 360-545: ### Processing Logic (ends with empty line)
Line 546-728: ### Output Generation (ends with paragraph)
Line 729-850: ### Final Verification

Splitting Result:
- Agent 1: Lines 1-179 (179 lines) ✓ Stopped at empty line
- Agent 2: Lines 180-359 (179 lines) ✓ Stopped at code block end
- Agent 3: Lines 360-545 (185 lines) ✓ Stopped at empty line
- Agent 4: Lines 546-728 (182 lines) ✓ Stopped at paragraph end
- Agent 5: Lines 729-850 (121 lines) ✓ Natural end

NO mid-sentence cuts. ALL splits at logical boundaries.
```


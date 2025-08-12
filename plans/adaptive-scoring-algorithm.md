# Adaptive Scoring Algorithm - Mathematical Model

## Executive Summary
This document defines the mathematical model for the context-aware adaptive scoring system that adjusts weights and priorities based on detected API profiles.

## Core Algorithm

### 1. Base Score Calculation
```
S_base = Σ(r_i * w_i * c_i) / Σ(w_i)
```
Where:
- `r_i` = Rule score (0-100)
- `w_i` = Rule weight (profile-specific)
- `c_i` = Coverage factor (0-1)

### 2. Profile-Adjusted Weight Formula
```
w_adjusted = w_base * p_factor * d_factor
```
Where:
- `w_base` = Base rule weight
- `p_factor` = Profile priority factor
- `d_factor` = Detection confidence factor

### 3. Priority Hierarchy Model

#### Priority Categories
1. **Critical** (P1): Security, Authentication, Data Protection
2. **High** (P2): Functionality, Performance, Scalability  
3. **Medium** (P3): Documentation, Consistency, Best Practices
4. **Low** (P4): Optional enhancements, Nice-to-haves

#### Priority Weight Multipliers
```
P1_multiplier = 2.0
P2_multiplier = 1.5
P3_multiplier = 1.0
P4_multiplier = 0.5
```

### 4. Context-Aware Score Adjustment

```
S_final = S_base * C_profile * C_business * C_maturity
```

Where:
- `C_profile` = Profile confidence coefficient (0.5-1.0)
- `C_business` = Business context coefficient (0.8-1.2)
- `C_maturity` = API maturity coefficient (0.7-1.0)

## Profile-Specific Weight Distributions

### REST API Profile
```javascript
{
  security: 0.25,      // 25%
  functionality: 0.30,  // 30%
  documentation: 0.20,  // 20%
  consistency: 0.15,    // 15%
  best_practices: 0.10  // 10%
}
```

### GraphQL API Profile
```javascript
{
  security: 0.30,      // 30% (higher due to introspection risks)
  performance: 0.30,    // 30% (N+1 query concerns)
  documentation: 0.10,  // 10% (self-documenting)
  consistency: 0.15,    // 15%
  best_practices: 0.15  // 15%
}
```

### Enterprise SaaS Profile
```javascript
{
  security: 0.35,      // 35% (multi-tenant isolation critical)
  scalability: 0.25,    // 25% (must handle enterprise load)
  functionality: 0.20,  // 20%
  consistency: 0.10,    // 10%
  compliance: 0.10     // 10% (regulatory requirements)
}
```

### Microservice Profile
```javascript
{
  resilience: 0.30,    // 30% (circuit breakers, retries)
  performance: 0.25,    // 25% (latency critical)
  observability: 0.20,  // 20% (distributed tracing)
  consistency: 0.15,    // 15%
  best_practices: 0.10  // 10%
}
```

## Dynamic Weight Adjustment Algorithm

### Step 1: Detect Profile
```python
def detect_profile(spec):
    detection_result = ProfileDetectionEngine.detect(spec)
    return {
        'profile': detection_result.profile,
        'confidence': detection_result.confidence,
        'signals': detection_result.signals
    }
```

### Step 2: Calculate Base Weights
```python
def calculate_base_weights(profile, rules):
    weights = {}
    for rule in rules:
        category = rule.category
        base_weight = profile.weight_distribution[category]
        weights[rule.id] = base_weight * rule.importance
    return weights
```

### Step 3: Apply Context Modifiers
```python
def apply_context_modifiers(weights, context):
    adjusted = {}
    for rule_id, weight in weights.items():
        # Business context adjustment
        if context.business_domain == 'finance':
            if rule_id.startswith('SEC'):  # Security rules
                weight *= 1.5  # 50% increase for financial APIs
        
        # Maturity adjustment
        if context.api_version < '1.0.0':
            if rule_id.startswith('DOC'):  # Documentation rules
                weight *= 0.7  # 30% reduction for pre-release
        
        adjusted[rule_id] = weight
    return adjusted
```

### Step 4: Normalize Weights
```python
def normalize_weights(weights):
    total = sum(weights.values())
    return {k: v/total for k, v in weights.items()}
```

## Scoring Examples

### Example 1: Simple REST API
```
Input:
- Detected Profile: REST
- Confidence: 0.95
- Security Score: 80/100
- Functionality Score: 90/100
- Documentation Score: 70/100

Calculation:
S_base = (80*0.25 + 90*0.30 + 70*0.20) / 1.0
S_base = (20 + 27 + 14) = 61

S_final = 61 * 0.95 * 1.0 * 0.9
S_final = 52.1 → Grade: F (needs improvement)
```

### Example 2: Enterprise SaaS API
```
Input:
- Detected Profile: Enterprise SaaS
- Confidence: 0.98
- Security Score: 95/100 (with multi-tenant headers)
- Scalability Score: 85/100
- Functionality Score: 88/100

Calculation:
S_base = (95*0.35 + 85*0.25 + 88*0.20) / 0.8
S_base = (33.25 + 21.25 + 17.6) / 0.8 = 90.1

S_final = 90.1 * 0.98 * 1.1 * 1.0
S_final = 97.1 → Grade: A (excellent)
```

## Confidence Score Impact

The detection confidence affects final scoring:

```
confidence >= 0.9: Full weight application
confidence 0.7-0.9: 90% weight application  
confidence 0.5-0.7: 80% weight application
confidence < 0.5: Fall back to default profile
```

## Feedback Loop Integration

### Weight Learning Formula
```
w_new = w_old + α * (feedback_score - predicted_score) * learning_rate
```

Where:
- `α` = Learning rate (0.01)
- `feedback_score` = User-provided accuracy rating
- `predicted_score` = System-calculated score

### Pattern Recognition
When feedback consistently indicates misclassification:
1. Adjust detection patterns
2. Update signal weights
3. Refine confidence thresholds

## Implementation Priority

### Phase 1: Core Algorithm
- Base score calculation
- Profile weight distributions
- Simple context modifiers

### Phase 2: Advanced Features
- Business domain detection
- Maturity analysis
- Dynamic weight learning

### Phase 3: Optimization
- Caching weight calculations
- Parallel rule evaluation
- Performance tuning

## Performance Considerations

### Time Complexity
- Profile detection: O(n) where n = spec endpoints
- Weight calculation: O(m) where m = number of rules
- Total: O(n + m) - linear complexity maintained

### Space Complexity
- Weight cache: O(p * r) where p = profiles, r = rules
- Detection patterns: O(p) - one pattern set per profile

## Validation Metrics

### Algorithm Accuracy
- Target: 95% agreement with expert grading
- Measure: Correlation coefficient with manual grades
- Threshold: r > 0.9

### Performance Targets
- Grading time: < 2 seconds
- Memory usage: < 100MB
- Cache hit rate: > 80%

## Edge Cases

### Mixed API Types
When an API exhibits multiple patterns:
1. Use weighted average of top 2 profiles
2. Apply confidence penalty (max 0.8)
3. Suggest manual profile selection

### Unknown Patterns
When detection confidence < 0.5:
1. Apply default "Generic API" profile
2. Use balanced weight distribution
3. Flag for manual review

## Future Enhancements

1. **Machine Learning Integration**
   - Train on historical grading data
   - Predict optimal weights
   - Auto-tune thresholds

2. **Industry-Specific Profiles**
   - Healthcare (HIPAA compliance)
   - Finance (PCI DSS)
   - Government (FedRAMP)

3. **Multi-Profile Grading**
   - Grade against multiple profiles
   - Provide comparative analysis
   - Recommend best-fit profile

## Conclusion

This adaptive scoring algorithm provides:
- Context-aware grading based on API type
- Dynamic weight adjustment
- Business domain consideration
- Continuous improvement through feedback

The system maintains backward compatibility while enabling sophisticated, nuanced API grading that adapts to different contexts and requirements.
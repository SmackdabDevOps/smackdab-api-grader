# Phase 2: Context-Aware Grading System - Multi-Agent Orchestration Plan

## Executive Summary
Transform the rigid Smackdab-specific API grader into an intelligent, context-aware system that adapts its grading criteria based on the type of API being evaluated. This plan orchestrates multiple specialized agents working in parallel to implement the Phase 2 vision outlined in VERSION_INFO.md.

## Current State Analysis
- **Problem**: Grader is hard-coded for Smackdab multi-tenant SaaS patterns
- **Impact**: Harsh/inappropriate grading for simple APIs, microservices, GraphQL, etc.
- **Solution**: Context-aware profiles with adaptive rule sets

## Phase 2 Goals (from VERSION_INFO.md)
1. Add API design profiles (REST, GraphQL, gRPC)
2. Implement priority-based scoring
3. Add smart validation that understands business context
4. Create learning feedback system

## Agent Orchestration Architecture

### Parallel Track 1: Profile System Implementation
**Agents**: `code-generator`, `database-schema-designer`, `test-development-engineer`

#### Agent 1A: Profile Schema Designer (`database-schema-designer`)
**Task**: Design profile storage and configuration schema
**Deliverables**:
- Database schema for profile storage in `/src/mcp/persistence/profiles-schema.sql`
- Profile configuration structure (JSON schema)
- Profile-rule mapping tables

**Instructions**:
```
Create database schema for storing API profiles with:
- profile_definitions table (id, name, type, rules_config, priority_weights)
- profile_rules_mapping table (profile_id, rule_id, weight, required)
- profile_detection_patterns table (profile_id, pattern_type, pattern_value)
Reference existing schema at: /src/mcp/persistence/migrate-unified.ts
```

#### Agent 1B: Profile Engine Implementation (`code-generator`)
**Task**: Implement core profile detection and management
**Deliverables**:
- `/src/app/profiles/profile-engine.ts` - Main profile detection logic
- `/src/app/profiles/profile-types.ts` - TypeScript interfaces
- `/src/app/profiles/profile-detector.ts` - Auto-detection logic

**Instructions**:
```
Implement profile system:
1. Read existing pipeline at /src/app/pipeline.ts
2. Create ProfileEngine class with methods:
   - detectProfile(openApiSpec): ProfileType
   - getProfileRules(profile): RuleSet
   - getProfileWeights(profile): WeightMap
3. Integrate with existing semantic validators in /src/app/semantic/
```

#### Agent 1C: Profile Tests (`test-development-engineer`)
**Task**: Create comprehensive test suite for profiles
**Deliverables**:
- `/test/unit/profiles/profile-detection.test.ts`
- `/test/integration/profiles/profile-grading.test.ts`
- Test fixtures for each profile type

**Instructions**:
```
Create tests for profile system:
- Test detection of REST, GraphQL, gRPC, microservice patterns
- Test profile-specific rule application
- Test weight adjustments per profile
Reference test patterns in /test/unit/
```

### Parallel Track 2: Adaptive Scoring System
**Agents**: `algorithm-researcher`, `code-generator`, `test-development-engineer`

#### Agent 2A: Scoring Algorithm Design (`algorithm-researcher`)
**Task**: Design priority-based scoring algorithm
**Deliverables**:
- `/plans/adaptive-scoring-algorithm.md` - Mathematical model
- Weight calculation formulas
- Priority hierarchy documentation

**Instructions**:
```
Design adaptive scoring algorithm:
1. Analyze current scoring at /src/app/scoring/coverage-scoring.ts
2. Create mathematical model for:
   - Dynamic weight adjustment based on context
   - Priority-based rule evaluation
   - Confidence scoring for auto-detection
3. Document algorithm with examples
```

#### Agent 2B: Scoring Implementation (`code-generator`)
**Task**: Implement new adaptive scoring engine
**Deliverables**:
- `/src/app/scoring/adaptive-scoring.ts` - New scoring engine
- `/src/app/scoring/priority-calculator.ts` - Priority logic
- Integration with profile system

**Instructions**:
```
Implement adaptive scoring:
1. Extend existing scoring at /src/app/scoring/coverage-scoring.ts
2. Create AdaptiveScoringEngine class:
   - calculateScore(results, profile, priorities)
   - adjustWeights(baseWeights, context)
   - applyPriorities(rules, businessContext)
3. Maintain backward compatibility with legacy scoring
```

#### Agent 2C: Scoring Tests (`test-development-engineer`)
**Task**: Test adaptive scoring across profiles
**Deliverables**:
- `/test/unit/scoring/adaptive-scoring.test.ts`
- `/test/integration/scoring/profile-scoring.test.ts`
- Comparison tests vs legacy scoring

**Instructions**:
```
Test adaptive scoring:
- Test same API with different profiles
- Verify priority application
- Test weight adjustments
- Compare scores between profiles
Reference existing tests at /test/unit/scoring/
```

### Parallel Track 3: Context Detection System
**Agents**: `ml-pipeline-architect`, `code-generator`, `test-development-engineer`

#### Agent 3A: ML Detection Pipeline (`ml-pipeline-architect`)
**Task**: Design ML-based API type detection
**Deliverables**:
- `/src/app/detection/ml-detector.ts` - ML detection pipeline
- Feature extraction logic
- Confidence scoring system

**Instructions**:
```
Create ML detection pipeline:
1. Extract features from OpenAPI spec:
   - Path patterns (/graphql, /api/v1, etc.)
   - Operation naming conventions
   - Schema structures
   - Header patterns (X-Organization-ID, etc.)
2. Implement confidence scoring
3. Fall back to rule-based detection
Reference OpenAPI parsing at /src/app/pipeline.ts
```

#### Agent 3B: Pattern Library (`code-generator`)
**Task**: Build comprehensive pattern library
**Deliverables**:
- `/src/app/detection/patterns/rest-patterns.ts`
- `/src/app/detection/patterns/graphql-patterns.ts`
- `/src/app/detection/patterns/grpc-patterns.ts`
- `/src/app/detection/patterns/saas-patterns.ts`

**Instructions**:
```
Create pattern libraries for each API type:
REST patterns:
- RESTful resource paths
- Standard HTTP methods
- HATEOAS links

GraphQL patterns:
- /graphql endpoint
- Query/Mutation/Subscription operations
- GraphQL schema types

gRPC patterns:
- Service definitions
- RPC methods
- Protocol buffer schemas

Multi-tenant SaaS patterns:
- Tenant headers (X-Organization-ID)
- Branch headers (X-Branch-ID)
- Subscription tiers
```

#### Agent 3C: Detection Tests (`test-development-engineer`)
**Task**: Test context detection accuracy
**Deliverables**:
- `/test/unit/detection/pattern-matching.test.ts`
- `/test/integration/detection/ml-detection.test.ts`
- Test fixtures for ambiguous cases

**Instructions**:
```
Test detection system:
- Test clear-cut cases (obvious REST, GraphQL)
- Test ambiguous/hybrid APIs
- Test confidence thresholds
- Test fallback mechanisms
Use fixtures from /test/fixtures/
```

### Parallel Track 4: Business Context Understanding
**Agents**: `system-architect`, `code-generator`, `config-generator`

#### Agent 4A: Context Architecture (`system-architect`)
**Task**: Design business context framework
**Deliverables**:
- `/plans/business-context-architecture.md`
- Context extraction strategy
- Integration points documentation

**Instructions**:
```
Design business context system:
1. Analyze how to extract business context from:
   - API descriptions
   - Tag structures
   - Path hierarchies
   - Schema naming
2. Design context storage and retrieval
3. Plan integration with scoring
Reference current semantic checks at /src/app/semantic/
```

#### Agent 4B: Context Implementation (`code-generator`)
**Task**: Implement business context analyzer
**Deliverables**:
- `/src/app/context/business-analyzer.ts`
- `/src/app/context/domain-detector.ts`
- `/src/app/context/requirement-mapper.ts`

**Instructions**:
```
Implement context understanding:
1. Extract business domain from API
2. Map domain to requirement sets
3. Adjust rules based on business needs
Example: E-commerce API needs cart/checkout patterns
Example: Analytics API needs batch/streaming patterns
```

#### Agent 4C: Context Configuration (`config-generator`)
**Task**: Create configuration system for contexts
**Deliverables**:
- `/config/contexts/e-commerce.json`
- `/config/contexts/analytics.json`
- `/config/contexts/healthcare.json`
- Context configuration schema

**Instructions**:
```
Create context configurations:
- Domain-specific rule sets
- Industry compliance requirements
- Performance expectations
- Security requirements
Make configurations loadable and extensible
```

### Parallel Track 5: Learning Feedback System
**Agents**: `data-pipeline-architect`, `frontend-ui-specialist`, `code-generator`

#### Agent 5A: Feedback Pipeline (`data-pipeline-architect`)
**Task**: Design feedback collection and processing
**Deliverables**:
- `/src/app/feedback/pipeline.ts`
- Feedback storage schema
- Analytics pipeline design

**Instructions**:
```
Design feedback system:
1. Collect user feedback on grading accuracy
2. Store feedback with context
3. Process feedback for pattern learning
4. Generate improvement suggestions
Reference existing persistence at /src/mcp/persistence/
```

#### Agent 5B: Feedback UI (`frontend-ui-specialist`)
**Task**: Create feedback interface components
**Deliverables**:
- `/src/ui/feedback/feedback-widget.tsx`
- `/src/ui/feedback/accuracy-reporter.tsx`
- Feedback API endpoints

**Instructions**:
```
Create feedback UI:
1. Simple widget for "Was this grading accurate?"
2. Detailed feedback form for specifics
3. Suggestion interface for rule adjustments
4. Admin dashboard for feedback review
Note: SSE server at /src/mcp/server-sse-simple.ts
```

#### Agent 5C: Learning Engine (`code-generator`)
**Task**: Implement feedback-based learning
**Deliverables**:
- `/src/app/learning/rule-adjuster.ts`
- `/src/app/learning/weight-optimizer.ts`
- `/src/app/learning/pattern-learner.ts`

**Instructions**:
```
Implement learning system:
1. Analyze feedback patterns
2. Suggest rule weight adjustments
3. Identify new patterns from feedback
4. Generate rule modification proposals
Must maintain audit trail of changes
```

### Parallel Track 6: Integration and Migration
**Agents**: `migration-specialist`, `devops`, `test-development-engineer`

#### Agent 6A: Migration Strategy (`migration-specialist`)
**Task**: Plan migration from rigid to adaptive system
**Deliverables**:
- `/plans/migration-strategy.md`
- Rollback procedures
- Feature flag implementation

**Instructions**:
```
Design migration strategy:
1. Phase 1: Add profile system alongside existing
2. Phase 2: Route based on feature flags
3. Phase 3: Gradual rollout with monitoring
4. Phase 4: Full cutover with legacy mode option
Reference current pipeline at /src/app/pipeline.ts
```

#### Agent 6B: Deployment Updates (`devops`)
**Task**: Update deployment for new features
**Deliverables**:
- Updated `Dockerfile`
- Updated `render.yaml`
- New environment variables
- Monitoring setup

**Instructions**:
```
Update deployment configuration:
1. Add profile configuration mounting
2. Add ML model deployment
3. Update health checks
4. Add performance monitoring
5. Configure feature flags
Current deployment at /Dockerfile and /render.yaml
```

#### Agent 6C: Integration Tests (`test-development-engineer`)
**Task**: Create end-to-end integration tests
**Deliverables**:
- `/test/e2e/profile-grading.test.ts`
- `/test/e2e/adaptive-scoring.test.ts`
- `/test/e2e/feedback-loop.test.ts`

**Instructions**:
```
Create integration tests:
1. Test full grading with profile detection
2. Test scoring adaptation
3. Test feedback collection and learning
4. Test migration scenarios
Use existing E2E patterns from /test/e2e/
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
- **Parallel Tracks 1 & 2**: Profile system and adaptive scoring
- **Deliverable**: Basic profile detection with adjusted scoring

### Phase 2: Intelligence (Week 2)
- **Parallel Tracks 3 & 4**: Context detection and business understanding
- **Deliverable**: Smart API type detection with context-aware grading

### Phase 3: Learning (Week 3)
- **Parallel Track 5**: Feedback and learning system
- **Deliverable**: Self-improving grader with feedback loop

### Phase 4: Deployment (Week 4)
- **Parallel Track 6**: Integration and migration
- **Deliverable**: Production deployment with gradual rollout

## Success Metrics
1. **Detection Accuracy**: 95% correct API type identification
2. **Grading Satisfaction**: 80% user agreement with grades
3. **Performance**: <2 second grading time maintained
4. **Flexibility**: Support for 5+ API profile types
5. **Learning**: 10% improvement in accuracy over 3 months

## Risk Mitigation
1. **Backward Compatibility**: Maintain legacy mode flag
2. **Performance**: Cache profile detection results
3. **Accuracy**: Manual override for profile selection
4. **Complexity**: Incremental rollout with monitoring

## Agent Coordination Points
1. **Daily Sync**: Profile system ↔ Scoring system
2. **Integration Points**: Detection → Context → Scoring
3. **Feedback Loop**: Learning → All systems
4. **Testing Coordination**: Shared fixtures and test data

## Next Steps
1. Launch all Track 1 agents in parallel
2. Begin architectural design for Tracks 3 & 4
3. Set up integration test framework
4. Create shared development environment

## Resources Required
- Access to `/src/app/` for core implementation
- Database schema modification permissions
- Test environment for validation
- Deployment pipeline access
- User feedback collection mechanism

## Dependencies
- Existing codebase understanding
- Current test suite functionality
- Database migration tools
- Deployment infrastructure
- Monitoring systems

This orchestration plan enables parallel development while maintaining system coherence. Each agent has clear, specific tasks with defined deliverables and integration points.
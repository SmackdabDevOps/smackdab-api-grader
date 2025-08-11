# Epic 1: Profile System User Stories

## Overview
Enable the API grader to adapt its grading criteria based on the type of API being evaluated, moving away from rigid Smackdab-specific patterns.

---

## Story 1.1: Profile Definition and Storage
**As a** system administrator  
**I want to** define and manage different API profile types  
**So that** the grader can apply appropriate rules for each API type

### Acceptance Criteria
1. Admin can create new API profiles (REST, GraphQL, gRPC, Microservice, Enterprise SaaS)
2. Each profile contains:
   - Unique identifier and display name
   - Associated rule sets with weights
   - Priority configurations
   - Detection patterns
3. Profiles are persisted in database with versioning
4. Profiles can be activated/deactivated without deletion
5. Profile changes are audited with timestamp and user

### Technical Context for API Contract
- **Endpoint**: `POST /api/admin/profiles`
- **Request**: Profile definition with rules and weights
- **Response**: Created profile with ID and validation results
- **Storage**: PostgreSQL with migration support

### Edge Cases
- Duplicate profile names (system should auto-suffix with version)
- Invalid rule references (validate against rule registry)
- Circular dependencies between profiles
- Profile deletion with active gradings (soft delete only)
- Concurrent profile modifications (optimistic locking)

---

## Story 1.2: Profile Auto-Detection
**As a** developer  
**I want** the system to automatically detect my API type  
**So that** I receive appropriate grading without manual configuration

### Acceptance Criteria
1. System analyzes OpenAPI spec structure
2. Detection confidence score ≥ 85% triggers auto-selection
3. Detection considers:
   - Path patterns (`/graphql`, `/api/v1/*`, `/grpc/*`)
   - Operation naming conventions
   - Header patterns (X-Organization-ID, X-API-Version)
   - Schema structures
4. Multiple profile matches trigger user confirmation
5. Detection results are explainable to user

### Technical Context for API Contract
- **Endpoint**: `POST /api/profiles/detect`
- **Request**: OpenAPI specification
- **Response**: Detected profile with confidence scores and reasoning
- **Performance**: < 500ms detection time

### Edge Cases
- Hybrid APIs (REST + GraphQL endpoints)
- Custom/proprietary API patterns
- Minimal OpenAPI specs with insufficient patterns
- Conflicting detection signals
- Legacy API versions with mixed patterns

---

## Story 1.3: Manual Profile Selection Override
**As a** developer  
**I want to** manually select an API profile  
**So that** I can override auto-detection when needed

### Acceptance Criteria
1. User can view all available profiles with descriptions
2. Profile selection persists across grading sessions
3. Manual selection overrides auto-detection
4. System shows comparison between auto-detected and manual selection
5. User can switch profiles mid-grading with re-calculation

### Technical Context for API Contract
- **Endpoint**: `PUT /api/grading-sessions/{id}/profile`
- **Request**: Profile ID and optional override reason
- **Response**: Updated grading with new profile applied
- **State**: Session-based profile persistence

### Edge Cases
- Switching to incompatible profile mid-session
- Profile no longer available (deleted/deactivated)
- Performance impact of profile switching on large APIs
- Maintaining grading history across profile changes

---

## Story 1.4: Profile-Specific Rule Management
**As a** system administrator  
**I want to** configure which rules apply to each profile  
**So that** grading is contextually appropriate

### Acceptance Criteria
1. Admin can enable/disable rules per profile
2. Rule weights are adjustable per profile (0-100)
3. Rules can be marked as "required" or "optional"
4. Rule groups can be managed as sets
5. Changes to rules cascade to active profiles appropriately

### Technical Context for API Contract
- **Endpoint**: `PUT /api/admin/profiles/{id}/rules`
- **Request**: Rule configurations with weights and requirements
- **Response**: Updated profile with validation results
- **Validation**: Ensure minimum viable rule set per profile

### Edge Cases
- Removing critical rules (system enforces minimum set)
- Weight normalization when total exceeds 100
- Rule conflicts within a profile
- Rules dependent on other disabled rules
- Profile becomes invalid after rule changes

---

## Story 1.5: Profile Template Library
**As a** system administrator  
**I want to** start from pre-built profile templates  
**So that** I can quickly configure standard API types

### Acceptance Criteria
1. System provides templates for common API types:
   - RESTful CRUD API
   - GraphQL API
   - gRPC Service
   - Microservice
   - Enterprise Multi-tenant SaaS
   - Public API
   - Internal Service API
2. Templates are clonable and customizable
3. Templates include industry best practices
4. Template updates don't affect cloned profiles
5. Custom templates can be saved to library

### Technical Context for API Contract
- **Endpoint**: `GET /api/profiles/templates`
- **Response**: List of available templates with metadata
- **Endpoint**: `POST /api/profiles/from-template`
- **Request**: Template ID and customizations
- **Response**: New profile created from template

### Edge Cases
- Template versioning and migration
- Corrupted template definitions
- Templates for emerging API patterns (WebSocket, SSE)
- Regulatory compliance templates (HIPAA, PCI)
- Organization-specific template sharing

---

## Story 1.6: Profile Performance Monitoring
**As a** system administrator  
**I want to** monitor profile detection accuracy and performance  
**So that** I can optimize profile configurations

### Acceptance Criteria
1. Dashboard shows profile usage statistics
2. Detection accuracy metrics per profile
3. Average grading time per profile
4. User satisfaction scores per profile
5. Misdetection patterns are identified and reported

### Technical Context for API Contract
- **Endpoint**: `GET /api/admin/profiles/metrics`
- **Response**: Aggregated metrics with time-series data
- **Real-time**: WebSocket updates for live monitoring
- **Storage**: Time-series database for metrics

### Edge Cases
- High-volume grading performance impact
- Metrics collection affecting grading performance
- Data retention and aggregation policies
- Privacy considerations for API metadata
- Anomaly detection for unusual patterns

---

## Story 1.7: Profile Migration and Versioning
**As a** system administrator  
**I want to** version and migrate profiles safely  
**So that** changes don't break existing integrations

### Acceptance Criteria
1. Profiles support semantic versioning
2. Breaking changes create new version
3. Non-breaking changes update minor version
4. Migration path between profile versions
5. Rollback capability within 24 hours

### Technical Context for API Contract
- **Endpoint**: `POST /api/admin/profiles/{id}/versions`
- **Request**: New version with changes and migration strategy
- **Response**: Version created with migration status
- **Background Job**: Async migration of existing gradings

### Edge Cases
- Concurrent gradings during migration
- Failed migrations requiring rollback
- Version conflicts across distributed system
- Data loss prevention during migration
- Performance degradation during migration

---

## Dependencies
- Database schema for profile storage
- Rule engine refactoring to support weights
- OpenAPI parser enhancements
- Admin UI components
- Metrics collection infrastructure
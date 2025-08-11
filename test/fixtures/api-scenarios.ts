/**
 * Comprehensive test fixtures for API scenarios
 * Used across multiple test suites to ensure consistent testing
 */

export const API_SCENARIOS = {
  // Perfect implementation with all best practices
  PERFECT_API: `
openapi: 3.0.3
info:
  title: Perfect API Specification
  version: 2.1.0
  description: |
    A comprehensive API demonstrating all best practices for enterprise-grade APIs.
    
    ## Performance SLA
    - 95th percentile response time: < 200ms
    - 99.9% uptime guarantee
    - Rate limit: 1000 requests/minute per API key
    
    ## Security
    - OAuth 2.0 with PKCE for authentication
    - Multi-tenant isolation with organization-level data separation
    - All data encrypted in transit and at rest
  contact:
    name: API Team
    email: api-team@example.com
    url: https://api.example.com/support
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
  termsOfService: https://api.example.com/terms
servers:
  - url: https://api.example.com/v2
    description: Production server
  - url: https://staging-api.example.com/v2
    description: Staging server
paths:
  /api/v2/users:
    parameters:
      - $ref: '#/components/parameters/OrganizationHeader'
      - $ref: '#/components/parameters/BranchHeader'
    get:
      operationId: listUsers
      summary: List users with advanced filtering and pagination
      description: |
        Retrieve a paginated list of users within the organization with support for:
        - Key-set pagination for consistent results
        - Advanced filtering by multiple criteria
        - Sorting by various fields
        - Include/exclude related resources
      tags: [Users]
      parameters:
        - $ref: '#/components/parameters/AfterKey'
        - $ref: '#/components/parameters/BeforeKey'
        - $ref: '#/components/parameters/Limit'
        - name: filter[name]
          in: query
          schema:
            type: string
            maxLength: 100
          description: Filter by user name (partial match)
        - name: filter[email]
          in: query
          schema:
            type: string
            format: email
          description: Filter by email address (exact match)
        - name: filter[status]
          in: query
          schema:
            type: string
            enum: [active, inactive, pending]
          description: Filter by user status
        - name: sort
          in: query
          schema:
            type: string
            enum: [name, email, created_at, updated_at]
            default: created_at
          description: Sort field
        - name: order
          in: query
          schema:
            type: string
            enum: [asc, desc]
            default: desc
          description: Sort order
        - name: include
          in: query
          style: form
          explode: false
          schema:
            type: array
            items:
              type: string
              enum: [profile, permissions, activity]
          description: Related resources to include
      responses:
        '200':
          description: Users retrieved successfully
          headers:
            ETag:
              description: Resource version for caching
              schema:
                type: string
                pattern: '^"[a-f0-9]{32}"$'
            Cache-Control:
              description: Cache control directives
              schema:
                type: string
                example: "public, max-age=300"
            X-RateLimit-Limit:
              description: Request limit per window
              schema:
                type: integer
                example: 1000
            X-RateLimit-Remaining:
              description: Requests remaining in current window
              schema:
                type: integer
                example: 999
            X-RateLimit-Reset:
              description: Time when limit resets (Unix timestamp)
              schema:
                type: integer
                example: 1609459200
            Link:
              description: Pagination links (RFC 5988)
              schema:
                type: string
                example: '<https://api.example.com/v2/users?after_key=abc123>; rel="next"'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
              examples:
                default:
                  summary: Standard user list
                  value:
                    success: true
                    data:
                      - id: 12345
                        name: "Alice Johnson"
                        email: "alice@example.com"
                        status: "active"
                        created_at: "2023-01-15T10:30:00Z"
                        updated_at: "2023-06-20T14:45:00Z"
                        _links:
                          self: 
                            href: "/api/v2/users/12345"
                          profile: 
                            href: "/api/v2/users/12345/profile"
                      - id: 12346
                        name: "Bob Smith"
                        email: "bob@example.com"
                        status: "active"
                        created_at: "2023-02-10T09:15:00Z"
                        updated_at: "2023-06-18T16:20:00Z"
                        _links:
                          self: 
                            href: "/api/v2/users/12346"
                          profile: 
                            href: "/api/v2/users/12346/profile"
                    meta:
                      total: 1247
                      page_size: 20
                      has_more: true
                      next_cursor: "eyJpZCI6MTIzNDZ9"
                      prev_cursor: null
                    _links:
                      self: 
                        href: "/api/v2/users?limit=20"
                      next: 
                        href: "/api/v2/users?after_key=eyJpZCI6MTIzNDZ9&limit=20"
                empty:
                  summary: Empty result set
                  value:
                    success: true
                    data: []
                    meta:
                      total: 0
                      page_size: 20
                      has_more: false
                      next_cursor: null
                      prev_cursor: null
                    _links:
                      self: 
                        href: "/api/v2/users?limit=20"
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '422':
          $ref: '#/components/responses/ValidationError'
        '429':
          $ref: '#/components/responses/RateLimited'
        '500':
          $ref: '#/components/responses/InternalError'
        '503':
          $ref: '#/components/responses/ServiceUnavailable'
      security:
        - OAuth2: [users:read]
    post:
      operationId: createUser
      summary: Create a new user
      description: |
        Create a new user in the organization with comprehensive validation.
        
        ## Business Rules
        - Email addresses must be unique within the organization
        - Names must be at least 2 characters long
        - Default status is 'pending' until email verification
        
        ## Async Processing
        User creation triggers several background processes:
        - Welcome email sending
        - Permission setup based on role
        - Audit log creation
      tags: [Users]
      requestBody:
        description: User creation data
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
            examples:
              standard:
                summary: Standard user creation
                value:
                  name: "Jane Doe"
                  email: "jane.doe@example.com"
                  role: "user"
                  department: "Engineering"
                  metadata:
                    source: "admin_panel"
                    referrer: "direct"
              admin:
                summary: Admin user creation
                value:
                  name: "John Admin"
                  email: "john.admin@example.com"
                  role: "admin"
                  department: "IT"
                  permissions:
                    - "users:read"
                    - "users:write"
                    - "admin:access"
                  metadata:
                    source: "api"
                    created_by: 12345
      responses:
        '201':
          description: User created successfully
          headers:
            Location:
              description: URL of the created user
              schema:
                type: string
                format: uri
                example: "/api/v2/users/12347"
            X-Request-ID:
              description: Unique request identifier for tracking
              schema:
                type: string
                format: uuid
                example: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
              examples:
                created:
                  summary: Successfully created user
                  value:
                    success: true
                    data:
                      id: 12347
                      name: "Jane Doe"
                      email: "jane.doe@example.com"
                      status: "pending"
                      role: "user"
                      department: "Engineering"
                      created_at: "2023-08-10T15:30:00Z"
                      updated_at: "2023-08-10T15:30:00Z"
                      _links:
                        self: 
                          href: "/api/v2/users/12347"
                        verify_email: 
                          href: "/api/v2/users/12347/verify-email"
                          title: "Send verification email"
        '202':
          description: User creation accepted for processing
          headers:
            Location:
              description: URL to check creation status
              schema:
                type: string
                format: uri
                example: "/api/v2/jobs/abc123"
            X-Request-ID:
              schema:
                type: string
                format: uuid
          content:
            application/json:
              schema:
                type: object
                required: [success, message, job_id]
                properties:
                  success:
                    type: boolean
                    example: true
                  message:
                    type: string
                    example: "User creation initiated"
                  job_id:
                    type: string
                    format: uuid
                    example: "j_abc123"
                  estimated_completion:
                    type: string
                    format: date-time
                    example: "2023-08-10T15:32:00Z"
                  _links:
                    status:
                      type: object
                      properties:
                        href:
                          type: string
                          example: "/api/v2/jobs/abc123"
                        title:
                          type: string
                          example: "Check creation status"
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'
        '422':
          $ref: '#/components/responses/ValidationError'
        '429':
          $ref: '#/components/responses/RateLimited'
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [users:write]
      callbacks:
        userCreated:
          '{$request.body#/webhook_url}':
            post:
              summary: User creation webhook
              requestBody:
                content:
                  application/json:
                    schema:
                      $ref: '#/components/schemas/UserCreatedWebhook'
              responses:
                '200':
                  description: Webhook received successfully
  /api/v2/users/{id}:
    parameters:
      - $ref: '#/components/parameters/UserID'
      - $ref: '#/components/parameters/OrganizationHeader'
      - $ref: '#/components/parameters/BranchHeader'
    get:
      operationId: getUser
      summary: Retrieve user by ID
      description: |
        Get detailed information about a specific user by their unique identifier.
        
        ## Caching
        This endpoint supports conditional requests using ETag headers.
        Use If-None-Match header to avoid unnecessary data transfer.
      tags: [Users]
      parameters:
        - name: include
          in: query
          style: form
          explode: false
          schema:
            type: array
            items:
              type: string
              enum: [profile, permissions, activity, audit_log]
          description: Related resources to include in response
      responses:
        '200':
          description: User retrieved successfully
          headers:
            ETag:
              schema:
                type: string
              description: Entity tag for caching
            Last-Modified:
              schema:
                type: string
                format: date-time
              description: Last modification timestamp
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserDetailResponse'
        '304':
          description: Not modified (when using If-None-Match)
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [users:read]
    put:
      operationId: updateUser
      summary: Update user information
      description: |
        Update an existing user's information with optimistic concurrency control.
        
        ## Concurrency Control
        Use the If-Match header with the current ETag to prevent conflicting updates.
      tags: [Users]
      parameters:
        - name: If-Match
          in: header
          required: true
          schema:
            type: string
          description: ETag of the current user version
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateUserRequest'
      responses:
        '200':
          description: User updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '409':
          description: Conflict - user was modified by another request
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ErrorResponse'
                  - type: object
                    properties:
                      error:
                        properties:
                          current_version:
                            type: string
                            description: Current ETag of the resource
        '412':
          description: Precondition failed - If-Match header required or invalid
        '422':
          $ref: '#/components/responses/ValidationError'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [users:write]
    delete:
      operationId: deleteUser
      summary: Delete user
      description: |
        Soft delete a user account. The user will be marked as deleted but data
        is retained for compliance purposes.
        
        ## Data Retention
        - User data is anonymized after 30 days
        - Audit logs are retained for 7 years
        - Hard deletion requires separate compliance process
      tags: [Users]
      responses:
        '204':
          description: User deleted successfully
        '404':
          $ref: '#/components/responses/NotFound'
        '409':
          description: Cannot delete user with active dependencies
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ErrorResponse'
                  - type: object
                    properties:
                      error:
                        properties:
                          dependencies:
                            type: array
                            items:
                              type: string
                            example: ["active_orders", "pending_invoices"]
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [users:delete]
  /api/v2/users/batch:
    parameters:
      - $ref: '#/components/parameters/OrganizationHeader'
      - $ref: '#/components/parameters/BranchHeader'
    post:
      operationId: batchCreateUsers
      summary: Batch create multiple users
      description: |
        Create multiple users in a single atomic operation.
        
        ## Async Processing
        Large batches (>100 users) are processed asynchronously.
        Use the job tracking endpoint to monitor progress.
      tags: [Users, Batch]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [users]
              properties:
                users:
                  type: array
                  minItems: 1
                  maxItems: 1000
                  items:
                    $ref: '#/components/schemas/CreateUserRequest'
                options:
                  type: object
                  properties:
                    continue_on_error:
                      type: boolean
                      default: false
                      description: Continue processing if individual user creation fails
                    send_invitations:
                      type: boolean
                      default: true
                      description: Send email invitations to created users
                    webhook_url:
                      type: string
                      format: uri
                      description: Webhook URL for batch completion notification
      responses:
        '202':
          description: Batch creation accepted for processing
          content:
            application/json:
              schema:
                type: object
                required: [success, job_id, batch_size]
                properties:
                  success:
                    type: boolean
                  job_id:
                    type: string
                    format: uuid
                  batch_size:
                    type: integer
                  estimated_completion:
                    type: string
                    format: date-time
                  _links:
                    status:
                      type: object
                      properties:
                        href:
                          type: string
                        title:
                          type: string
        '400':
          $ref: '#/components/responses/BadRequest'
        '413':
          description: Batch size too large
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ErrorResponse'
                  - type: object
                    properties:
                      error:
                        properties:
                          max_batch_size:
                            type: integer
                            example: 1000
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [users:write, batch:write]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      description: |
        OAuth 2.0 with PKCE for secure authentication.
        Scopes provide fine-grained access control.
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          refreshUrl: https://auth.example.com/oauth/refresh
          scopes:
            users:read: Read user information
            users:write: Create and update users
            users:delete: Delete users
            batch:write: Perform batch operations
            admin:access: Administrative access to all resources
  parameters:
    OrganizationHeader:
      name: X-Organization-ID
      in: header
      required: true
      schema:
        type: integer
        format: int64
        minimum: 1
      description: |
        Organization identifier for multi-tenant data isolation.
        All requests must include this header to ensure proper data segmentation.
      example: 12345
    BranchHeader:
      name: X-Branch-ID
      in: header
      required: true
      schema:
        type: integer
        format: int64
        minimum: 1
      description: |
        Branch identifier for organization-level data isolation.
        Enables branch-specific data access within an organization.
      example: 67890
    UserID:
      name: id
      in: path
      required: true
      schema:
        type: integer
        format: int64
        minimum: 1
      description: Unique user identifier
      example: 12345
    AfterKey:
      name: after_key
      in: query
      schema:
        type: string
        pattern: '^[A-Za-z0-9+/]+=*$'
      description: |
        Cursor for key-set pagination (forward direction).
        Base64-encoded cursor pointing to the last item in the previous page.
      example: "eyJpZCI6MTIzNDV9"
    BeforeKey:
      name: before_key
      in: query
      schema:
        type: string
        pattern: '^[A-Za-z0-9+/]+=*$'
      description: |
        Cursor for key-set pagination (backward direction).
        Base64-encoded cursor pointing to the first item in the next page.
      example: "eyJpZCI6MTIzNDB9"
    Limit:
      name: limit
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
      description: Maximum number of items to return per page
      example: 20
  schemas:
    UserListResponse:
      type: object
      required: [success, data, meta, _links]
      properties:
        success:
          type: boolean
          example: true
          description: Indicates if the request was successful
        data:
          type: array
          items:
            $ref: '#/components/schemas/User'
          description: Array of user objects
        meta:
          $ref: '#/components/schemas/PaginationMeta'
        _links:
          $ref: '#/components/schemas/PaginationLinks'
    UserResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
          example: true
        data:
          $ref: '#/components/schemas/User'
    UserDetailResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
          example: true
        data:
          allOf:
            - $ref: '#/components/schemas/User'
            - type: object
              properties:
                profile:
                  $ref: '#/components/schemas/UserProfile'
                permissions:
                  type: array
                  items:
                    type: string
                  example: ["users:read", "orders:write"]
                activity:
                  $ref: '#/components/schemas/UserActivity'
    CreateUserRequest:
      type: object
      required: [name, email]
      properties:
        name:
          type: string
          minLength: 2
          maxLength: 100
          pattern: '^[a-zA-Z\\s\\-\\.]+$'
          description: Full name of the user
          example: "Jane Doe"
        email:
          type: string
          format: email
          maxLength: 255
          description: Email address (must be unique within organization)
          example: "jane.doe@example.com"
        role:
          type: string
          enum: [admin, manager, user, viewer]
          default: user
          description: User role determining base permissions
        department:
          type: string
          maxLength: 50
          description: Department or team assignment
          example: "Engineering"
        phone:
          type: string
          pattern: '^\\+?[1-9]\\d{1,14}$'
          description: Phone number in E.164 format
          example: "+1234567890"
        permissions:
          type: array
          items:
            type: string
            pattern: '^[a-z_]+:[a-z_]+$'
          description: Additional permissions beyond role defaults
          example: ["reports:admin", "billing:read"]
        metadata:
          type: object
          additionalProperties: true
          description: Additional custom metadata
          example:
            source: "admin_panel"
            referrer: "direct"
        webhook_url:
          type: string
          format: uri
          description: Webhook URL for user creation notifications
      additionalProperties: false
    UpdateUserRequest:
      type: object
      properties:
        name:
          type: string
          minLength: 2
          maxLength: 100
          pattern: '^[a-zA-Z\\s\\-\\.]+$'
        email:
          type: string
          format: email
          maxLength: 255
        role:
          type: string
          enum: [admin, manager, user, viewer]
        department:
          type: string
          maxLength: 50
        phone:
          type: string
          pattern: '^\\+?[1-9]\\d{1,14}$'
        status:
          type: string
          enum: [active, inactive, pending, suspended]
        permissions:
          type: array
          items:
            type: string
            pattern: '^[a-z_]+:[a-z_]+$'
        metadata:
          type: object
          additionalProperties: true
      additionalProperties: false
    User:
      type: object
      required: [id, name, email, status, role, created_at, updated_at, _links]
      properties:
        id:
          type: integer
          format: int64
          example: 12345
          description: Unique user identifier
        name:
          type: string
          example: "Jane Doe"
          description: Full name of the user
        email:
          type: string
          format: email
          example: "jane.doe@example.com"
          description: Email address
        status:
          type: string
          enum: [active, inactive, pending, suspended, deleted]
          example: "active"
          description: Current user status
        role:
          type: string
          enum: [admin, manager, user, viewer]
          example: "user"
          description: User role
        department:
          type: string
          example: "Engineering"
          description: Department assignment
        phone:
          type: string
          example: "+1234567890"
          description: Phone number
        last_login:
          type: string
          format: date-time
          example: "2023-08-10T14:30:00Z"
          description: Timestamp of last login
        created_at:
          type: string
          format: date-time
          example: "2023-01-15T10:30:00Z"
          description: Account creation timestamp
        updated_at:
          type: string
          format: date-time
          example: "2023-08-10T15:45:00Z"
          description: Last update timestamp
        _links:
          type: object
          required: [self]
          properties:
            self:
              type: object
              properties:
                href:
                  type: string
                  example: "/api/v2/users/12345"
            profile:
              type: object
              properties:
                href:
                  type: string
                  example: "/api/v2/users/12345/profile"
                title:
                  type: string
                  example: "User profile"
            permissions:
              type: object
              properties:
                href:
                  type: string
                  example: "/api/v2/users/12345/permissions"
                title:
                  type: string
                  example: "User permissions"
    UserProfile:
      type: object
      properties:
        avatar_url:
          type: string
          format: uri
          example: "https://cdn.example.com/avatars/12345.jpg"
        bio:
          type: string
          maxLength: 500
          example: "Software engineer with 5 years of experience"
        timezone:
          type: string
          example: "America/New_York"
        language:
          type: string
          pattern: '^[a-z]{2}(-[A-Z]{2})?$'
          example: "en-US"
        preferences:
          type: object
          properties:
            notifications:
              type: object
              properties:
                email:
                  type: boolean
                push:
                  type: boolean
                sms:
                  type: boolean
    UserActivity:
      type: object
      properties:
        login_count:
          type: integer
          example: 127
        last_active:
          type: string
          format: date-time
          example: "2023-08-10T14:30:00Z"
        sessions_this_month:
          type: integer
          example: 23
        api_calls_this_month:
          type: integer
          example: 1547
    PaginationMeta:
      type: object
      required: [total, page_size, has_more]
      properties:
        total:
          type: integer
          example: 1247
          description: Total number of items across all pages
        page_size:
          type: integer
          example: 20
          description: Number of items in current page
        has_more:
          type: boolean
          example: true
          description: Whether there are more pages available
        next_cursor:
          type: string
          nullable: true
          example: "eyJpZCI6MTIzNDV9"
          description: Cursor for next page (null if no next page)
        prev_cursor:
          type: string
          nullable: true
          example: "eyJpZCI6MTIzMDB9"
          description: Cursor for previous page (null if no previous page)
    PaginationLinks:
      type: object
      required: [self]
      properties:
        self:
          type: object
          properties:
            href:
              type: string
              example: "/api/v2/users?limit=20"
        next:
          type: object
          nullable: true
          properties:
            href:
              type: string
              example: "/api/v2/users?after_key=eyJpZCI6MTIzNDV9&limit=20"
            title:
              type: string
              example: "Next page"
        prev:
          type: object
          nullable: true
          properties:
            href:
              type: string
              example: "/api/v2/users?before_key=eyJpZCI6MTIzMDB9&limit=20"
            title:
              type: string
              example: "Previous page"
    ErrorResponse:
      type: object
      required: [success, error]
      properties:
        success:
          type: boolean
          enum: [false]
          description: Always false for error responses
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
              pattern: '^[A-Z_]+$'
              example: "VALIDATION_FAILED"
              description: Machine-readable error code
            message:
              type: string
              example: "The request data is invalid"
              description: Human-readable error message
            details:
              type: object
              description: Additional error details
              example:
                field_errors:
                  email: ["Email format is invalid"]
                  name: ["Name is required"]
            request_id:
              type: string
              format: uuid
              example: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
              description: Unique request identifier for support
            documentation_url:
              type: string
              format: uri
              example: "https://docs.api.example.com/errors#VALIDATION_FAILED"
              description: Link to error documentation
    ValidationErrorResponse:
      allOf:
        - $ref: '#/components/schemas/ErrorResponse'
        - type: object
          properties:
            error:
              properties:
                validation_errors:
                  type: array
                  items:
                    type: object
                    required: [field, code, message]
                    properties:
                      field:
                        type: string
                        example: "email"
                      code:
                        type: string
                        example: "INVALID_FORMAT"
                      message:
                        type: string
                        example: "Email format is invalid"
                      value:
                        description: The invalid value that was provided
                        example: "not-an-email"
    UserCreatedWebhook:
      type: object
      required: [event, data, timestamp]
      properties:
        event:
          type: string
          enum: [user.created]
          example: "user.created"
        data:
          $ref: '#/components/schemas/User'
        timestamp:
          type: string
          format: date-time
          example: "2023-08-10T15:30:00Z"
        organization_id:
          type: integer
          format: int64
          example: 12345
        webhook_id:
          type: string
          format: uuid
          example: "w_abc123def456"
  responses:
    BadRequest:
      description: Bad request - invalid parameters or malformed request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            invalid_parameter:
              summary: Invalid parameter value
              value:
                success: false
                error:
                  code: "INVALID_PARAMETER"
                  message: "The 'limit' parameter must be between 1 and 100"
                  details:
                    parameter: "limit"
                    provided_value: 150
                    valid_range: "1-100"
                  request_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    Unauthorized:
      description: Unauthorized - invalid or missing authentication
      headers:
        WWW-Authenticate:
          schema:
            type: string
            example: 'Bearer realm="api", error="invalid_token"'
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            missing_token:
              summary: Missing authentication token
              value:
                success: false
                error:
                  code: "MISSING_TOKEN"
                  message: "Authentication token is required"
                  documentation_url: "https://docs.api.example.com/authentication"
            invalid_token:
              summary: Invalid or expired token
              value:
                success: false
                error:
                  code: "INVALID_TOKEN"
                  message: "The provided authentication token is invalid or expired"
                  details:
                    token_expired: true
                    expires_at: "2023-08-10T14:00:00Z"
    Forbidden:
      description: Forbidden - insufficient permissions
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            insufficient_permissions:
              summary: Insufficient permissions
              value:
                success: false
                error:
                  code: "INSUFFICIENT_PERMISSIONS"
                  message: "You do not have permission to perform this action"
                  details:
                    required_permission: "users:write"
                    current_permissions: ["users:read"]
    NotFound:
      description: Not found - requested resource does not exist
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            user_not_found:
              summary: User not found
              value:
                success: false
                error:
                  code: "USER_NOT_FOUND"
                  message: "User with ID 99999 not found"
                  details:
                    user_id: 99999
    Conflict:
      description: Conflict - resource already exists or conflicting state
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            email_exists:
              summary: Email already exists
              value:
                success: false
                error:
                  code: "EMAIL_ALREADY_EXISTS"
                  message: "A user with this email address already exists"
                  details:
                    email: "jane.doe@example.com"
                    existing_user_id: 12340
    ValidationError:
      description: Unprocessable entity - validation errors
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ValidationErrorResponse'
          examples:
            validation_failed:
              summary: Multiple validation errors
              value:
                success: false
                error:
                  code: "VALIDATION_FAILED"
                  message: "The request data contains validation errors"
                  validation_errors:
                    - field: "name"
                      code: "REQUIRED"
                      message: "Name is required"
                    - field: "email"
                      code: "INVALID_FORMAT"
                      message: "Email format is invalid"
                      value: "not-an-email"
                    - field: "phone"
                      code: "INVALID_FORMAT"
                      message: "Phone number must be in E.164 format"
                      value: "123-456-7890"
    RateLimited:
      description: Too many requests - rate limit exceeded
      headers:
        X-RateLimit-Limit:
          schema:
            type: integer
          description: Request limit per window
        X-RateLimit-Remaining:
          schema:
            type: integer
          description: Requests remaining in current window
        X-RateLimit-Reset:
          schema:
            type: integer
          description: Time when limit resets (Unix timestamp)
        Retry-After:
          schema:
            type: integer
          description: Seconds to wait before retrying
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            rate_limited:
              summary: Rate limit exceeded
              value:
                success: false
                error:
                  code: "RATE_LIMIT_EXCEEDED"
                  message: "Too many requests. Please try again later."
                  details:
                    limit: 1000
                    window: "1 hour"
                    retry_after: 3600
    InternalError:
      description: Internal server error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            internal_error:
              summary: Internal server error
              value:
                success: false
                error:
                  code: "INTERNAL_ERROR"
                  message: "An unexpected error occurred. Please try again later."
                  request_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    ServiceUnavailable:
      description: Service temporarily unavailable
      headers:
        Retry-After:
          schema:
            type: integer
          description: Seconds to wait before retrying
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            maintenance:
              summary: Service under maintenance
              value:
                success: false
                error:
                  code: "SERVICE_UNAVAILABLE"
                  message: "Service is temporarily unavailable due to maintenance"
                  details:
                    maintenance_window: "2023-08-10T16:00:00Z to 2023-08-10T18:00:00Z"
                    retry_after: 7200
security:
  - OAuth2: []
tags:
  - name: Users
    description: User management operations
    externalDocs:
      description: User management guide
      url: https://docs.api.example.com/users
  - name: Batch
    description: Batch operations for bulk processing
    externalDocs:
      description: Batch processing guide
      url: https://docs.api.example.com/batch
externalDocs:
  description: Complete API Documentation
  url: https://docs.api.example.com
webhooks:
  userCreated:
    post:
      summary: User creation notification
      description: Webhook sent when a new user is created
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserCreatedWebhook'
      responses:
        '200':
          description: Webhook processed successfully
  userUpdated:
    post:
      summary: User update notification
      description: Webhook sent when a user is updated
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                event:
                  type: string
                  enum: [user.updated]
                data:
                  $ref: '#/components/schemas/User'
                changes:
                  type: object
                  description: Fields that were changed
                timestamp:
                  type: string
                  format: date-time
      responses:
        '200':
          description: Webhook processed successfully
`,

  // Basic API with minimal features
  BASIC_API: `
openapi: 3.0.3
info:
  title: Basic API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: Get users
      responses:
        '200':
          description: Users list
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: integer
                    name:
                      type: string
    post:
      summary: Create user
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        '201':
          description: Created
components:
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-Key
`,

  // API with auto-fail conditions for legacy system
  LEGACY_AUTO_FAIL: `
openapi: 3.0.0
info:
  title: Legacy Auto-Fail API
  version: 1.0.0
paths:
  /users:
    get:
      summary: Wrong namespace and version
      parameters:
        - name: offset
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: OK
`,

  // API missing prerequisites
  MISSING_PREREQUISITES: `
openapi: 3.0.3
info:
  title: Missing Prerequisites API
  version: 1.0.0
paths:
  /api/v2/users:
    post:
      summary: Create user without tenancy
      responses:
        '201':
          description: Created
`,

  // API with partial implementation (good for coverage testing)
  PARTIAL_IMPLEMENTATION: `
openapi: 3.0.3
info:
  title: Partially Implemented API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: Well-documented GET endpoint
      description: This endpoint is properly documented with examples
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
        - name: after_key
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Success
          headers:
            ETag:
              schema:
                type: string
          content:
            application/json:
              schema:
                type: object
                required: [success, data, meta]
                properties:
                  success:
                    type: boolean
                  data:
                    type: array
                    items:
                      type: object
                  meta:
                    type: object
              example:
                success: true
                data: []
                meta:
                  total: 0
        '400':
          description: Bad request
        '500':
          description: Server error
      security:
        - OAuth2: [read]
    post:
      summary: Poorly implemented POST endpoint
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        '201':
          description: Created
      # Missing: error responses, security, validation, examples
  /api/v2/orders:
    get:
      summary: Minimal implementation
      responses:
        '200':
          description: OK
      # Missing: parameters, error handling, security, documentation
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
`,

  // Malformed API for error handling tests
  MALFORMED_API: `
openapi: 3.0.3
info:
  title: Malformed API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: Test endpoint
      responses:
        '200':
          description: OK
        invalid_key: this should cause parsing issues
      parameters:
        - name: invalid_param
          in: invalid_location
components:
  invalid_section:
    invalid_content: true
`,

  // Empty API for edge case testing
  EMPTY_API: `
openapi: 3.0.3
info:
  title: Empty API
  version: 1.0.0
paths: {}
`,

  // Large API for performance testing
  LARGE_API_TEMPLATE: `
openapi: 3.0.3
info:
  title: Large API for Performance Testing
  version: 1.0.0
paths:
{{PATHS}}
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
`
};

// Helper function to generate large API spec
export function generateLargeApiSpec(resourceCount: number = 50): string {
  let paths = '';
  
  for (let i = 0; i < resourceCount; i++) {
    paths += `
  /api/v2/resource${i}:
    get:
      summary: Get resource ${i}
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
        '400':
          description: Bad request
        '500':
          description: Server error
      security:
        - OAuth2: [read]
    post:
      summary: Create resource ${i}
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        '201':
          description: Created
        '400':
          description: Bad request
        '500':
          description: Server error
      security:
        - OAuth2: [write]
`;
  }
  
  return API_SCENARIOS.LARGE_API_TEMPLATE.replace('{{PATHS}}', paths);
}

// Test fixture categories for different test scenarios
export const TEST_CATEGORIES = {
  PERFECT: 'PERFECT_API',
  BASIC: 'BASIC_API', 
  LEGACY_FAIL: 'LEGACY_AUTO_FAIL',
  MISSING_PREREQ: 'MISSING_PREREQUISITES',
  PARTIAL: 'PARTIAL_IMPLEMENTATION',
  MALFORMED: 'MALFORMED_API',
  EMPTY: 'EMPTY_API'
};

// Expected grade ranges for each scenario
export const EXPECTED_GRADES = {
  [TEST_CATEGORIES.PERFECT]: {
    legacy: { min: 95, max: 100, letter: 'A+' },
    coverage: { min: 95, max: 100, letter: 'A+' }
  },
  [TEST_CATEGORIES.BASIC]: {
    legacy: { min: 30, max: 70, letter: /[CD][+-]?/ },
    coverage: { min: 40, max: 75, letter: /[BCD][+-]?/ }
  },
  [TEST_CATEGORIES.LEGACY_FAIL]: {
    legacy: { min: 0, max: 0, letter: 'F' },
    coverage: { min: 0, max: 0, letter: 'F' }
  },
  [TEST_CATEGORIES.MISSING_PREREQ]: {
    legacy: { min: 0, max: 30, letter: 'F' },
    coverage: { min: 0, max: 0, letter: 'F' }
  },
  [TEST_CATEGORIES.PARTIAL]: {
    legacy: { min: 40, max: 80, letter: /[ABC][+-]?/ },
    coverage: { min: 50, max: 85, letter: /[ABC][+-]?/ }
  },
  [TEST_CATEGORIES.MALFORMED]: {
    legacy: { min: 0, max: 40, letter: /[DF]/ },
    coverage: { min: 0, max: 40, letter: /[DF]/ }
  },
  [TEST_CATEGORIES.EMPTY]: {
    legacy: { min: 0, max: 20, letter: 'F' },
    coverage: { min: 0, max: 20, letter: 'F' }
  }
};
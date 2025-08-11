#!/bin/bash

# Database Test Execution Script
# Comprehensive test suite for database and persistence layer
# Author: API Grader Test Engineering Team

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="${PROJECT_ROOT}/test"
COVERAGE_DIR="${PROJECT_ROOT}/coverage"
LOG_DIR="${PROJECT_ROOT}/logs"

# Test environment variables
export NODE_ENV="test"
export TEST_MODE="true"
export DB_PATH=":memory:"
export RUN_PERFORMANCE_TESTS="${RUN_PERFORMANCE_TESTS:-false}"

# Create necessary directories
mkdir -p "${LOG_DIR}"
mkdir -p "${COVERAGE_DIR}"

echo -e "${BOLD}${BLUE}🗄️  Database and Persistence Test Suite${NC}"
echo -e "${BOLD}=====================================${NC}"
echo ""

# Function to print section headers
print_section() {
    echo -e "${BOLD}${BLUE}$1${NC}"
    echo -e "${BLUE}$(printf '%.0s-' {1..50})${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    print_section "🔍 Checking Prerequisites"
    
    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}✓${NC} Node.js: ${NODE_VERSION}"
    else
        echo -e "${RED}✗${NC} Node.js is required but not installed"
        exit 1
    fi
    
    # Check npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        echo -e "${GREEN}✓${NC} npm: ${NPM_VERSION}"
    else
        echo -e "${RED}✗${NC} npm is required but not installed"
        exit 1
    fi
    
    # Check if jest is available
    if npx jest --version >/dev/null 2>&1; then
        JEST_VERSION=$(npx jest --version)
        echo -e "${GREEN}✓${NC} Jest: ${JEST_VERSION}"
    else
        echo -e "${RED}✗${NC} Jest is required but not available"
        exit 1
    fi
    
    # Check for database dependencies
    if command_exists psql; then
        PSQL_VERSION=$(psql --version | head -1)
        echo -e "${GREEN}✓${NC} PostgreSQL CLI: ${PSQL_VERSION}"
        POSTGRES_AVAILABLE=true
    else
        echo -e "${YELLOW}⚠${NC} PostgreSQL CLI not available - PostgreSQL tests may fail"
        POSTGRES_AVAILABLE=false
    fi
    
    echo ""
}

# Function to run specific test category
run_test_category() {
    local category=$1
    local pattern=$2
    local description=$3
    
    print_section "$description"
    
    local start_time=$(date +%s)
    local log_file="${LOG_DIR}/test-${category}.log"
    
    echo -e "Running tests: ${YELLOW}$pattern${NC}"
    echo -e "Log file: ${log_file}"
    echo ""
    
    # Run the tests with coverage
    if npx jest --testPathPattern="$pattern" \
              --coverage \
              --coverageDirectory="${COVERAGE_DIR}/${category}" \
              --collectCoverageFrom="src/mcp/persistence/**/*.ts" \
              --verbose \
              --forceExit \
              --detectOpenHandles \
              2>&1 | tee "$log_file"; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✓${NC} $description completed in ${duration}s"
        echo ""
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${RED}✗${NC} $description failed after ${duration}s"
        echo -e "Check log file: ${log_file}"
        echo ""
        return 1
    fi
}

# Function to run all database tests
run_all_database_tests() {
    print_section "🧪 Running Complete Database Test Suite"
    
    local total_start_time=$(date +%s)
    local failed_tests=0
    
    # Unit Tests - Database Abstractions
    if ! run_test_category "unit-persistence" \
                          "test/unit/persistence" \
                          "📝 Unit Tests - Database Abstractions and Models"; then
        ((failed_tests++))
    fi
    
    # Integration Tests - SQLite
    if ! run_test_category "integration-sqlite" \
                          "test/integration/database-sqlite.test.ts" \
                          "🗄️ Integration Tests - SQLite Database"; then
        ((failed_tests++))
    fi
    
    # Integration Tests - PostgreSQL
    if [[ "$POSTGRES_AVAILABLE" == "true" ]]; then
        if ! run_test_category "integration-postgres" \
                              "test/integration/database-postgres.test.ts" \
                              "🐘 Integration Tests - PostgreSQL Database"; then
            ((failed_tests++))
        fi
    else
        echo -e "${YELLOW}⚠${NC} Skipping PostgreSQL integration tests (PostgreSQL not available)"
    fi
    
    # Migration Tests
    if ! run_test_category "migrations" \
                          "test/integration/migrations.test.ts" \
                          "🔄 Migration Tests - Schema Evolution and Rollback"; then
        ((failed_tests++))
    fi
    
    # Performance Tests (conditional)
    if [[ "$RUN_PERFORMANCE_TESTS" == "true" ]]; then
        if ! run_test_category "performance" \
                              "test/integration/database-performance.test.ts" \
                              "⚡ Performance Tests - Load and Concurrency"; then
            ((failed_tests++))
        fi
    else
        echo -e "${YELLOW}ℹ${NC} Skipping performance tests (set RUN_PERFORMANCE_TESTS=true to enable)"
    fi
    
    # Error Handling Tests
    if ! run_test_category "error-handling" \
                          "test/integration/database-error-handling.test.ts" \
                          "🔥 Error Handling Tests - Resilience and Recovery"; then
        ((failed_tests++))
    fi
    
    local total_end_time=$(date +%s)
    local total_duration=$((total_end_time - total_start_time))
    
    echo ""
    print_section "📊 Test Suite Summary"
    
    if [[ $failed_tests -eq 0 ]]; then
        echo -e "${GREEN}✅ All database tests passed!${NC}"
        echo -e "Total execution time: ${total_duration}s"
    else
        echo -e "${RED}❌ ${failed_tests} test categories failed${NC}"
        echo -e "Total execution time: ${total_duration}s"
        echo -e "Check individual log files in: ${LOG_DIR}"
        return 1
    fi
    
    echo ""
}

# Function to generate coverage report
generate_coverage_report() {
    print_section "📈 Coverage Report Generation"
    
    # Merge coverage reports if multiple exist
    if command_exists nyc; then
        echo "Merging coverage reports..."
        npx nyc merge "${COVERAGE_DIR}" "${COVERAGE_DIR}/merged-coverage.json"
        npx nyc report --temp-dir "${COVERAGE_DIR}" --reporter=html --reporter=text-summary
    fi
    
    # Generate combined HTML report
    if [[ -d "${COVERAGE_DIR}" ]]; then
        echo -e "${GREEN}✓${NC} Coverage reports available in: ${COVERAGE_DIR}"
        
        # Look for HTML coverage reports
        find "${COVERAGE_DIR}" -name "index.html" | head -5 | while read -r html_report; do
            echo -e "  📄 $(dirname "$html_report")"
        done
    fi
    
    echo ""
}

# Function to validate test results
validate_test_results() {
    print_section "✅ Test Result Validation"
    
    local validation_errors=0
    
    # Check for test files existence
    local expected_test_files=(
        "test/unit/persistence/db.test.ts"
        "test/integration/database-sqlite.test.ts"
        "test/integration/database-postgres.test.ts"
        "test/integration/migrations.test.ts"
        "test/integration/database-performance.test.ts"
        "test/integration/database-error-handling.test.ts"
    )
    
    for test_file in "${expected_test_files[@]}"; do
        if [[ -f "${PROJECT_ROOT}/${test_file}" ]]; then
            echo -e "${GREEN}✓${NC} ${test_file}"
        else
            echo -e "${RED}✗${NC} Missing: ${test_file}"
            ((validation_errors++))
        fi
    done
    
    # Check coverage thresholds
    local coverage_threshold=80
    echo ""
    echo "Coverage Analysis:"
    
    if [[ -d "${COVERAGE_DIR}" ]]; then
        # Look for coverage summary files
        find "${COVERAGE_DIR}" -name "coverage-summary.json" | head -1 | while read -r summary_file; do
            if command_exists jq && [[ -f "$summary_file" ]]; then
                local line_coverage=$(jq -r '.total.lines.pct' "$summary_file" 2>/dev/null || echo "N/A")
                local branch_coverage=$(jq -r '.total.branches.pct' "$summary_file" 2>/dev/null || echo "N/A")
                
                echo -e "Line Coverage: ${line_coverage}%"
                echo -e "Branch Coverage: ${branch_coverage}%"
                
                # Check if coverage meets threshold
                if [[ "$line_coverage" != "N/A" ]] && (( $(echo "$line_coverage >= $coverage_threshold" | bc -l) )); then
                    echo -e "${GREEN}✓${NC} Coverage meets threshold (${coverage_threshold}%)"
                else
                    echo -e "${YELLOW}⚠${NC} Coverage below threshold (${coverage_threshold}%)"
                fi
            fi
        done
    else
        echo -e "${YELLOW}⚠${NC} No coverage data found"
    fi
    
    if [[ $validation_errors -eq 0 ]]; then
        echo -e "${GREEN}✓${NC} All validations passed"
    else
        echo -e "${RED}✗${NC} ${validation_errors} validation errors found"
        return 1
    fi
    
    echo ""
}

# Function to display database test documentation
show_test_documentation() {
    print_section "📚 Database Test Documentation"
    
    cat << EOF
${BOLD}Database Test Categories:${NC}

${YELLOW}1. Unit Tests (test/unit/persistence/)${NC}
   - Data model validation
   - Interface contract testing
   - Business logic validation
   - Type safety verification

${YELLOW}2. SQLite Integration Tests${NC}
   - File-based database operations
   - WAL mode performance
   - Transaction handling
   - Concurrent read operations

${YELLOW}3. PostgreSQL Integration Tests${NC}
   - Multi-tenant data isolation
   - Team-based security
   - Connection pooling
   - Advanced SQL features

${YELLOW}4. Migration Tests${NC}
   - Schema evolution
   - Rollback procedures
   - Cross-database consistency
   - Data integrity preservation

${YELLOW}5. Performance Tests${NC}
   - Large dataset handling
   - Concurrent operation load
   - Connection pool stress testing
   - Memory usage optimization

${YELLOW}6. Error Handling Tests${NC}
   - Connection failure recovery
   - Transaction rollback scenarios
   - Resource exhaustion handling
   - Data corruption detection

${BOLD}Environment Variables:${NC}
- NODE_ENV=test (automatically set)
- RUN_PERFORMANCE_TESTS=true (enable performance tests)
- DATABASE_URL (for PostgreSQL tests)
- PGHOST, PGPORT, PGUSER, PGPASSWORD (PostgreSQL config)

${BOLD}Coverage Requirements:${NC}
- Minimum 90% line coverage for persistence layer
- 100% critical path coverage (insertRun, getHistory)
- Error handling path coverage
- Multi-tenant isolation verification

EOF
    echo ""
}

# Function to clean up test artifacts
cleanup_test_artifacts() {
    print_section "🧹 Cleanup Test Artifacts"
    
    echo "Cleaning up temporary files..."
    
    # Remove temporary SQLite databases
    find "${PROJECT_ROOT}" -name "*.sqlite" -path "*/test*" -delete 2>/dev/null || true
    find "${PROJECT_ROOT}" -name "*test*.sqlite" -delete 2>/dev/null || true
    
    # Clean up old log files (keep last 10)
    if [[ -d "${LOG_DIR}" ]]; then
        find "${LOG_DIR}" -name "test-*.log" | head -n -10 | xargs rm -f 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✓${NC} Cleanup completed"
    echo ""
}

# Main execution function
main() {
    local command=${1:-"all"}
    
    case $command in
        "prereq"|"prerequisites")
            check_prerequisites
            ;;
        "unit")
            check_prerequisites
            run_test_category "unit-persistence" "test/unit/persistence" "📝 Unit Tests - Database Abstractions"
            ;;
        "sqlite")
            check_prerequisites
            run_test_category "integration-sqlite" "test/integration/database-sqlite.test.ts" "🗄️ SQLite Integration Tests"
            ;;
        "postgres")
            check_prerequisites
            run_test_category "integration-postgres" "test/integration/database-postgres.test.ts" "🐘 PostgreSQL Integration Tests"
            ;;
        "migration"|"migrations")
            check_prerequisites
            run_test_category "migrations" "test/integration/migrations.test.ts" "🔄 Migration Tests"
            ;;
        "performance")
            check_prerequisites
            export RUN_PERFORMANCE_TESTS=true
            run_test_category "performance" "test/integration/database-performance.test.ts" "⚡ Performance Tests"
            ;;
        "errors"|"error-handling")
            check_prerequisites
            run_test_category "error-handling" "test/integration/database-error-handling.test.ts" "🔥 Error Handling Tests"
            ;;
        "coverage")
            generate_coverage_report
            ;;
        "validate")
            validate_test_results
            ;;
        "docs"|"documentation")
            show_test_documentation
            ;;
        "cleanup"|"clean")
            cleanup_test_artifacts
            ;;
        "all")
            check_prerequisites
            run_all_database_tests
            generate_coverage_report
            validate_test_results
            cleanup_test_artifacts
            ;;
        *)
            echo -e "${BOLD}Database Test Suite Runner${NC}"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  all             Run complete database test suite (default)"
            echo "  unit            Run unit tests only"
            echo "  sqlite          Run SQLite integration tests"
            echo "  postgres        Run PostgreSQL integration tests"
            echo "  migrations      Run database migration tests"
            echo "  performance     Run performance tests"
            echo "  error-handling  Run error handling tests"
            echo "  coverage        Generate coverage reports"
            echo "  validate        Validate test results and coverage"
            echo "  docs            Show test documentation"
            echo "  cleanup         Clean up test artifacts"
            echo "  prerequisites   Check system prerequisites"
            echo ""
            echo "Environment Variables:"
            echo "  RUN_PERFORMANCE_TESTS=true    Enable performance tests"
            echo "  DATABASE_URL                  PostgreSQL connection string"
            echo ""
            ;;
    esac
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Test execution interrupted${NC}"; cleanup_test_artifacts; exit 130' INT TERM

# Execute main function with all arguments
main "$@"
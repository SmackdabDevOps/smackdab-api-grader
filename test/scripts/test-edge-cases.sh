#!/bin/bash

# Comprehensive Edge Case Testing Script
# Tests all edge cases and error boundaries with detailed reporting

set -e

echo "🚀 Starting Comprehensive Edge Case Testing"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
export NODE_OPTIONS="--expose-gc --max-old-space-size=8192"
export DEBUG=true
export TEST_ENV=edge-cases

# Create test results directory
mkdir -p test-results
mkdir -p coverage-edge-cases

# Function to run test with error handling
run_test() {
    local test_name="$1"
    local test_command="$2"
    local timeout_seconds="${3:-600}" # Default 10 minutes
    
    echo -e "${BLUE}Running: $test_name${NC}"
    echo "Command: $test_command"
    echo "Timeout: ${timeout_seconds}s"
    echo "---"
    
    local start_time=$(date +%s)
    local success=true
    
    # Run test with timeout
    if timeout ${timeout_seconds}s bash -c "$test_command" > "test-results/${test_name}.log" 2>&1; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
    else
        local exit_code=$?
        echo -e "${RED}❌ FAILED: $test_name (exit code: $exit_code)${NC}"
        success=false
        
        # Show last few lines of output
        echo "Last 20 lines of output:"
        tail -20 "test-results/${test_name}.log" 2>/dev/null || echo "No output captured"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo "Duration: ${duration}s"
    echo ""
    
    return $([ "$success" = true ] && echo 0 || echo 1)
}

# Function to check memory usage
check_memory() {
    if command -v free >/dev/null 2>&1; then
        echo "Current memory usage:"
        free -h
    elif command -v vm_stat >/dev/null 2>&1; then
        echo "Current memory usage (macOS):"
        vm_stat | head -10
    fi
    echo ""
}

# Function to check disk space
check_disk() {
    echo "Disk space usage:"
    df -h . 2>/dev/null || echo "Could not check disk usage"
    echo ""
}

echo "Initial system status:"
check_memory
check_disk

# Test suite execution
total_tests=0
passed_tests=0
failed_tests=0

echo "🧪 Phase 1: Malformed Input Tests"
echo "================================"
total_tests=$((total_tests + 1))
if run_test "malformed-input" "npm run test:edge-cases:malformed" 300; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

echo "🧪 Phase 2: Resource Limits Tests"
echo "================================="
total_tests=$((total_tests + 1))
if run_test "resource-limits" "npm run test:edge-cases:resources" 900; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

echo "Memory status after resource tests:"
check_memory

echo "🧪 Phase 3: Error Recovery Tests"
echo "================================"
total_tests=$((total_tests + 1))
if run_test "error-recovery" "npm run test:edge-cases:recovery" 600; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

echo "🧪 Phase 4: Timeout Handling Tests"
echo "=================================="
total_tests=$((total_tests + 1))
if run_test "timeout-handling" "npm run test:edge-cases:timeouts" 900; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

echo "🧪 Phase 5: Comprehensive Coverage Test"
echo "======================================="
total_tests=$((total_tests + 1))
if run_test "edge-cases-coverage" "npm run test:edge-cases:coverage" 1200; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

echo "🧪 Phase 6: Stress Test (Optional)"
echo "=================================="
if [ "${RUN_STRESS_TESTS:-false}" = "true" ]; then
    total_tests=$((total_tests + 1))
    if run_test "stress-test" "npm run test:stress" 1800; then
        passed_tests=$((passed_tests + 1))
    else
        failed_tests=$((failed_tests + 1))
    fi
else
    echo "Skipping stress tests (set RUN_STRESS_TESTS=true to enable)"
fi

echo "Final system status:"
check_memory
check_disk

# Generate test report
echo "📊 Test Results Summary"
echo "======================"
echo "Total Tests: $total_tests"
echo -e "Passed: ${GREEN}$passed_tests${NC}"
echo -e "Failed: ${RED}$failed_tests${NC}"

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 All edge case tests passed!${NC}"
    exit_code=0
else
    echo -e "${RED}❌ $failed_tests test(s) failed${NC}"
    exit_code=1
fi

# Coverage report location
if [ -d "coverage-edge-cases" ]; then
    echo ""
    echo "📈 Coverage Report: coverage-edge-cases/lcov-report/index.html"
fi

# Test logs location
echo "📝 Test Logs: test-results/"
echo ""

# Cleanup temporary files
echo "🧹 Cleaning up..."
rm -rf /tmp/api-grader-*-tests 2>/dev/null || true

# Show largest log files
echo "Largest log files:"
find test-results -name "*.log" -type f -exec du -h {} \; 2>/dev/null | sort -hr | head -5

echo ""
echo "Edge case testing completed!"
exit $exit_code
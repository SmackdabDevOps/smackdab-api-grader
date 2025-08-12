/**
 * Jenkins Plugin for API Grader
 * Integrates API grading into Jenkins CI/CD pipelines
 * Supports declarative and scripted pipelines
 */

package com.apigrader.jenkins

import hudson.Extension
import hudson.FilePath
import hudson.Launcher
import hudson.model.*
import hudson.tasks.*
import jenkins.tasks.SimpleBuildStep
import org.jenkinsci.Symbol
import org.kohsuke.stapler.DataBoundConstructor
import org.kohsuke.stapler.DataBoundSetter

/**
 * API Grader build step
 */
class APIGraderBuildStep extends Builder implements SimpleBuildStep {
    
    private String apiKey
    private String apiFiles
    private Integer minGrade
    private Boolean failOnErrors
    private Boolean autoFix
    private Boolean generateReport
    private Boolean uploadResults
    private String complianceChecks
    private Boolean securityScan
    private Boolean performanceTest
    
    @DataBoundConstructor
    APIGraderBuildStep() {
        this.apiFiles = "**/*.{yaml,yml,json}"
        this.minGrade = 70
        this.failOnErrors = true
        this.autoFix = false
        this.generateReport = true
        this.uploadResults = true
        this.securityScan = true
        this.performanceTest = false
    }
    
    @DataBoundSetter
    void setApiKey(String apiKey) {
        this.apiKey = apiKey
    }
    
    @DataBoundSetter
    void setApiFiles(String apiFiles) {
        this.apiFiles = apiFiles
    }
    
    @DataBoundSetter
    void setMinGrade(Integer minGrade) {
        this.minGrade = minGrade
    }
    
    @DataBoundSetter
    void setFailOnErrors(Boolean failOnErrors) {
        this.failOnErrors = failOnErrors
    }
    
    @DataBoundSetter
    void setAutoFix(Boolean autoFix) {
        this.autoFix = autoFix
    }
    
    @DataBoundSetter
    void setGenerateReport(Boolean generateReport) {
        this.generateReport = generateReport
    }
    
    @DataBoundSetter
    void setUploadResults(Boolean uploadResults) {
        this.uploadResults = uploadResults
    }
    
    @DataBoundSetter
    void setComplianceChecks(String complianceChecks) {
        this.complianceChecks = complianceChecks
    }
    
    @DataBoundSetter
    void setSecurityScan(Boolean securityScan) {
        this.securityScan = securityScan
    }
    
    @DataBoundSetter
    void setPerformanceTest(Boolean performanceTest) {
        this.performanceTest = performanceTest
    }
    
    @Override
    void perform(Run<?, ?> run, FilePath workspace, Launcher launcher, TaskListener listener) {
        def logger = listener.getLogger()
        logger.println("Starting API Grader analysis...")
        
        try {
            // Initialize API Grader client
            def grader = new APIGraderClient(apiKey)
            
            // Find API files
            def files = findAPIFiles(workspace, apiFiles)
            logger.println("Found ${files.size()} API files to grade")
            
            // Grade each file
            def results = []
            def totalGrade = 0
            def totalIssues = 0
            
            files.each { file ->
                logger.println("Grading ${file.getRemote()}...")
                
                def result = grader.gradeFile(file)
                results.add(result)
                
                totalGrade += result.grade
                totalIssues += result.issues.size()
                
                // Log issues
                result.issues.each { issue ->
                    def level = issue.severity == 'error' ? 'ERROR' : 
                               issue.severity == 'warning' ? 'WARNING' : 'INFO'
                    logger.println("[${level}] ${file.getName()}:${issue.line} - ${issue.message}")
                }
                
                // Check minimum grade
                if (result.grade < minGrade) {
                    logger.println("WARNING: ${file.getName()} grade ${result.grade} is below threshold ${minGrade}")
                    if (failOnErrors) {
                        run.setResult(Result.FAILURE)
                    }
                }
            }
            
            // Calculate average grade
            def avgGrade = files.size() > 0 ? (totalGrade / files.size()).intValue() : 0
            
            // Set build description
            run.setDescription("API Grade: ${avgGrade}/100, Issues: ${totalIssues}")
            
            // Run compliance checks
            if (complianceChecks) {
                logger.println("Running compliance checks: ${complianceChecks}")
                runComplianceChecks(grader, files, complianceChecks.split(','), logger)
            }
            
            // Run security scan
            if (securityScan) {
                logger.println("Running security scan...")
                def vulnerabilities = runSecurityScan(grader, files, logger)
                
                if (vulnerabilities > 0) {
                    logger.println("ERROR: Found ${vulnerabilities} security vulnerabilities")
                    if (failOnErrors) {
                        run.setResult(Result.FAILURE)
                    }
                }
            }
            
            // Run performance tests
            if (performanceTest) {
                logger.println("Running performance tests...")
                runPerformanceTests(grader, files, logger)
            }
            
            // Auto-fix issues
            if (autoFix) {
                logger.println("Applying automatic fixes...")
                def fixedCount = applyAutoFixes(grader, files, workspace, logger)
                logger.println("Fixed ${fixedCount} issues")
            }
            
            // Generate report
            if (generateReport) {
                logger.println("Generating HTML report...")
                def report = grader.generateReport(results)
                def reportFile = new FilePath(workspace, "api-grading-report.html")
                reportFile.write(report, "UTF-8")
                
                // Archive report
                run.addAction(new APIGraderReportAction(run, reportFile))
            }
            
            // Upload results
            if (uploadResults) {
                logger.println("Uploading results to API Grader dashboard...")
                def url = grader.uploadResults(results, [
                    project: run.getParent().getFullName(),
                    build: run.getNumber(),
                    branch: getBranch(run),
                    commit: getCommit(run)
                ])
                logger.println("Results uploaded: ${url}")
                
                // Add badge
                run.addAction(new APIGraderBadgeAction(avgGrade, url))
            }
            
            // Add build metrics
            run.addAction(new APIGraderBuildAction(avgGrade, totalIssues, results))
            
            // Set build result based on grade
            if (avgGrade < minGrade && failOnErrors) {
                run.setResult(Result.FAILURE)
            } else if (totalIssues > 0) {
                run.setResult(Result.UNSTABLE)
            } else {
                run.setResult(Result.SUCCESS)
            }
            
        } catch (Exception e) {
            logger.println("ERROR: API Grader analysis failed: ${e.message}")
            e.printStackTrace(logger)
            run.setResult(Result.FAILURE)
        }
    }
    
    private List<FilePath> findAPIFiles(FilePath workspace, String pattern) {
        def files = []
        workspace.list(pattern).each { file ->
            def content = file.readToString()
            if (content.contains("openapi") || content.contains("swagger") || 
                content.contains("asyncapi") || content.contains("graphql")) {
                files.add(file)
            }
        }
        return files
    }
    
    private void runComplianceChecks(APIGraderClient grader, List<FilePath> files, 
                                     String[] standards, PrintStream logger) {
        standards.each { standard ->
            logger.println("Checking ${standard} compliance...")
            files.each { file ->
                def result = grader.checkCompliance(file, standard)
                if (!result.compliant) {
                    logger.println("${file.getName()} is not ${standard} compliant:")
                    result.violations.each { violation ->
                        logger.println("  - ${violation}")
                    }
                }
            }
        }
    }
    
    private int runSecurityScan(APIGraderClient grader, List<FilePath> files, PrintStream logger) {
        def totalVulnerabilities = 0
        
        files.each { file ->
            def vulnerabilities = grader.scanSecurity(file)
            totalVulnerabilities += vulnerabilities.size()
            
            vulnerabilities.each { vuln ->
                logger.println("[SECURITY] ${file.getName()}:${vuln.line} - ${vuln.message}")
                logger.println("  Severity: ${vuln.severity}")
                logger.println("  CWE: ${vuln.cwe}")
                if (vuln.fix) {
                    logger.println("  Fix: ${vuln.fix}")
                }
            }
        }
        
        return totalVulnerabilities
    }
    
    private void runPerformanceTests(APIGraderClient grader, List<FilePath> files, PrintStream logger) {
        files.each { file ->
            logger.println("Testing performance for ${file.getName()}...")
            def result = grader.testPerformance(file)
            
            logger.println("  Response time: ${result.responseTime}ms")
            logger.println("  Throughput: ${result.throughput} req/s")
            logger.println("  Complexity: ${result.complexity}")
            
            if (result.bottlenecks) {
                logger.println("  Bottlenecks:")
                result.bottlenecks.each { bottleneck ->
                    logger.println("    - ${bottleneck}")
                }
            }
        }
    }
    
    private int applyAutoFixes(APIGraderClient grader, List<FilePath> files, 
                               FilePath workspace, PrintStream logger) {
        def totalFixed = 0
        
        files.each { file ->
            def fixes = grader.getAutoFixes(file)
            if (fixes.size() > 0) {
                logger.println("Applying ${fixes.size()} fixes to ${file.getName()}...")
                
                def content = file.readToString()
                fixes.each { fix ->
                    content = applyFix(content, fix)
                    logger.println("  Fixed: ${fix.description}")
                }
                
                file.write(content, "UTF-8")
                totalFixed += fixes.size()
            }
        }
        
        return totalFixed
    }
    
    private String applyFix(String content, def fix) {
        // Apply text edits
        fix.edits.each { edit ->
            // Implementation of text replacement
        }
        return content
    }
    
    private String getBranch(Run run) {
        // Get branch name from environment or SCM
        def env = run.getEnvironment()
        return env.get("GIT_BRANCH") ?: env.get("BRANCH_NAME") ?: "unknown"
    }
    
    private String getCommit(Run run) {
        // Get commit hash from environment or SCM
        def env = run.getEnvironment()
        return env.get("GIT_COMMIT") ?: env.get("COMMIT_HASH") ?: "unknown"
    }
    
    @Extension
    @Symbol("apiGrader")
    static class DescriptorImpl extends BuildStepDescriptor<Builder> {
        
        @Override
        boolean isApplicable(Class<? extends AbstractProject> jobType) {
            return true
        }
        
        @Override
        String getDisplayName() {
            return "Grade API Specifications"
        }
    }
}

/**
 * Pipeline DSL support
 */
class APIGraderPipelineStep {
    
    static def grade(Map args = [:]) {
        def apiKey = args.apiKey ?: env.API_GRADER_KEY
        def files = args.files ?: "**/*.{yaml,yml,json}"
        def minGrade = args.minGrade ?: 70
        def failOnErrors = args.failOnErrors ?: true
        
        return {
            script {
                echo "Grading API specifications..."
                
                def grader = new APIGraderClient(apiKey)
                def apiFiles = findFiles(glob: files)
                def results = []
                def totalGrade = 0
                
                apiFiles.each { file ->
                    echo "Grading ${file.path}..."
                    def result = grader.gradeFile(file.path)
                    results.add(result)
                    totalGrade += result.grade
                    
                    if (result.grade < minGrade) {
                        if (failOnErrors) {
                            error("API grade ${result.grade} is below threshold ${minGrade}")
                        } else {
                            unstable("API grade ${result.grade} is below threshold ${minGrade}")
                        }
                    }
                }
                
                def avgGrade = apiFiles.size() > 0 ? (totalGrade / apiFiles.size()).intValue() : 0
                
                currentBuild.description = "API Grade: ${avgGrade}/100"
                
                return [
                    grade: avgGrade,
                    results: results,
                    files: apiFiles.size()
                ]
            }
        }
    }
    
    static def securityScan(Map args = [:]) {
        def apiKey = args.apiKey ?: env.API_GRADER_KEY
        def files = args.files ?: "**/*.{yaml,yml,json}"
        def failOnVulnerabilities = args.failOnVulnerabilities ?: true
        
        return {
            script {
                echo "Running security scan on API specifications..."
                
                def grader = new APIGraderClient(apiKey)
                def apiFiles = findFiles(glob: files)
                def totalVulnerabilities = 0
                
                apiFiles.each { file ->
                    echo "Scanning ${file.path}..."
                    def vulnerabilities = grader.scanSecurity(file.path)
                    totalVulnerabilities += vulnerabilities.size()
                    
                    vulnerabilities.each { vuln ->
                        echo "SECURITY: ${vuln.severity} - ${vuln.message}"
                    }
                }
                
                if (totalVulnerabilities > 0 && failOnVulnerabilities) {
                    error("Found ${totalVulnerabilities} security vulnerabilities")
                }
                
                return totalVulnerabilities
            }
        }
    }
    
    static def autoFix(Map args = [:]) {
        def apiKey = args.apiKey ?: env.API_GRADER_KEY
        def files = args.files ?: "**/*.{yaml,yml,json}"
        def commit = args.commit ?: false
        
        return {
            script {
                echo "Applying automatic fixes to API specifications..."
                
                def grader = new APIGraderClient(apiKey)
                def apiFiles = findFiles(glob: files)
                def totalFixed = 0
                
                apiFiles.each { file ->
                    def fixes = grader.getAutoFixes(file.path)
                    if (fixes.size() > 0) {
                        echo "Fixing ${fixes.size()} issues in ${file.path}..."
                        grader.applyFixes(file.path, fixes)
                        totalFixed += fixes.size()
                    }
                }
                
                if (commit && totalFixed > 0) {
                    sh """
                        git add -A
                        git commit -m "Auto-fix ${totalFixed} API issues"
                        git push
                    """
                }
                
                echo "Fixed ${totalFixed} issues"
                return totalFixed
            }
        }
    }
}

/**
 * Global pipeline library
 */
@Library('api-grader') _

def call(Map config = [:]) {
    pipeline {
        agent any
        
        environment {
            API_GRADER_KEY = credentials('api-grader-key')
        }
        
        stages {
            stage('API Grading') {
                steps {
                    script {
                        def result = apiGrader.grade(
                            apiKey: env.API_GRADER_KEY,
                            files: config.files ?: "**/*.{yaml,yml,json}",
                            minGrade: config.minGrade ?: 70,
                            failOnErrors: config.failOnErrors ?: true
                        )
                        
                        echo "Average grade: ${result.grade}/100"
                        echo "Files graded: ${result.files}"
                    }
                }
            }
            
            stage('Security Scan') {
                when {
                    expression { config.securityScan != false }
                }
                steps {
                    script {
                        def vulnerabilities = apiGrader.securityScan(
                            apiKey: env.API_GRADER_KEY,
                            files: config.files ?: "**/*.{yaml,yml,json}",
                            failOnVulnerabilities: config.failOnVulnerabilities ?: true
                        )
                        
                        echo "Security vulnerabilities found: ${vulnerabilities}"
                    }
                }
            }
            
            stage('Auto Fix') {
                when {
                    expression { config.autoFix == true }
                }
                steps {
                    script {
                        def fixed = apiGrader.autoFix(
                            apiKey: env.API_GRADER_KEY,
                            files: config.files ?: "**/*.{yaml,yml,json}",
                            commit: config.commitFixes ?: false
                        )
                        
                        echo "Issues fixed: ${fixed}"
                    }
                }
            }
            
            stage('Generate Report') {
                when {
                    expression { config.generateReport != false }
                }
                steps {
                    script {
                        apiGrader.generateReport(
                            apiKey: env.API_GRADER_KEY,
                            format: 'html',
                            output: 'api-grading-report.html'
                        )
                        
                        archiveArtifacts artifacts: 'api-grading-report.html'
                        publishHTML(target: [
                            reportName: 'API Grading Report',
                            reportDir: '.',
                            reportFiles: 'api-grading-report.html',
                            keepAll: true
                        ])
                    }
                }
            }
        }
        
        post {
            always {
                script {
                    if (config.uploadResults != false) {
                        apiGrader.uploadResults(
                            apiKey: env.API_GRADER_KEY,
                            project: env.JOB_NAME,
                            build: env.BUILD_NUMBER
                        )
                    }
                }
            }
        }
    }
}

/**
 * Supporting classes
 */
class APIGraderClient {
    private String apiKey
    
    APIGraderClient(String apiKey) {
        this.apiKey = apiKey
    }
    
    def gradeFile(file) {
        // API call implementation
        return [
            grade: 85,
            issues: [],
            suggestions: []
        ]
    }
    
    def checkCompliance(file, standard) {
        return [
            compliant: true,
            violations: []
        ]
    }
    
    def scanSecurity(file) {
        return []
    }
    
    def testPerformance(file) {
        return [
            responseTime: 100,
            throughput: 1000,
            complexity: 'low',
            bottlenecks: []
        ]
    }
    
    def getAutoFixes(file) {
        return []
    }
    
    def applyFixes(file, fixes) {
        // Apply fixes
    }
    
    def generateReport(results) {
        return "<html>...</html>"
    }
    
    def uploadResults(results, metadata) {
        return "https://apigrader.com/report/12345"
    }
}

class APIGraderBuildAction implements Action {
    private final int grade
    private final int issues
    private final def results
    
    APIGraderBuildAction(int grade, int issues, def results) {
        this.grade = grade
        this.issues = issues
        this.results = results
    }
    
    String getIconFileName() {
        return "/plugin/api-grader/images/icon.png"
    }
    
    String getDisplayName() {
        return "API Grading Results"
    }
    
    String getUrlName() {
        return "api-grader"
    }
}

class APIGraderReportAction implements Action {
    private final Run run
    private final FilePath reportFile
    
    APIGraderReportAction(Run run, FilePath reportFile) {
        this.run = run
        this.reportFile = reportFile
    }
    
    String getIconFileName() {
        return "/plugin/api-grader/images/report.png"
    }
    
    String getDisplayName() {
        return "API Grading Report"
    }
    
    String getUrlName() {
        return "api-grader-report"
    }
}

class APIGraderBadgeAction implements Action {
    private final int grade
    private final String url
    
    APIGraderBadgeAction(int grade, String url) {
        this.grade = grade
        this.url = url
    }
    
    String getIconFileName() {
        def color = grade >= 90 ? "green" : grade >= 70 ? "yellow" : "red"
        return "/plugin/api-grader/images/badge-${color}.png"
    }
    
    String getDisplayName() {
        return "API Grade: ${grade}/100"
    }
    
    String getUrlName() {
        return url
    }
}
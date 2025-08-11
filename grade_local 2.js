#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function gradeAPI(filePath) {
  console.log(`\n📋 Grading API: ${filePath}\n`);
  
  // Read the API file
  const apiContent = fs.readFileSync(filePath, 'utf8');
  const base64Content = Buffer.from(apiContent).toString('base64');
  
  // Create MCP request
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "grade_contract",
      arguments: {
        content: base64Content,
        format: "base64"
      }
    }
  };
  
  // Save request to temp file
  const tempFile = path.join(__dirname, 'temp_request.json');
  fs.writeFileSync(tempFile, JSON.stringify(request));
  
  try {
    // Use the MCP server directly
    const { stdout } = await execAsync(
      `cat ${tempFile} | npx tsx src/mcp/server.ts 2>/dev/null | grep -A 1000 '"result"'`,
      { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 }
    );
    
    // Parse the result
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.includes('"result"')) {
        const jsonStart = line.indexOf('{');
        if (jsonStart >= 0) {
          const json = JSON.parse(line.substring(jsonStart));
          if (json.result && json.result.content) {
            const content = JSON.parse(json.result.content[0].text);
            
            console.log('=== GRADING RESULTS ===\n');
            console.log(`Score: ${content.score}/100`);
            console.log(`Grade: ${content.letterGrade}`);
            console.log(`Status: ${content.passed ? '✅ PASSED' : '❌ FAILED'}`);
            console.log(`\nSummary: ${content.summary}`);
            
            if (content.issues && content.issues.length > 0) {
              console.log('\n=== TOP ISSUES ===');
              content.issues.slice(0, 5).forEach((issue, i) => {
                console.log(`${i + 1}. [${issue.severity}] ${issue.message}`);
              });
            }
            
            // Save full report
            const reportFile = filePath.replace('.yaml', '-grade-report.json');
            fs.writeFileSync(reportFile, JSON.stringify(content, null, 2));
            console.log(`\n📄 Full report saved to: ${reportFile}`);
            
            return content;
          }
        }
      }
    }
    
    console.log('Could not parse grading results');
    console.log('Raw output:', stdout.substring(0, 500));
    
  } catch (error) {
    console.error('Grading failed:', error.message);
    
    // Try alternative approach - direct import
    console.log('\nTrying alternative approach...');
    try {
      const { gradeContract } = await import('./dist/app/pipeline.js');
      const result = await gradeContract(apiContent);
      
      console.log('=== GRADING RESULTS ===\n');
      console.log(`Score: ${result.score}/100`);
      console.log(`Grade: ${result.letterGrade}`);
      console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`\nSummary: ${result.summary}`);
      
      return result;
    } catch (e2) {
      console.error('Alternative approach also failed:', e2.message);
    }
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

// Run the grader
const apiFile = process.argv[2] || '/Users/brooksswift/Desktop/api-grader-mcp-starter/test-api.yaml';
gradeAPI(apiFile).catch(console.error);
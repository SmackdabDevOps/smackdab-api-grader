#!/usr/bin/env node

import fs from 'fs';

async function testRenderGrader() {
  const apiContent = fs.readFileSync('/Users/brooksswift/Desktop/api-grader-mcp-starter/test-api.yaml', 'utf8');
  const base64Content = Buffer.from(apiContent).toString('base64');
  
  console.log('Testing Render deployment at: https://smackdab-api-grader.onrender.com');
  console.log('');
  
  try {
    // First check health
    console.log('1. Checking health endpoint...');
    const healthResponse = await fetch('https://smackdab-api-grader.onrender.com/health');
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log('✅ Health check passed:', health);
    } else {
      console.log('❌ Health check failed:', healthResponse.status);
      return;
    }
    
    // Test grading via SSE endpoint
    console.log('\n2. Testing grading via SSE endpoint...');
    
    // Create the MCP request
    const gradeRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'grade_contract',
        arguments: {
          content: base64Content,
          format: 'base64'
        }
      }
    };
    
    // Send request to SSE endpoint
    const response = await fetch('https://smackdab-api-grader.onrender.com/sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk_prod_001'
      },
      body: JSON.stringify(gradeRequest)
    });
    
    if (!response.ok) {
      console.log('❌ Grading request failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error:', errorText);
      return;
    }
    
    const result = await response.text();
    
    // Parse SSE response
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.result && data.result.content) {
            const gradeData = JSON.parse(data.result.content[0].text);
            
            console.log('\n✅ GRADING SUCCESSFUL!\n');
            console.log('=== RESULTS ===');
            console.log(`Score: ${gradeData.grade.total}/100`);
            console.log(`Grade: ${gradeData.grade.letter}`);
            console.log(`Compliance: ${(gradeData.grade.compliancePct * 100).toFixed(1)}%`);
            
            if (gradeData.grade.perCategory) {
              console.log('\nCategory Breakdown:');
              Object.entries(gradeData.grade.perCategory).forEach(([cat, data]) => {
                console.log(`  ${cat}: ${data.earned}/${data.max} (${(data.percentage * 100).toFixed(0)}%)`);
              });
            }
            
            if (gradeData.findings && gradeData.findings.length > 0) {
              console.log('\nTop Issues:');
              gradeData.findings.slice(0, 5).forEach((issue, i) => {
                console.log(`  ${i + 1}. [${issue.severity}] ${issue.message}`);
              });
            }
            
            console.log('\n✅ Render deployment is working correctly!');
            return;
          }
        } catch (e) {
          // Continue to next line
        }
      }
    }
    
    console.log('❌ Could not parse grading results');
    console.log('Raw response:', result.substring(0, 500));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
console.log('='.repeat(50));
console.log('RENDER DEPLOYMENT TEST');
console.log('='.repeat(50));
testRenderGrader().catch(console.error);
import fs from 'fs';

async function testGrader() {
  const apiContent = fs.readFileSync('/Users/brooksswift/Desktop/api-grader-mcp-starter/test-api.yaml', 'utf8');
  const base64Content = Buffer.from(apiContent).toString('base64');
  
  // First establish SSE connection
  const sessionResponse = await fetch('http://localhost:3000/sse', {
    headers: {
      'Accept': 'text/event-stream',
      'Authorization': 'Bearer sk_prod_001'
    }
  });
  
  if (!sessionResponse.ok) {
    console.error('Failed to establish SSE connection:', sessionResponse.status);
    return;
  }
  
  const sessionId = sessionResponse.headers.get('x-session-id');
  console.log('Session ID:', sessionId);
  
  // Send grade request
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
  
  const response = await fetch('http://localhost:3000/sse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk_prod_001',
      'X-Session-ID': sessionId
    },
    body: JSON.stringify(gradeRequest)
  });
  
  const result = await response.text();
  console.log('Grade Response:', result);
  
  // Parse and display the grade
  try {
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.substring(6));
        if (data.result) {
          console.log('\n=== GRADING RESULTS ===');
          console.log('Score:', data.result.score);
          console.log('Letter Grade:', data.result.letterGrade);
          console.log('Pass/Fail:', data.result.passed ? 'PASS' : 'FAIL');
          console.log('\nSummary:', data.result.summary);
        }
      }
    }
  } catch (e) {
    console.log('Raw response:', result);
  }
}

testGrader().catch(console.error);

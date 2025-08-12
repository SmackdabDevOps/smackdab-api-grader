#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function gradeAPI() {
  const apiSpec = fs.readFileSync(path.join(__dirname, 'sample-inventory-api.yaml'), 'utf8');
  
  const response = await fetch('http://localhost:3000/api/grade', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sk_prod_001',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: apiSpec,
      isUrl: false
    })
  });
  
  if (!response.ok) {
    console.error('Failed to grade:', response.status, await response.text());
    return;
  }
  
  const result = await response.json();
  
  console.log('\n=== API GRADING RESULTS ===');
  console.log('Score:', result.totalScore || 0, '/ 100');
  console.log('Grade:', result.finalGrade || 'N/A');
  console.log('Checkpoints Passed:', result.checkpointsPassed || 0);
  console.log('Checkpoints Failed:', result.checkpointsFailed || 0);
  console.log('Percent Passed:', result.percentPassed || 0, '%');
  
  if (result.detailedResults) {
    console.log('\n=== DETAILED RESULTS ===');
    result.detailedResults.forEach((checkpoint, index) => {
      const status = checkpoint.passed ? '✅' : '❌';
      console.log(`${status} ${checkpoint.name}: ${checkpoint.score}/${checkpoint.maxScore}`);
      if (!checkpoint.passed && checkpoint.errors) {
        checkpoint.errors.forEach(error => {
          console.log(`   - ${error}`);
        });
      }
    });
  }
  
  console.log('\n=== SUMMARY ===');
  if (result.totalScore >= 90) {
    console.log('🎉 Excellent! This API meets SmackDab standards.');
  } else if (result.totalScore >= 70) {
    console.log('👍 Good! Some improvements needed.');
  } else {
    console.log('⚠️  Needs significant work to meet standards.');
  }
}

gradeAPI().catch(console.error);
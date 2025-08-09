#!/usr/bin/env tsx
import crypto from 'crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function generateApiKey() {
  console.log('=== Smackdab API Grader - API Key Generator ===\n');
  
  const teamId = await question('Enter team ID (e.g., acme-corp): ');
  const teamName = await question('Enter team name (e.g., ACME Corporation): ');
  const userId = await question('Enter user ID (e.g., john.doe): ');
  const usageLimit = await question('Enter monthly usage limit (default: 1000): ') || '1000';
  
  // Generate API key
  const apiKey = 'sk_' + crypto.randomBytes(24).toString('hex');
  
  // Hash the API key for storage (in production, use bcrypt)
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  try {
    // Store in database if connected
    if (process.env.DATABASE_URL || process.env.PGHOST) {
      const connectionString = process.env.DATABASE_URL || 
        `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
      
      const pool = new Pool({ connectionString });
      
      // Insert or update team
      await pool.query(
        `INSERT INTO teams (team_id, name, api_key_hash, usage_limit)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (team_id) 
         DO UPDATE SET name = $2, api_key_hash = $3, usage_limit = $4`,
        [teamId, teamName, apiKeyHash, parseInt(usageLimit)]
      );
      
      console.log('\n✅ Team created/updated in database');
      await pool.end();
    }
    
    // Generate the API_KEYS environment variable format
    const apiKeysEntry = {
      [apiKey]: {
        teamId,
        userId
      }
    };
    
    console.log('\n=== Generated API Key ===');
    console.log(`API Key: ${apiKey}`);
    console.log('\n⚠️  Save this key securely - it won\'t be shown again!\n');
    
    console.log('=== Environment Variable Format ===');
    console.log('Add this to your API_KEYS environment variable:');
    console.log(JSON.stringify(apiKeysEntry, null, 2));
    
    console.log('\n=== MCP Client Configuration ===');
    console.log('Use this configuration in Claude/Qodo:\n');
    console.log(JSON.stringify({
      mcpServers: {
        "smackdab-api-grader": {
          url: "https://your-app.railway.app/sse",
          transport: "sse",
          headers: {
            "Authorization": `Bearer ${apiKey}`
          }
        }
      }
    }, null, 2));
    
  } catch (error) {
    console.error('Error saving to database:', error);
    console.log('\nAPI key generated but not saved to database.');
    console.log('You can still use it by adding it to the API_KEYS environment variable.');
  }
  
  rl.close();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateApiKey();
}

export { generateApiKey };
// Fix for caching issue - check if spec has been graded before
import crypto from 'node:crypto';
import { GraderDB } from '../mcp/persistence/db.js';

function sha256(s: string) { 
  return crypto.createHash('sha256').update(s).digest('hex'); 
}

export async function checkExistingGrade(specContent: string, apiId?: string): Promise<any | null> {
  try {
    const specHash = sha256(specContent.replace(/\r\n/g, '\n'));
    const db = new GraderDB();
    await db.connect();
    
    // Check if we have a recent grade for this exact spec content
    const existingRun = await db.db?.get(
      `SELECT json_report, graded_at, total_score, letter_grade 
       FROM run 
       WHERE spec_hash = ? 
       ORDER BY graded_at DESC 
       LIMIT 1`,
      specHash
    );
    
    if (existingRun) {
      // Check if the grade is recent (within last hour)
      const gradedAt = new Date(existingRun.graded_at);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      if (gradedAt > hourAgo) {
        console.log(`[CACHE HIT] Found recent grade for spec hash ${specHash.slice(0, 8)}...`);
        console.log(`[CACHE HIT] Graded at: ${existingRun.graded_at}`);
        console.log(`[CACHE HIT] Score: ${existingRun.total_score}, Grade: ${existingRun.letter_grade}`);
        
        // Return the cached result
        try {
          return JSON.parse(existingRun.json_report);
        } catch (e) {
          console.error('[CACHE ERROR] Failed to parse cached JSON report:', e);
          return null;
        }
      } else {
        console.log(`[CACHE MISS] Found grade but it's older than 1 hour: ${existingRun.graded_at}`);
      }
    } else {
      console.log(`[CACHE MISS] No existing grade found for spec hash ${specHash.slice(0, 8)}...`);
    }
    
    await db.close();
    return null;
  } catch (error) {
    console.error('[CACHE ERROR] Error checking existing grade:', error);
    return null;
  }
}

// Extension method to add to GraderDB class
export async function getApiHistoryExtension(this: GraderDB, apiUuid: string): Promise<any[]> {
  if (!this.db) throw new Error('DB not connected');
  
  const history = await this.db.all(
    `SELECT 
      run_id,
      graded_at as timestamp,
      total_score as totalScore,
      letter_grade as finalGrade,
      spec_hash as specHash,
      template_version as apiVersion
     FROM run 
     WHERE api_id = ? 
     ORDER BY graded_at DESC 
     LIMIT 100`,
    apiUuid
  );
  
  return history;
}

// Function to clear cache for a specific API or spec hash
export async function clearGradeCache(apiId?: string, specHash?: string): Promise<void> {
  try {
    const db = new GraderDB();
    await db.connect();
    
    if (specHash) {
      console.log(`[CACHE CLEAR] Clearing cache for spec hash ${specHash.slice(0, 8)}...`);
      await db.db?.run(`DELETE FROM run WHERE spec_hash = ?`, specHash);
    } else if (apiId) {
      console.log(`[CACHE CLEAR] Clearing cache for API ID ${apiId}`);
      await db.db?.run(`DELETE FROM run WHERE api_id = ?`, apiId);
    }
    
    await db.close();
  } catch (error) {
    console.error('[CACHE CLEAR] Error clearing cache:', error);
  }
}

// Function to force re-grade by adding a timestamp to make content unique
export function forceRegrade(specContent: string): string {
  // Add a comment with timestamp to force different hash
  const timestamp = new Date().toISOString();
  return `${specContent}\n# Force re-grade at: ${timestamp}`;
}
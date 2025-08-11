import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        teamId: string;
        userId: string;
        apiKey: string;
      };
    }
  }
}

// In production, these would come from a database
// For now, using environment variables
const API_KEYS = new Map<string, { teamId: string; userId: string }>();

// Initialize API keys from environment
export function initializeApiKeys() {
  // TEMPORARY: Hardcode the key since Render env var isn't working
  // This should be removed once env vars are working properly
  if (process.env.NODE_ENV === 'production' || process.env.PORT) {
    console.log('Production mode detected - using hardcoded keys');
    API_KEYS.set('sk_prod_001', {
      teamId: 'team-alpha',
      userId: 'admin'
    });
    console.log('Hardcoded sk_prod_001 key loaded');
    return;
  }
  
  // Check both API_KEYS and API_Keys (Render might use different casing)
  const keysJson = process.env.API_KEYS || process.env.API_Keys || process.env['API_Keys'] || '{}';
  console.log('Initializing API keys from environment:', keysJson);
  console.log('All env vars starting with API:', Object.keys(process.env).filter(k => k.startsWith('API')));
  try {
    const keys = JSON.parse(keysJson);
    Object.entries(keys).forEach(([apiKey, data]: [string, any]) => {
      // Support both simple string values and object values
      if (typeof data === 'string') {
        API_KEYS.set(apiKey, {
          teamId: 'default-team',
          userId: data
        });
      } else {
        API_KEYS.set(apiKey, {
          teamId: data.teamId || 'default-team',
          userId: data.userId || data
        });
      }
      console.log(`Added API key: ${apiKey.substring(0, 10)}...`);
    });
    console.log(`Total API keys loaded: ${API_KEYS.size}`);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to parse API_KEYS:', error);
    }
    // Add a default key for development
    if (process.env.NODE_ENV !== 'production') {
      const devKey = 'dev_' + crypto.randomBytes(16).toString('hex');
      API_KEYS.set(devKey, {
        teamId: 'dev-team',
        userId: 'dev-user'
      });
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Development API key: ${devKey}`);
      }
    }
  }
  
  // If no keys loaded in production, add a default one
  if (API_KEYS.size === 0 && process.env.NODE_ENV === 'production') {
    console.log('WARNING: No API keys loaded in production, adding default key');
    API_KEYS.set('sk_prod_001', {
      teamId: 'team-alpha',
      userId: 'admin'
    });
  }
}

// Don't initialize on module load - let the server do it
// initializeApiKeys();

// Rate limiting map (in production, use Redis)
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_WINDOW = 60000; // 1 minute in milliseconds

// Helper function to get rate limit dynamically for testing
function getRateLimit(): number {
  const limit = parseInt(process.env.RATE_LIMIT || '100');
  // Handle NaN case - default to 100 if parsing fails
  return isNaN(limit) ? 100 : limit;
}

export function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  console.log('=== Auth middleware called ===');
  console.log('Method:', req.method, 'Path:', req.path);
  console.log('Headers:', JSON.stringify(req.headers));
  // Extract API key from headers (Express lowercases header names)
  const authHeader = req.headers.authorization as string;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const apiKey = authHeader.substring(7);
  if (!apiKey || apiKey.trim() === '') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  console.log(`Authenticating request with key: "${apiKey}"`);
  console.log(`Key length: ${apiKey.length}`);
  console.log(`Available keys in map:`);
  for (const [key, value] of API_KEYS.entries()) {
    console.log(`  - "${key}" (length: ${key.length}) -> ${JSON.stringify(value)}`);
  }
  
  // Validate API key
  const keyData = API_KEYS.get(apiKey);
  if (!keyData) {
    console.log(`Key not found. Exact match failed for: "${apiKey}"`);
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Check rate limit
  const now = Date.now();
  const limit = rateLimits.get(keyData.teamId);
  const rateLimit = getRateLimit();
  
  if (limit) {
    if (now < limit.resetTime) {
      if (limit.count >= rateLimit) {
        const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          retryAfter 
        });
      }
      limit.count++;
    } else {
      // Reset window
      limit.count = 1;
      limit.resetTime = now + RATE_WINDOW;
    }
  } else {
    // First request
    rateLimits.set(keyData.teamId, {
      count: 1,
      resetTime: now + RATE_WINDOW
    });
  }

  // Attach user data to request
  req.user = {
    teamId: keyData.teamId,
    userId: keyData.userId,
    apiKey
  };

  next();
}

// Helper to generate new API keys
export function generateApiKey(teamId: string, userId: string): string {
  try {
    const key = 'sk_' + crypto.randomBytes(24).toString('hex');
    API_KEYS.set(key, { teamId, userId });
    return key;
  } catch (error) {
    // Fallback for test environment where crypto might not be available
    let randomHex = '';
    while (randomHex.length < 48) {
      randomHex += Math.random().toString(16).substring(2);
    }
    const key = 'sk_' + randomHex.substring(0, 48);
    API_KEYS.set(key, { teamId, userId });
    return key;
  }
}

// Helper to revoke API keys
export function revokeApiKey(apiKey: string): boolean {
  return API_KEYS.delete(apiKey);
}

// Helper to list keys for a team (returns masked keys)
export function listTeamKeys(teamId: string): string[] {
  const keys: string[] = [];
  API_KEYS.forEach((data, key) => {
    if (data.teamId === teamId) {
      // Mask the key for security
      keys.push(key.substring(0, 7) + '...' + key.substring(key.length - 4));
    }
  });
  return keys;
}

// Export for use in other modules
export function getApiKeys(): Map<string, { teamId: string; userId: string }> {
  return API_KEYS;
}

// Export for testing - clear rate limits
export function clearRateLimits(): void {
  rateLimits.clear();
}
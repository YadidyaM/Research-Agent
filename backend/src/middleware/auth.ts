import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { User, IUser } from '../models/User';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      auth0User?: any;
    }
  }
}

// JWKS client for Auth0 token verification
const client = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  requestHeaders: {}, // Optional
  timeout: 30000, // Defaults to 30s
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify JWT token
    jwt.verify(token, getKey, {
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256']
    }, async (err, decoded) => {
      if (err) {
        console.error('JWT verification error:', err);
        return res.status(403).json({ error: 'Invalid token' });
      }

      const auth0User = decoded as any;
      req.auth0User = auth0User;

      // Find or create user in database
      try {
        let user = await User.findOne({ auth0Id: auth0User.sub });

        if (!user) {
          // Create new user
          user = new User({
            auth0Id: auth0User.sub,
            email: auth0User.email,
            name: auth0User.name || auth0User.email,
            picture: auth0User.picture,
            metadata: {
              lastLogin: new Date(),
              loginCount: 1,
              ipAddress: req.ip,
              userAgent: req.get('User-Agent')
            }
          });
          await user.save();
        } else {
          // Update existing user
          user.metadata.lastLogin = new Date();
          user.metadata.loginCount += 1;
          user.metadata.ipAddress = req.ip;
          user.metadata.userAgent = req.get('User-Agent');
          
          // Update user info from Auth0
          user.email = auth0User.email;
          user.name = auth0User.name || auth0User.email;
          user.picture = auth0User.picture;
          
          await user.save();
        }

        req.user = user;
        next();
      } catch (dbError) {
        console.error('Database error in auth middleware:', dbError);
        return res.status(500).json({ error: 'Database error' });
      }
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

export const requireActiveUser = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.isActive) {
    return res.status(403).json({ error: 'Account is inactive' });
  }
  next();
};

export const requirePaidUser = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!req.user.isPaid || req.user.subscriptionStatus !== 'active') {
    return res.status(403).json({ 
      error: 'Premium subscription required',
      isPaid: req.user.isPaid,
      subscriptionStatus: req.user.subscriptionStatus 
    });
  }
  
  next();
};

export const checkUsageLimit = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const canUse = req.user.canUseService();
  
  if (!canUse.canUse) {
    return res.status(403).json({ 
      error: 'Usage limit exceeded',
      reason: canUse.reason,
      dailyQueries: req.user.dailyQueries,
      isPaid: req.user.isPaid,
      subscriptionStatus: req.user.subscriptionStatus
    });
  }

  next();
};

export const trackUsage = async (req: Request, res: Response, next: NextFunction) => {
  if (req.user) {
    try {
      // Reset daily queries if needed and increment
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (!req.user.trialDate || req.user.trialDate < today) {
        req.user.startTrial();
      }
      
      req.user.incrementQueries();
      await req.user.save();
    } catch (error) {
      console.error('Error tracking usage:', error);
    }
  }
  next();
};

// Optional auth middleware - doesn't require authentication but adds user if present
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // No token, continue without user
    }

    // Verify JWT token
    jwt.verify(token, getKey, {
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256']
    }, async (err, decoded) => {
      if (err) {
        console.error('JWT verification error (optional):', err);
        return next(); // Invalid token, continue without user
      }

      const auth0User = decoded as any;
      req.auth0User = auth0User;

      try {
        const user = await User.findOne({ auth0Id: auth0User.sub });
        if (user) {
          req.user = user;
        }
      } catch (dbError) {
        console.error('Database error in optional auth:', dbError);
      }
      
      next();
    });
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(); // Continue without user on error
  }
}; 
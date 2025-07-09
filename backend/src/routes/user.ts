import express from 'express';
import { authenticateToken, requireAuth, requireActiveUser } from '../middleware/auth';
import { User } from '../models/User';

const router = express.Router();

// Get user usage information
router.get('/usage', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    
    // Reset daily queries if needed
    user.resetDailyQueries();
    
    const usage = {
      trialUsed: user.trialUsed,
      trialDate: user.trialDate,
      trialExpiry: user.trialExpiry,
      isPaid: user.isPaid,
      queriesUsed: user.dailyQueries,
      maxQueries: user.isPaid ? 999 : 3, // Unlimited for paid users, 3 for trial
      totalQueries: user.totalQueries,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionExpiry: user.subscriptionEnd,
      lastQueryDate: user.lastQueryDate,
    };

    res.json(usage);
  } catch (error) {
    console.error('Error fetching user usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage information' });
  }
});

// Get user profile information
router.get('/profile', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    
    const profile = {
      id: user._id,
      auth0Id: user.auth0Id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      isActive: user.isActive,
      createdAt: user.createdAt,
      isPaid: user.isPaid,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionStart: user.subscriptionStart,
      subscriptionEnd: user.subscriptionEnd,
      totalQueries: user.totalQueries,
      metadata: {
        lastLogin: user.metadata.lastLogin,
        loginCount: user.metadata.loginCount,
      },
    };

    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile information' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { name } = req.body;

    if (name && typeof name === 'string') {
      user.name = name.trim();
      await user.save();
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user subscription information
router.get('/subscription', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    
    const subscription = {
      isPaid: user.isPaid,
      subscriptionId: user.subscriptionId,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionStart: user.subscriptionStart,
      subscriptionEnd: user.subscriptionEnd,
      stripeCustomerId: user.stripeCustomerId,
    };

    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription information:', error);
    res.status(500).json({ error: 'Failed to fetch subscription information' });
  }
});

// Delete user account (soft delete)
router.delete('/account', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    
    // Soft delete - mark as inactive
    user.isActive = false;
    await user.save();

    res.json({ message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating account:', error);
    res.status(500).json({ error: 'Failed to deactivate account' });
  }
});

// Get user statistics (admin only or self)
router.get('/stats', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      dailyQueries: user.dailyQueries,
      totalQueries: user.totalQueries,
      memberSince: user.createdAt,
      lastActivity: user.metadata.lastLogin,
      loginCount: user.metadata.loginCount,
      trialStatus: {
        used: user.trialUsed,
        date: user.trialDate,
        expiry: user.trialExpiry,
        canUse: user.canUseService(),
      },
      subscription: {
        isPaid: user.isPaid,
        status: user.subscriptionStatus,
        start: user.subscriptionStart,
        end: user.subscriptionEnd,
      },
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

export default router; 
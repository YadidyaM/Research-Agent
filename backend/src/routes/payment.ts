import express from 'express';
import { authenticateToken, requireAuth, requireActiveUser } from '../middleware/auth';
import StripeService from '../services/StripeService';

const router = express.Router();
const stripeService = new StripeService();

// Create Stripe checkout session for subscription
router.post('/create-session', authenticateToken, requireAuth, requireActiveUser, async (req, res) => {
  try {
    const user = req.user!;
    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId || !successUrl || !cancelUrl) {
      return res.status(400).json({ 
        error: 'Missing required fields: priceId, successUrl, cancelUrl' 
      });
    }

    // Check if user already has an active subscription
    if (user.isPaid && user.subscriptionStatus === 'active') {
      return res.status(400).json({ 
        error: 'User already has an active subscription' 
      });
    }

    const session = await stripeService.createCheckoutSession(
      user,
      priceId,
      successUrl,
      cancelUrl
    );

    res.json({ 
      sessionId: session.id,
      url: session.url 
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create billing portal session for subscription management
router.post('/billing-portal', authenticateToken, requireAuth, requireActiveUser, async (req, res) => {
  try {
    const user = req.user!;
    const { returnUrl } = req.body;

    if (!returnUrl) {
      return res.status(400).json({ 
        error: 'Missing required field: returnUrl' 
      });
    }

    if (!user.stripeCustomerId) {
      return res.status(400).json({ 
        error: 'User does not have a Stripe customer account' 
      });
    }

    const session = await stripeService.createBillingPortalSession(user, returnUrl);

    res.json({ 
      url: session.url 
    });
  } catch (error) {
    console.error('Error creating billing portal session:', error);
    res.status(500).json({ 
      error: 'Failed to create billing portal session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get subscription status
router.get('/subscription', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    const subscription = {
      isPaid: user.isPaid,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionStart: user.subscriptionStart,
      subscriptionEnd: user.subscriptionEnd,
      hasStripeCustomer: !!user.stripeCustomerId,
    };

    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ 
      error: 'Failed to fetch subscription information' 
    });
  }
});

// Cancel subscription
router.post('/cancel-subscription', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    if (!user.subscriptionId) {
      return res.status(400).json({ 
        error: 'User does not have an active subscription' 
      });
    }

    const canceledSubscription = await stripeService.cancelSubscription(user.subscriptionId);

    // Update user record
    user.subscriptionStatus = 'canceled';
    user.isPaid = false;
    user.subscriptionEnd = new Date();
    await user.save();

    res.json({ 
      message: 'Subscription canceled successfully',
      subscriptionId: canceledSubscription.id 
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ 
      error: 'Failed to cancel subscription',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stripe webhook endpoint
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    console.error('Missing stripe-signature header');
    return res.status(400).send('Missing stripe-signature header');
  }

  try {
    const event = stripeService.constructEvent(req.body, signature);

    console.log(`Received Stripe webhook: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
        await stripeService.handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await stripeService.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await stripeService.handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await stripeService.handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await stripeService.handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Get payment history (optional)
router.get('/history', authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    if (!user.stripeCustomerId) {
      return res.json({ payments: [] });
    }

    // This would require additional Stripe API calls to get payment history
    // For now, return basic subscription info
    const history = {
      subscriptionId: user.subscriptionId,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionStart: user.subscriptionStart,
      subscriptionEnd: user.subscriptionEnd,
      isPaid: user.isPaid,
    };

    res.json({ history });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment history' 
    });
  }
});

export default router; 
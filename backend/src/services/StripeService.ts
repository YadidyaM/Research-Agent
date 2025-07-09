import Stripe from 'stripe';
import { User, IUser } from '../models/User';
import { config } from '../config';

export class StripeService {
  private stripe: Stripe;

  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    });
  }

  async createCustomer(user: IUser): Promise<Stripe.Customer> {
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        userId: user._id.toString(),
        auth0Id: user.auth0Id,
      },
    });

    // Update user with Stripe customer ID
    user.stripeCustomerId = customer.id;
    await user.save();

    return customer;
  }

  async getOrCreateCustomer(user: IUser): Promise<Stripe.Customer> {
    if (user.stripeCustomerId) {
      try {
        const customer = await this.stripe.customers.retrieve(user.stripeCustomerId);
        if (!customer.deleted) {
          return customer as Stripe.Customer;
        }
      } catch (error) {
        console.error('Error retrieving Stripe customer:', error);
      }
    }

    return this.createCustomer(user);
  }

  async createCheckoutSession(user: IUser, priceId: string, successUrl: string, cancelUrl: string): Promise<Stripe.Checkout.Session> {
    const customer = await this.getOrCreateCustomer(user);

    const session = await this.stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: user._id.toString(),
        auth0Id: user.auth0Id,
      },
      subscription_data: {
        metadata: {
          userId: user._id.toString(),
          auth0Id: user.auth0Id,
        },
      },
    });

    return session;
  }

  async createBillingPortalSession(user: IUser, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    if (!user.stripeCustomerId) {
      throw new Error('User does not have a Stripe customer ID');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return session;
  }

  async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata.userId;
    if (!userId) {
      console.error('No userId in subscription metadata');
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for subscription:', subscription.id);
      return;
    }

    user.subscriptionId = subscription.id;
    user.subscriptionStatus = subscription.status as any;
    user.isPaid = subscription.status === 'active';
    user.subscriptionStart = new Date(subscription.current_period_start * 1000);
    user.subscriptionEnd = new Date(subscription.current_period_end * 1000);

    await user.save();
    console.log(`Subscription created for user ${user.email}: ${subscription.id}`);
  }

  async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata.userId;
    if (!userId) {
      console.error('No userId in subscription metadata');
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for subscription:', subscription.id);
      return;
    }

    user.subscriptionStatus = subscription.status as any;
    user.isPaid = subscription.status === 'active';
    user.subscriptionStart = new Date(subscription.current_period_start * 1000);
    user.subscriptionEnd = new Date(subscription.current_period_end * 1000);

    await user.save();
    console.log(`Subscription updated for user ${user.email}: ${subscription.id} - ${subscription.status}`);
  }

  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata.userId;
    if (!userId) {
      console.error('No userId in subscription metadata');
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found for subscription:', subscription.id);
      return;
    }

    user.subscriptionStatus = 'canceled';
    user.isPaid = false;
    user.subscriptionEnd = new Date();

    await user.save();
    console.log(`Subscription canceled for user ${user.email}: ${subscription.id}`);
  }

  async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription) return;

    const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
    await this.handleSubscriptionUpdated(subscription);
  }

  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription) return;

    const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
    
    const userId = subscription.metadata.userId;
    if (!userId) return;

    const user = await User.findById(userId);
    if (!user) return;

    // Optionally send email notification about failed payment
    console.log(`Payment failed for user ${user.email}: ${invoice.id}`);
  }

  constructEvent(body: string | Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required');
    }

    return this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.cancel(subscriptionId);
  }
}

export default StripeService; 
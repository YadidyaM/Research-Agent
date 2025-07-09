import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  auth0Id: string;
  email: string;
  name: string;
  picture?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Trial system
  trialUsed: boolean;
  trialDate?: Date;
  trialExpiry?: Date;
  
  // Usage tracking
  dailyQueries: number;
  totalQueries: number;
  lastQueryDate?: Date;
  
  // Payment system
  isPaid: boolean;
  stripeCustomerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'trialing' | 'unpaid';
  subscriptionStart?: Date;
  subscriptionEnd?: Date;
  
  // Metadata
  metadata: {
    lastLogin?: Date;
    loginCount: number;
    ipAddress?: string;
    userAgent?: string;
  };
}

const userSchema = new Schema<IUser>({
  auth0Id: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  name: { 
    type: String, 
    required: true 
  },
  picture: String,
  isActive: { 
    type: Boolean, 
    default: true 
  },
  
  // Trial system
  trialUsed: { 
    type: Boolean, 
    default: false 
  },
  trialDate: Date,
  trialExpiry: Date,
  
  // Usage tracking
  dailyQueries: { 
    type: Number, 
    default: 0 
  },
  totalQueries: { 
    type: Number, 
    default: 0 
  },
  lastQueryDate: Date,
  
  // Payment system
  isPaid: { 
    type: Boolean, 
    default: false 
  },
  stripeCustomerId: String,
  subscriptionId: String,
  subscriptionStatus: {
    type: String,
    enum: ['active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid'],
    default: undefined
  },
  subscriptionStart: Date,
  subscriptionEnd: Date,
  
  // Metadata
  metadata: {
    lastLogin: Date,
    loginCount: { 
      type: Number, 
      default: 0 
    },
    ipAddress: String,
    userAgent: String
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Indexes for performance
userSchema.index({ auth0Id: 1 });
userSchema.index({ email: 1 });
userSchema.index({ stripeCustomerId: 1 });
userSchema.index({ subscriptionId: 1 });
userSchema.index({ createdAt: -1 });

// Methods
userSchema.methods.resetDailyQueries = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!this.lastQueryDate || this.lastQueryDate < today) {
    this.dailyQueries = 0;
    this.lastQueryDate = new Date();
  }
};

userSchema.methods.incrementQueries = function() {
  this.resetDailyQueries();
  this.dailyQueries += 1;
  this.totalQueries += 1;
  this.lastQueryDate = new Date();
};

userSchema.methods.canUseService = function(): { canUse: boolean; reason?: string } {
  if (!this.isActive) {
    return { canUse: false, reason: 'Account is inactive' };
  }
  
  if (this.isPaid && this.subscriptionStatus === 'active') {
    return { canUse: true };
  }
  
  // Check daily trial
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (this.trialDate && this.trialDate >= today) {
    if (this.dailyQueries >= 3) { // 3 free queries per day
      return { canUse: false, reason: 'Daily trial limit reached' };
    }
    return { canUse: true };
  }
  
  // Reset trial for new day
  if (!this.trialDate || this.trialDate < today) {
    return { canUse: true }; // Can start new trial
  }
  
  return { canUse: false, reason: 'Trial expired and no active subscription' };
};

userSchema.methods.startTrial = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  this.trialUsed = true;
  this.trialDate = today;
  this.trialExpiry = new Date(today.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  this.dailyQueries = 0;
};

export const User = model<IUser>('User', userSchema);
export default User;

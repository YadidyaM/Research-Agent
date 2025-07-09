import mongoose, { Schema, Document } from 'mongoose';

// Interface for agent tasks
export interface IAgentTask extends Document {
  id: string;
  type: 'research' | 'analysis' | 'synthesis' | 'chat';
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  userId?: string;
  chatId?: string;
  agentUsed: string;
  priority: 'low' | 'medium' | 'high';
  startedAt?: Date;
  completedAt?: Date;
  executionTime?: number;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

// Agent Task Schema
const AgentTaskSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  type: { 
    type: String, 
    required: true, 
    enum: ['research', 'analysis', 'synthesis', 'chat'] 
  },
  query: { type: String, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending'
  },
  result: { type: Schema.Types.Mixed },
  error: { type: String },
  userId: { type: String, index: true },
  chatId: { type: String, index: true },
  agentUsed: { type: String, required: true },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high'], 
    default: 'medium' 
  },
  startedAt: { type: Date },
  completedAt: { type: Date },
  executionTime: { type: Number },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  metadata: { type: Schema.Types.Mixed }
}, {
  timestamps: true
});

// Add indexes for performance
AgentTaskSchema.index({ status: 1, priority: -1, createdAt: 1 });
AgentTaskSchema.index({ userId: 1, createdAt: -1 });
AgentTaskSchema.index({ type: 1, status: 1 });

export const AgentTask = mongoose.model<IAgentTask>('AgentTask', AgentTaskSchema);

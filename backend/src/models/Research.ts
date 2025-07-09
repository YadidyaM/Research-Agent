import mongoose, { Schema, Document } from 'mongoose';

// Interface for research results
export interface IResearchResult extends Document {
  id: string;
  query: string;
  findings: string[];
  sources: string[];
  synthesis: string;
  confidence: number;
  userId?: string;
  chatId?: string;
  agentUsed: string;
  executionTime?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

// Interface for research steps
export interface IResearchStep extends Document {
  id: string;
  researchId: string;
  step: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: Date;
  data?: any;
  error?: string;
}

// Research Result Schema
const ResearchResultSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  query: { type: String, required: true },
  findings: [{ type: String }],
  sources: [{ type: String }],
  synthesis: { type: String, required: true },
  confidence: { type: Number, min: 0, max: 1 },
  userId: { type: String, index: true },
  chatId: { type: String, index: true },
  agentUsed: { type: String, required: true },
  executionTime: { type: Number },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending'
  },
  metadata: { type: Schema.Types.Mixed }
}, {
  timestamps: true
});

// Research Step Schema
const ResearchStepSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  researchId: { type: String, required: true, index: true },
  step: { type: String, required: true },
  description: { type: String, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending'
  },
  timestamp: { type: Date, default: Date.now },
  data: { type: Schema.Types.Mixed },
  error: { type: String }
}, {
  timestamps: true
});

// Add indexes for performance
ResearchResultSchema.index({ query: 'text', synthesis: 'text' });
ResearchResultSchema.index({ userId: 1, createdAt: -1 });
ResearchResultSchema.index({ status: 1, createdAt: -1 });
ResearchStepSchema.index({ researchId: 1, timestamp: 1 });

export const ResearchResult = mongoose.model<IResearchResult>('ResearchResult', ResearchResultSchema);
export const ResearchStep = mongoose.model<IResearchStep>('ResearchStep', ResearchStepSchema);

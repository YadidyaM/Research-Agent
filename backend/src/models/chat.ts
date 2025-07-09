import mongoose, { Schema, Document } from 'mongoose';

// Interface for a single chat message
export interface IMessage extends Document {
  id: string;
  chatId: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  mode?: 'chat' | 'research';
  agentUsed?: string;
  executionTime?: number;
  metadata?: Record<string, any>;
}

// Interface for a chat conversation
export interface IChat extends Document {
  id: string;
  userId?: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  isActive: boolean;
  metadata?: Record<string, any>;
}

// Message Schema
const MessageSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  chatId: { type: String, required: true, index: true },
  type: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  mode: { type: String, enum: ['chat', 'research'] },
  agentUsed: { type: String },
  executionTime: { type: Number },
  metadata: { type: Schema.Types.Mixed }
}, {
  timestamps: true
});

// Chat Schema
const ChatSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, index: true },
  title: { type: String, required: true },
  messageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  metadata: { type: Schema.Types.Mixed }
}, {
  timestamps: true
});

// Add indexes for performance
MessageSchema.index({ chatId: 1, timestamp: -1 });
ChatSchema.index({ userId: 1, updatedAt: -1 });
ChatSchema.index({ createdAt: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
export const Chat = mongoose.model<IChat>('Chat', ChatSchema);

// Export all models from a single file
export { Chat, Message, IChat, IMessage } from './Chat';
export { ResearchResult, ResearchStep, IResearchResult, IResearchStep } from './Research';
export { User, IUser } from './User';
export { AgentTask, IAgentTask } from './AgentTask';

// Database connection helper
import mongoose from 'mongoose';

export const connectToDatabase = async (uri: string): Promise<void> => {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
};

export const disconnectFromDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error);
    throw error;
  }
};

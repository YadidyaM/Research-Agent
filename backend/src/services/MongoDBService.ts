import mongoose from 'mongoose';
import { config } from '../config';

export class MongoDBService {
  private static instance: MongoDBService;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): MongoDBService {
    if (!MongoDBService.instance) {
      MongoDBService.instance = new MongoDBService();
    }
    return MongoDBService.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('✅ Already connected to MongoDB');
      return;
    }

    try {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set');
      }

      // MongoDB connection options using your environment variables
      const options = {
        dbName: process.env.MONGODB_DB_NAME || 'ai_research_agent',
        connectTimeoutMS: parseInt(process.env.MONGODB_CONNECTION_TIMEOUT || '30000'),
        serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT || '5000'),
        maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
        minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '1'),
        maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME || '30000'),
        socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT || '30000'),
        heartbeatFrequencyMS: parseInt(process.env.MONGODB_HEARTBEAT_FREQUENCY || '10000'),
      };

      await mongoose.connect(mongoUri, options);
      this.isConnected = true;
      
      console.log('🎉 Connected to MongoDB Atlas successfully!');
      console.log(`📁 Database: ${options.dbName}`);
      
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('✅ Disconnected from MongoDB');
    } catch (error) {
      console.error('❌ MongoDB disconnection error:', error);
      throw error;
    }
  }

  public isMongoConnected(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  public getConnectionStatus(): string {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[mongoose.connection.readyState as keyof typeof states] || 'unknown';
  }
}
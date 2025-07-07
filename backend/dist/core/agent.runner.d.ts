export interface AgentTask {
    type: 'research' | 'analysis' | 'synthesis';
    query: string;
    options?: Record<string, any>;
    id?: string;
    status?: string;
    result?: any;
    error?: string;
    updatedAt?: Date;
}
export interface ResearchContext {
    query: string;
    findings: string[];
    sources: string[];
    synthesis: string;
    confidence: number;
}
export declare class AgentRunner {
    private llmService;
    private memoryStore;
    private tools;
    private currentTask;
    private executionSteps;
    private webSearchTool;
    private scraperTool;
    constructor();
    executeTask(task: AgentTask): Promise<ResearchContext>;
    private executeResearchTask;
    private executeAnalysisTask;
    private executeSynthesisTask;
    private addExecutionStep;
    createTask(type: 'research' | 'analysis' | 'synthesis', query: string): Promise<AgentTask>;
    getTaskStatus(taskId: string): Promise<AgentTask | null>;
    cancelTask(taskId: string): Promise<boolean>;
    getAvailableTools(): string[];
    getToolCapabilities(toolName: string): Promise<any>;
    health(): Promise<{
        status: string;
        tools: Record<string, boolean>;
        memory: boolean;
    }>;
}
//# sourceMappingURL=agent.runner.d.ts.map
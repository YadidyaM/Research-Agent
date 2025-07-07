export interface SimpleAgentTask {
    type: 'research' | 'analysis' | 'synthesis';
    query: string;
    options?: Record<string, any>;
}
export interface SimpleResearchContext {
    query: string;
    findings: string[];
    sources: string[];
    synthesis: string;
    confidence: number;
    steps: ResearchStep[];
}
export interface ResearchStep {
    id: string;
    step: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    description: string;
    data?: any;
    timestamp: Date;
}
export declare class SimpleAgentRunner {
    private llmService;
    private webSearchTool;
    private scraperTool;
    private progressCallback?;
    constructor();
    setProgressCallback(callback: (step: ResearchStep) => void): void;
    private emitStep;
    executeTask(task: SimpleAgentTask): Promise<SimpleResearchContext>;
    private executeResearchTask;
}
//# sourceMappingURL=simple-agent.runner.d.ts.map
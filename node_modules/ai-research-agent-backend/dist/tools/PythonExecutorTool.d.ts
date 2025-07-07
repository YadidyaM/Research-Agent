import { Tool, PythonExecutionResult } from '../types';
export declare class PythonExecutorTool implements Tool {
    name: string;
    description: string;
    private sandboxed;
    private timeout;
    private endpoint;
    constructor(options?: {
        sandboxed?: boolean;
        timeout?: number;
        endpoint?: string;
    });
    execute(input: {
        code: string;
        packages?: string[];
        inputs?: Record<string, any>;
    }): Promise<PythonExecutionResult>;
    private executeSandboxed;
    private executeLocal;
    private validateCode;
    executeDataAnalysis(data: any[], analysisType: string): Promise<PythonExecutionResult>;
    private generateAnalysisCode;
    executeMathCalculation(expression: string, variables?: Record<string, number>): Promise<PythonExecutionResult>;
    generateChart(data: any[], chartType: string, options?: Record<string, any>): Promise<PythonExecutionResult>;
    validatePythonSyntax(code: string): Promise<boolean>;
    getCapabilities(): {
        sandboxed: boolean;
        supportsPackages: boolean;
        supportsDataAnalysis: boolean;
        supportsVisualization: boolean;
        maxExecutionTime: number;
    };
    health(): Promise<boolean>;
}
//# sourceMappingURL=PythonExecutorTool.d.ts.map
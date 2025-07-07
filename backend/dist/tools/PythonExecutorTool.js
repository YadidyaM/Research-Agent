"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonExecutorTool = void 0;
const axios_1 = __importDefault(require("axios"));
class PythonExecutorTool {
    constructor(options = {}) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'python_executor'
        });
        Object.defineProperty(this, "description", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Execute Python code safely in a sandboxed environment for data analysis and computations'
        });
        Object.defineProperty(this, "sandboxed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "endpoint", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.sandboxed = options.sandboxed || true;
        this.timeout = options.timeout || 30000;
        this.endpoint = options.endpoint;
    }
    async execute(input) {
        const { code, packages = [], inputs = {} } = input;
        try {
            if (!this.validateCode(code)) {
                throw new Error('Code validation failed: Potentially unsafe code detected');
            }
            const startTime = Date.now();
            let result;
            if (this.sandboxed && this.endpoint) {
                result = await this.executeSandboxed(code, packages, inputs);
            }
            else {
                result = await this.executeLocal(code, packages, inputs);
            }
            result.executionTime = Date.now() - startTime;
            return result;
        }
        catch (error) {
            console.error('Python execution error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown execution error',
                executionTime: Date.now() - Date.now(),
            };
        }
    }
    async executeSandboxed(code, packages, inputs) {
        if (!this.endpoint) {
            throw new Error('Sandbox endpoint not configured');
        }
        try {
            const response = await axios_1.default.post(`${this.endpoint}/execute`, {
                code,
                packages,
                inputs,
                timeout: this.timeout / 1000,
            }, {
                timeout: this.timeout + 5000,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            return {
                success: response.data.success,
                output: response.data.output,
                error: response.data.error,
                executionTime: response.data.execution_time || 0,
            };
        }
        catch (error) {
            console.error('Sandboxed execution error:', error);
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Sandbox API error: ${error.response?.data?.error || error.message}`);
            }
            throw error;
        }
    }
    async executeLocal(code, packages, inputs) {
        console.warn('WARNING: Executing Python code locally without sandboxing. This is unsafe for production!');
        try {
            const mockOutput = `
# Code execution simulation (local mode)
# Input code:
${code}

# Required packages: ${packages.join(', ')}
# Inputs: ${JSON.stringify(inputs)}

# Note: This is a mock execution for development purposes.
# In production, use a proper sandboxed Python executor.
      `;
            return {
                success: true,
                output: mockOutput.trim(),
                executionTime: Math.random() * 1000,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Local execution failed',
                executionTime: 0,
            };
        }
    }
    validateCode(code) {
        const dangerousPatterns = [
            /import\s+os/i,
            /import\s+subprocess/i,
            /import\s+sys/i,
            /exec\s*\(/i,
            /eval\s*\(/i,
            /__import__/i,
            /open\s*\(/i,
            /file\s*\(/i,
            /input\s*\(/i,
            /raw_input\s*\(/i,
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(code)) {
                console.warn(`Dangerous pattern detected: ${pattern}`);
                return false;
            }
        }
        if (code.length > 10000) {
            console.warn('Code too long');
            return false;
        }
        return true;
    }
    async executeDataAnalysis(data, analysisType) {
        const code = this.generateAnalysisCode(data, analysisType);
        return await this.execute({
            code,
            packages: ['pandas', 'numpy', 'matplotlib', 'seaborn'],
            inputs: { data },
        });
    }
    generateAnalysisCode(data, analysisType) {
        switch (analysisType) {
            case 'descriptive_stats':
                return `
import pandas as pd
import numpy as np

# Convert data to DataFrame
df = pd.DataFrame(data)

# Calculate descriptive statistics
print("=== Descriptive Statistics ===")
print(df.describe())
print("\\n=== Data Types ===")
print(df.dtypes)
print("\\n=== Missing Values ===")
print(df.isnull().sum())
        `;
            case 'correlation':
                return `
import pandas as pd
import numpy as np

# Convert data to DataFrame
df = pd.DataFrame(data)

# Calculate correlation matrix for numeric columns
numeric_df = df.select_dtypes(include=[np.number])
if not numeric_df.empty:
    print("=== Correlation Matrix ===")
    print(numeric_df.corr())
else:
    print("No numeric columns found for correlation analysis")
        `;
            case 'summary':
                return `
import pandas as pd
import numpy as np

# Convert data to DataFrame
df = pd.DataFrame(data)

print(f"Dataset shape: {df.shape}")
print(f"Number of rows: {df.shape[0]}")
print(f"Number of columns: {df.shape[1]}")
print("\\nColumn names:", list(df.columns))
print("\\nFirst 5 rows:")
print(df.head())
        `;
            default:
                return `
import pandas as pd
import numpy as np

# Convert data to DataFrame
df = pd.DataFrame(data)
print("Data loaded successfully")
print(f"Shape: {df.shape}")
print(df.head())
        `;
        }
    }
    async executeMathCalculation(expression, variables = {}) {
        const variableAssignments = Object.entries(variables)
            .map(([name, value]) => `${name} = ${value}`)
            .join('\n');
        const code = `
import math
import numpy as np

# Variable assignments
${variableAssignments}

# Calculate expression
try:
    result = ${expression}
    print(f"Result: {result}")
    print(f"Type: {type(result)}")
except Exception as e:
    print(f"Error: {e}")
    `;
        return await this.execute({
            code,
            packages: ['numpy'],
            inputs: variables,
        });
    }
    async generateChart(data, chartType, options = {}) {
        const code = `
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import base64
import io

# Convert data to DataFrame
df = pd.DataFrame(data)

# Create figure
plt.figure(figsize=(10, 6))

# Generate chart based on type
chart_type = "${chartType}"

if chart_type == "bar":
    if "x" in df.columns and "y" in df.columns:
        plt.bar(df["x"], df["y"])
        plt.xlabel("X")
        plt.ylabel("Y")
    else:
        print("Error: Bar chart requires 'x' and 'y' columns")

elif chart_type == "line":
    if "x" in df.columns and "y" in df.columns:
        plt.plot(df["x"], df["y"])
        plt.xlabel("X")
        plt.ylabel("Y")
    else:
        print("Error: Line chart requires 'x' and 'y' columns")

elif chart_type == "histogram":
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) > 0:
        plt.hist(df[numeric_cols[0]], bins=20)
        plt.xlabel(numeric_cols[0])
        plt.ylabel("Frequency")
    else:
        print("Error: Histogram requires numeric data")

else:
    print(f"Unsupported chart type: {chart_type}")

plt.title("${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart")
plt.grid(True, alpha=0.3)

# Save chart to base64
buffer = io.BytesIO()
plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
buffer.seek(0)
chart_base64 = base64.b64encode(buffer.read()).decode()
plt.close()

print(f"Chart generated successfully")
print(f"Chart data (base64): {chart_base64[:100]}...")
    `;
        return await this.execute({
            code,
            packages: ['matplotlib', 'pandas', 'numpy'],
            inputs: { data, options },
        });
    }
    async validatePythonSyntax(code) {
        const syntaxCheckCode = `
import ast
import sys

code_to_check = """${code.replace(/"/g, '\\"')}"""

try:
    ast.parse(code_to_check)
    print("Syntax is valid")
    result = True
except SyntaxError as e:
    print(f"Syntax error: {e}")
    result = False
except Exception as e:
    print(f"Error: {e}")
    result = False

print(f"Validation result: {result}")
    `;
        try {
            const result = await this.execute({
                code: syntaxCheckCode,
                packages: [],
            });
            return result.success && result.output?.includes('Validation result: True') || false;
        }
        catch {
            return false;
        }
    }
    getCapabilities() {
        return {
            sandboxed: this.sandboxed,
            supportsPackages: true,
            supportsDataAnalysis: true,
            supportsVisualization: true,
            maxExecutionTime: this.timeout,
        };
    }
    async health() {
        try {
            const result = await this.execute({
                code: 'print("Health check successful")',
            });
            return result.success;
        }
        catch {
            return false;
        }
    }
}
exports.PythonExecutorTool = PythonExecutorTool;
//# sourceMappingURL=PythonExecutorTool.js.map
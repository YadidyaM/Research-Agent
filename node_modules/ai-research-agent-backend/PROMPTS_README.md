# AI Research Agent - Prompt System Documentation

## Overview

The AI Research Agent uses a sophisticated prompt system to control how the AI behaves in different modes. This system allows you to customize the AI's personality, expertise, and response style to match your specific needs.

## Prompt System Architecture

### Core Files

1. **`src/config/prompts.ts`** - Main prompt templates and configurations
2. **`src/config/custom-prompts.ts`** - User-customizable prompts and personality settings
3. **`src/services/llm.service.ts`** - LLM service that uses the prompts

### Prompt Types

#### 1. Basic Chat Mode
- **Purpose**: Handle general conversations and questions
- **Personality**: Friendly, helpful, conversational
- **Use Case**: Quick answers, explanations, general assistance

#### 2. Research Mode
- **Purpose**: Conduct thorough research with web search and analysis
- **Personality**: Methodical, analytical, thorough
- **Use Case**: In-depth research, fact-finding, comprehensive analysis

## How to Customize Prompts

### Basic Customization

1. **Edit Personality**: Modify `CUSTOM_PROMPTS.BASIC_CHAT_PERSONALITY` in `custom-prompts.ts`
2. **Adjust Research Style**: Change `CUSTOM_PROMPTS.RESEARCH_ASSISTANT_STYLE`
3. **Modify Analysis Approach**: Update `CUSTOM_PROMPTS.CONTENT_ANALYSIS_APPROACH`

### Advanced Customization

1. **Create New Prompt Combinations**: Add entries to `PROMPT_COMBINATIONS`
2. **Add Domain Expertise**: Extend `DOMAIN_EXPERTISE` with your field
3. **Adjust Response Settings**: Modify temperature and token limits in `PROMPT_CONFIG`

### Example Customizations

#### Technical Expert Mode
```typescript
TECHNICAL_RESEARCHER: {
  personality: CUSTOM_PROMPTS.RESEARCH_ASSISTANT_STYLE,
  tone: PROMPT_CUSTOMIZATION.TONE_MODIFIERS.TECHNICAL,
  length: PROMPT_CUSTOMIZATION.LENGTH_PREFERENCES.DETAILED,
  domain: PROMPT_CUSTOMIZATION.DOMAIN_EXPERTISE.TECHNOLOGY
}
```

#### Business Analyst Mode
```typescript
BUSINESS_ANALYST: {
  personality: CUSTOM_PROMPTS.RESEARCH_ASSISTANT_STYLE,
  tone: PROMPT_CUSTOMIZATION.TONE_MODIFIERS.PROFESSIONAL,
  length: PROMPT_CUSTOMIZATION.LENGTH_PREFERENCES.BALANCED,
  domain: PROMPT_CUSTOMIZATION.DOMAIN_EXPERTISE.BUSINESS
}
```

## Prompt Configuration Settings

### Temperature Settings
- **CREATIVE** (0.8): For creative writing, brainstorming
- **BALANCED** (0.7): For general chat, explanations
- **ANALYTICAL** (0.3): For research, analysis, factual tasks
- **PRECISE** (0.1): For evaluation, classification tasks

### Token Limits
- **SHORT** (200): Brief responses
- **MEDIUM** (500): Standard responses
- **LONG** (1000): Detailed explanations
- **SYNTHESIS** (1500): Research synthesis

## System Prompts in Detail

### 1. Basic Chat Assistant
```
You are a helpful, knowledgeable, and friendly AI assistant...
```
- **Purpose**: General conversation and assistance
- **Temperature**: 0.7 (balanced)
- **Max Tokens**: 800

### 2. Research Planner
```
You are an expert research assistant AI with a methodical approach...
```
- **Purpose**: Create structured research plans
- **Temperature**: 0.3 (analytical)
- **Max Tokens**: 800

### 3. Content Relevance Evaluator
```
You are a content relevance analyzer...
```
- **Purpose**: Determine if content is relevant to research query
- **Temperature**: 0.1 (precise)
- **Max Tokens**: 10

### 4. Key Points Extractor
```
You are an expert at extracting key information...
```
- **Purpose**: Extract important points from content
- **Temperature**: 0.3 (analytical)
- **Max Tokens**: 500

### 5. Research Synthesizer
```
You are a research synthesis expert...
```
- **Purpose**: Combine findings into coherent summary
- **Temperature**: 0.4 (slightly creative)
- **Max Tokens**: 1500

## Best Practices for Prompt Engineering

### 1. Be Specific
- Clearly define the AI's role and expertise
- Specify the desired output format
- Include evaluation criteria

### 2. Provide Context
- Explain the purpose of the task
- Give examples when helpful
- Set expectations for response quality

### 3. Balance Creativity and Precision
- Use higher temperature for creative tasks
- Use lower temperature for factual, analytical tasks
- Adjust based on the type of response needed

### 4. Test and Iterate
- Test prompts with various inputs
- Monitor response quality
- Adjust based on real-world usage

## Troubleshooting Common Issues

### Issue: AI responses are too verbose
**Solution**: 
- Reduce max tokens
- Add "be concise" to the prompt
- Use BRIEF length preference

### Issue: AI responses lack depth
**Solution**:
- Increase max tokens
- Add "provide detailed explanations" to prompt
- Use DETAILED length preference

### Issue: AI responses are off-topic
**Solution**:
- Make prompts more specific
- Add clear task definitions
- Include examples of desired output

### Issue: Inconsistent response quality
**Solution**:
- Lower temperature for more consistent responses
- Add more specific guidelines to prompts
- Include quality criteria in prompts

## Making Changes

1. **Edit the prompt files**: Modify `custom-prompts.ts` for personality changes
2. **Restart the backend**: Changes require server restart
3. **Test thoroughly**: Try various queries to ensure expected behavior
4. **Monitor and adjust**: Fine-tune based on actual usage

## Advanced Features

### Search Query Optimization
The system can optimize search queries for better web search results:
```typescript
await llmService.optimizeSearchQuery("climate change effects");
```

### Source Credibility Evaluation
Evaluate the credibility of information sources:
```typescript
await llmService.evaluateSourceCredibility(url, title, content);
```

## Contributing

When adding new prompts or modifying existing ones:

1. Follow the existing structure and naming conventions
2. Include clear documentation for new prompt types
3. Add appropriate temperature and token settings
4. Test with various inputs before committing changes
5. Update this documentation when adding new features

## Support

For questions about the prompt system or customization help:
1. Check this documentation first
2. Review the example configurations
3. Test changes in a development environment
4. Consider the specific use case and requirements

Remember: The key to effective prompts is being specific about what you want while leaving room for the AI to be helpful and creative within those boundaries. 
# Deployment Guide: Heroku + Netlify

This guide will help you deploy the Research Agent backend to Heroku and frontend to Netlify.

## Backend Deployment to Heroku

### Prerequisites
- Heroku CLI installed
- Git repository initialized
- Heroku account

### Step 1: Create Heroku App
```bash
cd Research-Agent/backend
heroku create your-research-agent-backend
```

### Step 2: Set Environment Variables
Use the template in `heroku.env.template` to set your Heroku config vars:

```bash
# Required LLM API Key (choose one)
heroku config:set DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Required Web Search API Key
heroku config:set TAVILY_API_KEY=your_tavily_api_key_here

# Required Embedding API Key
heroku config:set HUGGINGFACE_API_KEY=your_huggingface_api_key_here

# Optional: Vector Database (if using external Chroma)
heroku config:set CHROMA_ENDPOINT=your_chroma_endpoint

# Optional: Additional APIs
heroku config:set NASA_API_KEY=your_nasa_api_key_here
heroku config:set SERP_API_KEY=your_serp_api_key_here
```

### Step 3: Deploy to Heroku
```bash
git add .
git commit -m "Configure for Heroku deployment"
git push heroku main
```

### Step 4: Get Your Backend URL
After deployment, your backend will be available at:
`https://your-research-agent-backend.herokuapp.com`

## Frontend Deployment to Netlify

### Step 1: Prepare Frontend for Deployment
The frontend has been configured to use the Heroku backend URL:
- API configuration created in `src/config/api.ts`
- Environment variables configured in `netlify.toml`
- Proxy removed from `package.json`

### Step 2: Deploy to Netlify

#### Option A: GitHub Integration (Recommended)
1. Push your code to GitHub
2. Go to [Netlify Dashboard](https://app.netlify.com)
3. Click "New site from Git"
4. Connect your GitHub repository
5. Select the `Research-Agent/frontend` folder
6. Netlify will automatically use the `netlify.toml` configuration
7. Deploy!

#### Option B: Manual Deploy
```bash
cd Research-Agent/frontend
npm run build
# Upload the 'build' folder to Netlify manually
```

### Step 3: Update CORS Settings
After deployment, get your Netlify URL (e.g., `https://your-app-name.netlify.app`) and update the backend CORS:

```bash
cd Research-Agent/backend
heroku config:set CORS_ORIGIN=https://your-app-name.netlify.app
```

## Environment Variables Reference

### Required Variables
- `DEEPSEEK_API_KEY` or `OPENAI_API_KEY` - LLM provider API key
- `TAVILY_API_KEY` - Web search API key
- `HUGGINGFACE_API_KEY` - Embedding provider API key

### Optional Variables
- `CHROMA_ENDPOINT` - External vector database endpoint
- `NASA_API_KEY` - NASA API access
- `SERP_API_KEY` - Alternative search provider

## Troubleshooting

### Build Failures
- Ensure TypeScript is in dependencies, not devDependencies
- Check that all required environment variables are set

### CORS Errors
- Make sure CORS_ORIGIN matches your Netlify URL exactly
- Include https:// in the URL

### API Errors
- Verify all API keys are correctly set in Heroku config vars
- Check that your chosen LLM provider is properly configured 
# AI Research Agent

This project implements a research agent that combines Ollama's local LLM capabilities with HuggingFace's API for advanced AI research tasks.

## 👥 Developers

**Developed by:**

- **Yadidya Medepalli**
  - LinkedIn: [@yadidya-medepalli](https://www.linkedin.com/in/yadidya-medepalli/)
  - GitHub: [@YadidyaM](https://github.com/YadidyaM)

- **Monia Jayakumar**
  - LinkedIn: [@monicajayakumar](https://www.linkedin.com/in/monicajayakumar/)
  - GitHub: [@Monica2403](https://github.com/Monica2403)

## Setup Instructions

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment variables:
   - Copy `env.template` to `.env`
   - Add your HuggingFace API key to `.env`
   - The Ollama host is pre-configured to `http://localhost:11434`

3. Verify Ollama installation:
```bash
ollama list
```

4. Run the test script:
```bash
python research_agent.py
```

## Project Structure

- `research_agent.py`: Main agent implementation
- `requirements.txt`: Python dependencies
- `env.template`: Template for environment variables

## Features

- Local LLM integration via Ollama
- HuggingFace API integration
- Connection testing utilities
- Extensible agent architecture 
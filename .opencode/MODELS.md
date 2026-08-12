# OliCode Model Strategy

## Recommended Models by Task

### Heavy coding / complex refactors
- `claude-opus-4-7` (best reasoning, highest quality)
- `openai/gpt-5.4` (strong alternative)

### Standard coding (daily driver)
- `claude-sonnet-4-6` — best balance of speed and quality
- `openai/gpt-5.4-mini` — faster, cheaper for routine tasks

### Debugging
- `claude-sonnet-4-6` — excellent at tracing errors
- `openai/o3-mini` — strong reasoning for logic bugs

### UI/Design work
- `claude-sonnet-4-6` — good visual reasoning
- `google/gemini-2.5-pro` — strong for visual/design tasks

### Research / long context
- `google/gemini-2.5-pro` — 1M token context window
- `claude-opus-4-7` — 200K context, excellent synthesis

### Local / offline / cheap
- `ollama/qwen2.5-coder:32b` — best local coding model
- `ollama/deepseek-coder-v2:latest` — strong, fast locally
- `lmstudio/mistral-small` — lightweight general purpose

## Provider Setup

### Anthropic (Claude) — Recommended primary
```
olicode providers add anthropic
```

### OpenAI (GPT)
```
olicode providers add openai
```

### Google (Gemini)
```
olicode providers add google
```

### OpenRouter (all providers via one key)
```
olicode providers add openrouter
```

### Ollama (local, free)
```
# Install Ollama first: https://ollama.ai
ollama pull qwen2.5-coder:32b
# OliCode auto-detects Ollama at localhost:11434
```

## Agent Model Assignments (default)
| Agent | Model | Reason |
|---|---|---|
| Planner | claude-opus-4-7 | Best strategic reasoning |
| Research | claude-sonnet-4-6 | Fast, good synthesis |
| Builder | claude-sonnet-4-6 | Daily coding workhorse |
| UX | claude-sonnet-4-6 | Good visual/component work |
| QA | claude-sonnet-4-6 | Reliable test generation |
| Deploy | claude-sonnet-4-6 | Careful, precise |
| Refactor | claude-sonnet-4-6 | Understands code structure |
| Docs | claude-sonnet-4-6 | Clear writing |

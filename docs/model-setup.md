# Understudy Model Setup

The brain procedure can run in four modes.

## OpenAI

Set an API key before starting the server:

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:PORT="3003"
npm start
```

The procedure will use the hosted model in `brain/config.json`.

## Ollama

Install Ollama, pull the configured model, and start the server:

```powershell
ollama pull llama3.2:3b
$env:PORT="3003"
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
npm start
```

The procedure will use the local model in `brain/config.json`.

The current research recommendation for a stronger local run is Qwen3 13B:

```powershell
ollama pull qwen3:13b
$env:PORT="3003"
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
npm start
```

Then set `brain/config.json`:

```json
{
  "provider": "ollama",
  "ollama": {
    "baseUrl": "http://127.0.0.1:11434",
    "model": "qwen3:13b",
    "criticModel": "qwen3:13b"
  }
}
```

## Hybrid

Use this for the recommended early production pattern: local Ollama for routine work, hosted reasoning for complex decisions, and critic review as the judge layer.

```json
{
  "provider": "hybrid",
  "model": "gpt-4o-mini",
  "criticModel": "gpt-4o-mini",
  "ollama": {
    "baseUrl": "http://127.0.0.1:11434",
    "model": "qwen3:13b",
    "criticModel": "qwen3:13b"
  }
}
```

Set `OPENAI_API_KEY` to enable hosted routing. Without it, hybrid mode falls back to Ollama.

Hybrid routing computes a local decision type and confidence score for each model call. It routes to the hosted model when:

- `decisionType` is `strategic`
- confidence is below `0.75`

Otherwise it stays on Ollama. Each routing decision is logged to `brain/state/routing-decisions.json` with role, provider, model, decision type, confidence, reason, and matched signals.

## vLLM / OpenAI-Compatible

Use this for production self-hosting after the local loop is useful. vLLM exposes an OpenAI-compatible chat completions API, so the brain can point at it without changing the procedure code.

Recommended path from the current research:

- Local development: Ollama with the small configured model.
- Production serving: vLLM with prefix caching enabled.
- First target model: Qwen3 32B for general reasoning and tool-use quality.
- Later deliberate model: QwQ-32B for slower multi-step decisions.

Set `brain/config.json` to use the `vllm` provider:

```json
{
  "provider": "vllm",
  "vllm": {
    "baseUrl": "http://127.0.0.1:8000/v1",
    "model": "Qwen/Qwen3-32B",
    "criticModel": "Qwen/Qwen3-32B"
  }
}
```

Or configure it through environment variables:

```powershell
$env:VLLM_BASE_URL="http://127.0.0.1:8000/v1"
$env:VLLM_MODEL="Qwen/Qwen3-32B"
$env:VLLM_CRITIC_MODEL="Qwen/Qwen3-32B"
$env:PORT="3003"
npm start
```

If your vLLM server requires a bearer token, set `VLLM_API_KEY`.

## Fallback

If no OpenAI key is present and Ollama is not available, the site still answers through the built-in local fallback procedure. That keeps the State Log active, but it is not deep model reasoning.

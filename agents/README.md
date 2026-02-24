# Deep Agents Service

## Run

```bash
python3 -m venv venv
source venv/bin/activate
python3 -m pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload
```

## Required environment variables

- `AGENTS_API_TOKEN`
- `AGENTS_DATABASE_URL_READONLY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`

## Optional environment variables

- `AGENTS_MODEL_TEMPERATURE` (default: `0.1`)
- `TAVILY_API_KEY`
- `ENABLE_MARKET_SIGNAL_TOOL` (`true`/`false`, default: `false`)

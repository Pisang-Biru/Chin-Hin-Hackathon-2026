from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from starlette.responses import JSONResponse

from .graph import apply_step_decision, get_graph_session, initialize_deep_agent, start_graph_session
from .models import SessionEnvelope, StartSessionRequest, StepDecisionRequest
from .settings import Settings, load_settings

settings: Settings = load_settings()
initialize_deep_agent(settings)

app = FastAPI(title="Deep Agents Service", version="1.0.0")


@app.middleware("http")
async def require_service_token(request: Request, call_next):
    if request.url.path == "/healthz":
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    expected = f"Bearer {settings.agents_api_token}"
    if auth_header != expected:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    return await call_next(request)


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/v1/sessions/start", response_model=SessionEnvelope)
def start_session(payload: StartSessionRequest) -> SessionEnvelope:
    return start_graph_session(payload, settings)


@app.post("/v1/sessions/{session_id}/steps/{step_id}/decision", response_model=SessionEnvelope)
def apply_session_step_decision(
    session_id: str,
    step_id: str,
    payload: StepDecisionRequest,
) -> SessionEnvelope:
    try:
        return apply_step_decision(session_id, step_id, payload, settings)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/v1/sessions/{session_id}", response_model=SessionEnvelope)
def get_session(session_id: str) -> SessionEnvelope:
    try:
        return get_graph_session(session_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

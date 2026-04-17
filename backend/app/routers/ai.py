"""AI router — week 1 only exposes /ping to prove LLM integration."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import llm_client
from app.services.llm_client import LLMError

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


class PingRequest(BaseModel):
    prompt: str = Field(
        default="Say hello to Jeevan in one short sentence.",
        description="Prompt to send to the model.",
    )
    purpose: str = Field(default="chat", description="chat | categorize | embed")


class PingResponse(BaseModel):
    model: str
    response: str


@router.post("/ping", response_model=PingResponse)
async def ping(req: PingRequest):
    try:
        text = await llm_client.generate(req.prompt, purpose=req.purpose)
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return PingResponse(model=req.purpose, response=text)

"""Claude adapter for the LlmGateway port (Anthropic Messages API)."""
from __future__ import annotations

import json
import os
from pathlib import Path

import anthropic

from app.application.ports import LlmError

# Lets the API re-run a request on a fallback model if the primary declines it.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicLlmGateway:
    def __init__(self, model: str = "claude-opus-5-5", effort: str = "medium") -> None:
        self._model = model
        self._effort = effort
        self._client: anthropic.AsyncAnthropic | None = None

    def describe(self) -> dict:
        configured = bool(
            os.environ.get("ANTHROPIC_API_KEY")
            or os.environ.get("ANTHROPIC_AUTH_TOKEN")
            or (Path.home() / ".config" / "anthropic").exists()
        )
        return {"provider": "anthropic", "model": self._model, "configured": configured}

    async def generate_text(self, system: str, prompt: str) -> str:
        return await self._call(system, prompt, max_tokens=32000)

    async def generate_structured(self, system: str, prompt: str, schema: dict) -> dict:
        text = await self._call(system, prompt, max_tokens=16000, schema=schema)
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise LlmError("O modelo devolveu uma resposta estruturada inválida.") from exc

    async def _call(self, system: str, prompt: str, max_tokens: int, schema: dict | None = None) -> str:
        output_config: dict = {"effort": self._effort}
        if schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        try:
            if self._client is None:
                self._client = anthropic.AsyncAnthropic()
            async with self._client.beta.messages.stream(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}],
                output_config=output_config,
                betas=[_FALLBACK_BETA],
                fallbacks="default",
            ) as stream:
                message = await stream.get_final_message()
        except anthropic.AuthenticationError as exc:
            raise LlmError("Credencial da API do Claude inválida. Confira a ANTHROPIC_API_KEY.") from exc
        except anthropic.PermissionDeniedError as exc:
            raise LlmError("A credencial da API do Claude não tem permissão para este modelo.") from exc
        except anthropic.NotFoundError as exc:
            raise LlmError(f"Modelo '{self._model}' não encontrado na API do Claude.") from exc
        except anthropic.RateLimitError as exc:
            raise LlmError("Limite de uso da API do Claude atingido. Tente novamente em instantes.") from exc
        except anthropic.APIStatusError as exc:
            raise LlmError(f"A API do Claude respondeu com erro {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise LlmError("Não foi possível conectar à API do Claude.") from exc
        except (anthropic.AnthropicError, TypeError) as exc:
            # The SDK raises before any request when no credential can be resolved.
            raise LlmError(
                "API do Claude não configurada. Defina ANTHROPIC_API_KEY no ambiente do servidor."
            ) from exc

        if message.stop_reason == "refusal":
            raise LlmError("O modelo recusou este pedido. Revise o briefing e tente novamente.")
        if message.stop_reason == "max_tokens":
            raise LlmError("A resposta ficou longa demais e foi cortada. Divida a tarefa em partes menores.")
        text = "".join(block.text for block in message.content if block.type == "text").strip()
        if not text:
            raise LlmError("O modelo não devolveu conteúdo.")
        return text

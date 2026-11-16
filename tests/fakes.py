"""Scripted LLM used by the tests: plays the Head, the team and the CoS without calling any API."""
from __future__ import annotations


class FakeLlm:
    def __init__(self, verdicts: list[bool] | None = None, fail_with: Exception | None = None) -> None:
        self.verdicts = list(verdicts or [True])
        self.fail_with = fail_with
        self.calls: list[tuple[str, str]] = []

    def describe(self) -> dict:
        return {"provider": "fake", "model": "fake", "configured": True}

    async def generate_text(self, system: str, prompt: str) -> str:
        self.calls.append((system, prompt))
        if self.fail_with:
            raise self.fail_with
        return f"entrega v{sum(1 for s, _ in self.calls if 'Head da área' in s)}"

    async def generate_structured(self, system: str, prompt: str, schema: dict) -> dict:
        self.calls.append((system, prompt))
        if self.fail_with:
            raise self.fail_with
        if "assignments" in schema["properties"]:
            ids = [line.split("agent_id: ")[1].split(" |")[0] for line in prompt.splitlines() if "agent_id: " in line]
            return {"assignments": [{"agent_id": i, "instruction": "faça a sua parte"} for i in ids]}
        ok = self.verdicts.pop(0) if self.verdicts else True
        return {
            "criteria": [{"criterion": "padrão", "passed": ok, "comment": "ok" if ok else "faltou"}],
            "approved": ok,
            "summary": "aprovado" if ok else "não cumpre o padrão",
            "required_changes": [] if ok else ["corrigir"],
        }

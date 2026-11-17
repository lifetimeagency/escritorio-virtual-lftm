"""SQLite adapter for OfficeRepository. Entities are stored as JSON documents."""
from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from pathlib import Path

from app.domain.errors import NotFound
from app.domain.models import AREA_COUNT, Agent, Area, Publication, QualitySettings, Task


class SqliteOfficeRepository:
    def __init__(self, path: str) -> None:
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, "
            "PRIMARY KEY (kind, id))"
        )
        for area_id in range(1, AREA_COUNT + 1):
            self._db.execute(
                "INSERT OR IGNORE INTO docs VALUES ('area', ?, ?)",
                (str(area_id), json.dumps(asdict(Area(area_id)))),
            )

    # ---- areas ---------------------------------------------------------
    def list_areas(self) -> list[Area]:
        return sorted((Area(**d) for d in self._all("area")), key=lambda a: a.id)

    def get_area(self, area_id: int) -> Area:
        return Area(**self._get("area", str(area_id), "Área não encontrada."))

    def save_area(self, area: Area) -> None:
        self._put("area", str(area.id), asdict(area))

    # ---- agents --------------------------------------------------------
    def list_agents(self) -> list[Agent]:
        return [Agent.from_dict(d) for d in self._all("agent")]

    def get_agent(self, agent_id: str) -> Agent:
        return Agent.from_dict(self._get("agent", agent_id, "Agente não encontrado."))

    def save_agent(self, agent: Agent) -> None:
        self._put("agent", agent.id, asdict(agent))

    def delete_agent(self, agent_id: str) -> None:
        self._db.execute("DELETE FROM docs WHERE kind = 'agent' AND id = ?", (agent_id,))

    # ---- tasks ---------------------------------------------------------
    def list_tasks(self) -> list[Task]:
        return [Task.from_dict(d) for d in self._all("task")]

    def get_task(self, task_id: str) -> Task:
        return Task.from_dict(self._get("task", task_id, "Tarefa não encontrada."))

    def save_task(self, task: Task) -> None:
        self._put("task", task.id, task.to_dict())

    # ---- publications --------------------------------------------------
    def list_publications(self) -> list[Publication]:
        return [Publication.from_dict(d) for d in self._all("publication")]

    def get_publication(self, publication_id: str) -> Publication:
        return Publication.from_dict(self._get("publication", publication_id, "Publicação não encontrada."))

    def save_publication(self, publication: Publication) -> None:
        self._put("publication", publication.id, publication.to_dict())

    # ---- settings ------------------------------------------------------
    def get_settings(self) -> QualitySettings:
        row = self._db.execute("SELECT data FROM docs WHERE kind = 'settings' AND id = 'quality'").fetchone()
        return QualitySettings(**json.loads(row[0])) if row else QualitySettings.default()

    def save_settings(self, settings: QualitySettings) -> None:
        self._put("settings", "quality", asdict(settings))

    # ---- helpers -------------------------------------------------------
    def _all(self, kind: str) -> list[dict]:
        rows = self._db.execute("SELECT data FROM docs WHERE kind = ?", (kind,)).fetchall()
        return [json.loads(r[0]) for r in rows]

    def _get(self, kind: str, doc_id: str, missing: str) -> dict:
        row = self._db.execute("SELECT data FROM docs WHERE kind = ? AND id = ?", (kind, doc_id)).fetchone()
        if row is None:
            raise NotFound(missing)
        return json.loads(row[0])

    def _put(self, kind: str, doc_id: str, data: dict) -> None:
        self._db.execute(
            "INSERT INTO docs VALUES (?, ?, ?) ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data",
            (kind, doc_id, json.dumps(data, ensure_ascii=False)),
        )

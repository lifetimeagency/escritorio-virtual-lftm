import time

from fastapi.testclient import TestClient

from app.api.main import create_app
from app.infrastructure.sqlite_repository import SqliteOfficeRepository

from .fakes import FakeLlm


def test_full_flow_over_http():
    app = create_app(SqliteOfficeRepository(":memory:"), FakeLlm([False, True]))
    with TestClient(app) as client:
        assert client.put("/api/areas/1", json={"name": "Social", "head_name": "Ana"}).status_code == 200
        hired = client.post("/api/agents", json={"area_id": 1, "seat": 2, "name": "Bia", "role": "Redatora"})
        assert hired.status_code == 201
        assert client.post("/api/tasks", json={"title": "t", "briefing": "b", "area_id": 3}).status_code == 409

        task_id = client.post("/api/tasks", json={"title": "Post", "briefing": "Escreva", "area_id": 1}).json()["id"]
        for _ in range(100):
            task = client.get(f"/api/tasks/{task_id}").json()
            if task["status"] == "delivered":
                break
            time.sleep(0.02)
        assert task["status"] == "delivered"
        assert [r["approved"] for r in task["reviews"]] == [False, True]

        state = client.get("/api/state").json()
        assert state["tasks"][0]["last_review"]["approved"] is True
        assert len(state["agents"]) == 2 and len(state["areas"]) == 6

        assert client.post(f"/api/tasks/{task_id}/approve").json()["status"] == "approved"
        assert client.post(f"/api/tasks/{task_id}/approve").status_code == 409
        assert client.get("/api/tasks/nope").status_code == 404
        assert client.get("/").status_code in (200, 404)

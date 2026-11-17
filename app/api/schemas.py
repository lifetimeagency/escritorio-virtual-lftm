from __future__ import annotations

from pydantic import BaseModel, Field


class AreaIn(BaseModel):
    name: str = Field(max_length=60)
    head_name: str = Field(max_length=60)
    head_instructions: str = Field(default="", max_length=8000)
    dashboard_url: str = Field(default="", max_length=500)


class HireIn(BaseModel):
    area_id: int
    seat: int
    name: str = Field(max_length=60)
    role: str = Field(max_length=80)
    instructions: str = Field(default="", max_length=8000)


class AgentIn(BaseModel):
    name: str = Field(max_length=60)
    role: str = Field(max_length=80)
    instructions: str = Field(default="", max_length=8000)


class SettingsIn(BaseModel):
    standards: list[str]
    max_review_rounds: int


class TaskIn(BaseModel):
    title: str = Field(max_length=160)
    briefing: str = Field(max_length=40000)
    area_id: int


class PublicationIn(BaseModel):
    task_id: str
    channel: str
    text: str = Field(max_length=10000)
    scheduled_at: str


class PublishedIn(BaseModel):
    url: str = Field(default="", max_length=2000)


class FeedbackIn(BaseModel):
    feedback: str = Field(max_length=8000)

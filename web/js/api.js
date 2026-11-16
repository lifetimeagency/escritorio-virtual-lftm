async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Não foi possível concluir. Confira os campos e tente de novo.');
  }
  return data;
}

export const api = {
  state: () => req('GET', '/api/state'),
  defineArea: (id, body) => req('PUT', `/api/areas/${id}`, body),
  hire: (body) => req('POST', '/api/agents', body),
  updateAgent: (id, body) => req('PUT', `/api/agents/${id}`, body),
  dismiss: (id) => req('DELETE', `/api/agents/${id}`),
  saveSettings: (body) => req('PUT', '/api/settings', body),
  delegate: (body) => req('POST', '/api/tasks', body),
  task: (id) => req('GET', `/api/tasks/${id}`),
  tasks: () => req('GET', '/api/tasks'),
  approve: (id) => req('POST', `/api/tasks/${id}/approve`),
  requestChanges: (id, feedback) => req('POST', `/api/tasks/${id}/request-changes`, { feedback }),
  retry: (id) => req('POST', `/api/tasks/${id}/retry`),
  cancel: (id) => req('POST', `/api/tasks/${id}/cancel`),
};

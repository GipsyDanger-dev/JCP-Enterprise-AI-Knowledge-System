const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export async function getHealth(): Promise<string> {
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.text();
}


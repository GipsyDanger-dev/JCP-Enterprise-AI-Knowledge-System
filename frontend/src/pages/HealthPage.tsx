import { useEffect, useState } from 'react';
import { getHealth } from '../api/health';
import { ConnectionStatus } from '../components/ConnectionStatus';

type Status = 'checking' | 'connected' | 'disconnected';

export function HealthPage() {
  const [status, setStatus] = useState<Status>('checking');
  useEffect(() => {
    getHealth().then((value) => setStatus(value === 'OK' ? 'connected' : 'disconnected')).catch(() => setStatus('disconnected'));
  }, []);
  return <main className="page"><section className="card"><p className="eyebrow">Enterprise AI Knowledge System</p><h1>RAG Knowledge Base</h1><ConnectionStatus status={status} /></section></main>;
}


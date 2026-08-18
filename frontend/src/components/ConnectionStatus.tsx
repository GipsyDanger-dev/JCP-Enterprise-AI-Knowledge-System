type Props = { status: 'checking' | 'connected' | 'disconnected' };

export function ConnectionStatus({ status }: Props) {
  const label = { checking: 'Checking backend...', connected: 'Backend connected', disconnected: 'Backend disconnected' }[status];
  return <p className={`status status--${status}`}>{label}</p>;
}


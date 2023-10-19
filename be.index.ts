import { BackendServer } from './backend/backend-server';

try {
  const port = parseInt(process.argv[2]);
  new BackendServer(port);
} catch (err) {
  console.error('Invalid port provided');
  process.exit(1);
}
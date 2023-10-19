import { LBServer } from './load-balancer/load-balancer';

try {
  const port = parseInt(process.argv[2]);
  new LBServer(port);
} catch (err) {
  console.error('Invalid port provided');
  process.exit(1);
}
import path from 'path';
import { LBServer } from './load-balancer/load-balancer';

global.__appBaseDir = path.resolve(__dirname);

let lbserver: LBServer;
try {
  const port = parseInt(process.argv[2]);
  lbserver = new LBServer(port);
} catch (err) {
  console.error('Invalid port provided');
  process.exit(1);
}

process.on('SIGTERM', () => {
  console.info('SIGTERM signal received.');
  lbserver.close();
})

process.on('SIGINT', () => {
  console.info('SIGINT signal received.');
  lbserver.close();
})

process.on('SIGKILL', () => {
  console.info('SIGKILL signal received.');
  lbserver.close();
})
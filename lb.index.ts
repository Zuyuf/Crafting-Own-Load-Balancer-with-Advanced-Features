import { LbAlgorithm } from './load-balancer/utils/enums';
import { LBServer } from './load-balancer/load-balancer';

try {
  const port = parseInt(process.argv[2]);
  new LBServer(port, LbAlgorithm.ROUND_ROBIN, 30);
} catch (err) {
  console.error('Invalid port provided');
  process.exit(1);
}
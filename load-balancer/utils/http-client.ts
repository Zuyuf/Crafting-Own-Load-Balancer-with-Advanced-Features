import axiosRetry from 'axios-retry';
import axios from 'axios';
import { Config } from './config';

const CONFIG = Config.getConfig();

//

const BEPingHttpClient = axios.create();
axiosRetry(BEPingHttpClient, {
    retries: CONFIG.be_ping_retries,
    retryDelay: (retryCount) => {
        console.log(`\t\t\t\t[PingRetry]  -  Pinging after delay`);
        return retryCount * CONFIG.be_ping_retry_delay;
    },

});

const BEHttpClient = axios.create();
axiosRetry(BEHttpClient, {
    retries: CONFIG.be_retries,
    retryDelay: (retryCount) => {
        console.log(`\t\t\t\t[BERetry]  -  BE retry after delay`);
        return retryCount * CONFIG.be_retry_delay;
    },

});

export { BEHttpClient, BEPingHttpClient };

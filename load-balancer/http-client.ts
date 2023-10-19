import axiosRetry from 'axios-retry';
import axios from 'axios';

const BEPingHttpClient = axios.create();
axiosRetry(BEPingHttpClient, {
    retries: 3,
    retryDelay: (retryCount) => {
        return retryCount * 500;
    },

});

const BEHttpClient = axios.create();
axiosRetry(BEHttpClient, {
    retries: 3,
    retryDelay: (retryCount) => {
        return retryCount * 200;
    },

});

export { BEHttpClient, BEPingHttpClient };

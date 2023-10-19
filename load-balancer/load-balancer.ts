import express from 'express';
import { BEHttpClient } from "./utils/http-client";
import { Server, IncomingMessage, ServerResponse } from "http";

import { BEServerHealth, LbAlgorithm } from "./utils/enums";
import { BackendServerDetails, IBackendServerDetails } from "./backend-server-details";
import { ILbAlgorithm } from './lb-algos/lb-algo.interface';
import { LbAlgorithmFactory } from './lb-algos/lb-algos';
import { HealthCheck } from './utils/health-check';

//

export interface ILBServer {
    server: Server<typeof IncomingMessage, typeof ServerResponse>;

    algoType: LbAlgorithm;
    lbAlgo: ILbAlgorithm;

    hc: HealthCheck;
    backendServers: IBackendServerDetails[];

    /**
     * Returns HTTP Server to Express app
     */
    getLBServer(): Server<typeof IncomingMessage, typeof ServerResponse>;

    /**
     * Closes Express Server & returns Server Objecct
     */
    close(): Server<typeof IncomingMessage, typeof ServerResponse>
}

export class LBServer implements ILBServer {
    algoType: LbAlgorithm;
    lbAlgo: ILbAlgorithm;

    hc: HealthCheck;

    backendServers: IBackendServerDetails[];
    server: Server<typeof IncomingMessage, typeof ServerResponse>;

    private PORT: number;
    private reqAbortController: AbortController;
    private healthyServers: Array<IBackendServerDetails>;
    private backendServerUrls = [
        'http://localhost:8081/',
        'http://localhost:8082/',
        'http://localhost:8083/',
    ];

    //
    //

    constructor(
        port: number = 80,
        algo: LbAlgorithm,
    ) {
        this.algoType = algo;
        this.PORT = port;
       
        this.reqAbortController = new AbortController();
        this.healthyServers = new Array<IBackendServerDetails>();
        this.backendServers = new Array<IBackendServerDetails>();

        this.backendServerUrls.forEach((url) => {
            const beServer = new BackendServerDetails(url, this.reqAbortController);
            this.backendServers.push(beServer);
        });

        this.lbAlgo = LbAlgorithmFactory.factory(algo, {
            curBEServerIdx: -1,
            allServers: this.backendServers,
            healthyServers: this.healthyServers
        });

        this.hc = new HealthCheck(this.backendServers, this.healthyServers);

        //

        const app = this.createExpressApp();
        this.server = app
            .listen(this.PORT, () => {
                console.log('LB Server listening on port ' + this.PORT);
            });

        this.hc.performHealthCheckOnAllServers();
        this.hc.startHealthCheck();
    }

    //
    //

    private createExpressApp() {
        const app = express();

        app.use(express.text());
        app.use(express.json());

        app.get('/', async (req, res) => {
            let backendServer = this.getBackendServer();

            if (this.healthyServers.length === 0) {
                return res.sendStatus(500);
            }

            try {
                const response = await BEHttpClient.get(backendServer.url, {
                    "axios-retry": {
                        retries: 3,
                        retryDelay: (retryCount) => retryCount * 200,
                        onRetry: (retryCount, error, requestConfig) => {
                            // If connection establishment was refused
                            // Need to perform Health Check on that perticular server
                            // this could happen due BE Server being overloaded / is down
                            if (error.code === 'ECONNREFUSED') this.hc.performHealthCheck(backendServer);
                            else console.log(`${backendServer.url} - retryCount=${retryCount} - error=${error}`);

                            // get another server & make retry request to that server
                            backendServer = this.getBackendServer();
                            requestConfig.url = backendServer.url;
                        },
                    }
                });

                backendServer.incrementRequestsServedCount();
                return res.status(200).send(response.data);
            }
            catch (error) {
                console.error(error);
                res.sendStatus(500);
                return;
            }
        });

        return app;
    }


    public getLBServer(): Server<typeof IncomingMessage, typeof ServerResponse> {
        return this.server;
    }

    public close(): Server<typeof IncomingMessage, typeof ServerResponse> {
        this.hc.stopHealthCheck();
        this.reqAbortController.abort();

        const server = this.server.close();
        console.log(`Closed LB Server`);
        
        this.printBackendStats();
        
        return server;
    }


    private printBackendStats(): void {
        const stats: [string, number, number, string][] = [];

        this.backendServers.forEach((server) => {
            stats.push([
                server.url,
                server.totalRequestsServedCount,
                server.requestsServedCount,
                BEServerHealth[server.getStatus()]
            ]);
        });

        console.log(`Backend Stats: \n${stats}`);
    }

    
    /**
   * This is the BackendServer Assignment function that returns the Backend Server Instance.
   * based on the LoadBalancing algorithm for sending incoming requests.
   */
    private getBackendServer(): IBackendServerDetails {
        const { server } = this.lbAlgo.nextServer();
        return server;
    }
}

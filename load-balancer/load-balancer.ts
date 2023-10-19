import express from 'express';
import { BEHttpClient, BEPingHttpClient } from "./http-client";
import { Server, IncomingMessage, ServerResponse } from "http";
import { Mutex, MutexInterface } from 'async-mutex';

import { BEServerHealth, LbAlgorithm } from "./enums";
import { BackendServerDetails, IBackendServerDetails } from "./backend-server-details";
import { ILbAlgorithm } from './lb-algos/lb-algo.interface';
import { LbAlgorithms } from './lb-algos/lb-algos';

//

export interface ILBServer {
    server: Server<typeof IncomingMessage, typeof ServerResponse>;

    algoType: LbAlgorithm;
    lbAlgo: ILbAlgorithm;

    backendServers: IBackendServerDetails[];

    healthCheckPeriodInSeconds: number;

    /**
     * Returns HTTP Server to Express app
     */
    getServer(): Server<typeof IncomingMessage, typeof ServerResponse>;

    /**
     * Closes Express Server & returns Server Objecct
     */
    close(): Server<typeof IncomingMessage, typeof ServerResponse>;


    /**
     * Starts Asynchronous check
     */
    startHealthCheck(): void;

    /**
     * Stops health check
     */
    stopHealthCheck(): void;

    /**
     * peforms health check for all BE Servers
     */
    performHealthCheckOnAllServers(): Promise<void>;
}

export class LBServer implements ILBServer {
    algoType: LbAlgorithm;
    lbAlgo: ILbAlgorithm;
    backendServers: IBackendServerDetails[];
    healthCheckPeriodInSeconds: number;
    server: Server<typeof IncomingMessage, typeof ServerResponse>;

    private PORT: number;
    private healthCheckMutex: MutexInterface;
    private reqAbortController: AbortController;
    private clearHealthCheckTimer?: NodeJS.Timeout;
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
        healthCheckPeriodInSeconds: number
    ) {
        this.algoType = algo;
        this.PORT = port;
       
        this.healthCheckMutex = new Mutex();
        this.reqAbortController = new AbortController();
        this.healthyServers = new Array<IBackendServerDetails>();
        this.backendServers = new Array<IBackendServerDetails>();
        this.healthCheckPeriodInSeconds = healthCheckPeriodInSeconds;

        this.backendServerUrls.forEach((url) => {
            const beServer = new BackendServerDetails(url, this.reqAbortController);
            this.backendServers.push(beServer);
        });

        this.lbAlgo = LbAlgorithms.factory(algo, {
            curBEServerIdx: -1,
            allServers: this.backendServers,
            healthyServers: this.healthyServers
        });

        //

        const app = this.createExpressApp();
        this.server = app
            .listen(this.PORT, () => {
                console.log('LB Server listening on port ' + this.PORT);
            });

        this.performHealthCheckOnAllServers();
        this.startHealthCheck();
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
                            if (error.code === 'ECONNREFUSED') this.performHealthCheck(backendServer);
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

    public getServer(): Server<typeof IncomingMessage, typeof ServerResponse> {
        return this.server;
    }

    public close(): Server<typeof IncomingMessage, typeof ServerResponse> {
        this.stopHealthCheck();
        this.reqAbortController.abort();

        const server = this.server.close();
        console.log(`Closed LB Server`);
        
        this.printBackendStats();
        
        return server;
    }

    private printBackendStats(): void {
        const stats: [string, number, string][] = [];

        this.backendServers.forEach((server) => {
            stats.push([
                server.url,
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

    //
    // Health Checks Functions
    // 

    public startHealthCheck(): void {
        this.clearHealthCheckTimer = setInterval(
            async () => await this.performHealthCheckOnAllServers(), 
            this.healthCheckPeriodInSeconds * 1000
        );
    }

    public stopHealthCheck(): void {
        clearInterval(this.clearHealthCheckTimer);
    }

    public async performHealthCheckOnAllServers(): Promise<void> {
        // Mutex is required bcuz there are 2 HealthChecks 
        //      1. HealthChecks on All Servers on PreDefined Interval
        //      2. HealthCheck on specific Server, When a Server Refuses to establish connecction
        // So both HealthChecks can run at the same time & may result in issues.

        const healthCheckMutexRelease = await this.healthCheckMutex.acquire();

        try {
            const pingTasks: any = [];

            for (let i = 0; i < this.backendServers.length; i++) {
                pingTasks.push(this.backendServers[i].ping());
            }

            const pingResults = await Promise.all(pingTasks);

            for (let i = 0; i < pingResults.length; i++) {
                this.performHealthCheck(this.backendServers[i], true, pingResults[i]);
            }

            console.log(`Completed Health Check at ${new Date().toString()}. Total Backend Servers online: ${this.healthyServers.length}`);
        }
        catch (error) {
            console.log(`Failed to performHealthCheckOnAllServers due to: ${(error as any)?.message}`);
            console.log(error);
        }
        finally {
            healthCheckMutexRelease();
        }
    }

    private async performHealthCheck(BEServer: IBackendServerDetails, hasAcquiredLock = false, pingResult?: number) {
        // Mutex is required bcuz there are 2 HealthChecks 
        //      1. HealthChecks on All Servers on PreDefined Interval
        //      2. HealthCheck on specific Server, When a Server Refuses to establish connecction
        // So both HealthChecks can run at the same time & may result in issues.

        let healthCheckMutexRelease: MutexInterface.Releaser | undefined;
        if (!hasAcquiredLock) healthCheckMutexRelease = await this.healthCheckMutex.acquire();

        try  {
            // Wait for tasks to complete
            const _pingResult = pingResult ?? await BEServer.ping();
            const oldStatus = BEServer.getStatus();

            if (_pingResult === 200 && oldStatus === BEServerHealth.UNHEALTHY) {
                BEServer.setStatus(BEServerHealth.HEALTHY);
                
                const serverIdx = this.healthyServers
                    .map((server) => server.url)
                    .indexOf(BEServer.url);
                
                if (serverIdx < 0) {
                    BEServer.resetRequestsServedCount();
                    this.healthyServers.push(BEServer);
                }
            }
            //
            // Server is UnHealthy
            else if (_pingResult !== 200 && oldStatus === BEServerHealth.HEALTHY) {
                BEServer.setStatus(BEServerHealth.UNHEALTHY);

                const serverIdx = this.healthyServers
                    .map((server) => server.url)
                    .indexOf(BEServer.url);

                if (serverIdx >= 0) {
                    this.healthyServers.splice(serverIdx, 1);
                }
            }

            if (healthCheckMutexRelease) console.log(`performHealthCheck [${BEServer.url}]: health=${BEServer.getStatus()}`);
        }
        catch (error) {
            console.log(`Failed to performHealthCheckOnAllServers due to: ${(error as any)?.message}`);
            console.log(error);
        }
        finally {
            if (healthCheckMutexRelease) healthCheckMutexRelease();
        }
    }
}

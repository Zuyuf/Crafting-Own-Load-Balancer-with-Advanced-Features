
import { BEPingHttpClient } from "./http-client";
import { BEServerHealth } from "./enums";

//

export interface IBackendServerDetails {
    url: string;
    requestsServedCount: number;
    totalRequestsServedCount: number;
    reqAbortController: AbortController;
    
    /**
     * the streak of Server being assigned a status as UnHealthy
     */
    failStreak: number;

    /**
     * used for weighted round robin
     */
    serverWeight: number;

    /**
     * increments total requests sent to this server
     */
    incrementRequestsServedCount(): number;

    /**
     * resets the number of requests sent to this server
     */
    resetRequestsServedCount(): void;


    /**
     * Performs a simple GET operation on the PING URL.
     * Expected Status code is 200 if Backend Server is live.
     */
    ping(): Promise<number>;


    setStatus(status: BEServerHealth): void;

    getStatus(): BEServerHealth;
}

export class BackendServerDetails implements IBackendServerDetails {
    url: string;
    requestsServedCount: number;
    totalRequestsServedCount: number;
    reqAbortController: AbortController;
    
    pingUrl: string;
    failStreak: number;
    serverWeight: number;
    status: BEServerHealth;

    //
    //

    constructor(
        url: string,
        abortController: AbortController,
        serverWeight = 1,
        status?: BEServerHealth    
    ) {
        this.url = url;
        this.failStreak = 0;
        this.requestsServedCount = 0;
        this.serverWeight = serverWeight;
        this.totalRequestsServedCount = 0;
        this.reqAbortController = abortController;
        this.pingUrl = url + 'ping';
        this.status = status ?? BEServerHealth.UNHEALTHY;
    }

    //
    
    setStatus(status: BEServerHealth): void {
        if (status === BEServerHealth.UNHEALTHY) {
            this.failStreak++;
            this.triggerBEFailureAlert();
        }
        else this.failStreak = 0;

        this.status = status;
    }
    
    getStatus(): BEServerHealth {
        return this.status;
    }


    /**
     * This pings backend server.
     * This is used to do HealthCheck on Server.
     * 
     * It performs Retries in Exponential Delay.
     */
    public async ping(): Promise<number> {
        try {
            const response = await BEPingHttpClient.get(this.pingUrl, {
                signal: this.reqAbortController.signal
            });

            return response.status;
        }
        catch (error) {
            return 500;
        }
    }

    public async triggerBEFailureAlert() {
        if (this.failStreak % 3 !== 0) return;
        
        try {
            const response = await BEPingHttpClient.get(this.pingUrl);

            return response.status;
        }
        catch (error) {
            console.log(`[IMPORTANT] Not able to trigger BEFailureAlert`)
            return;
        }
    }


    incrementRequestsServedCount(): number {
        this.requestsServedCount++;
        this.totalRequestsServedCount++; 

        return this.requestsServedCount;
    }

    resetRequestsServedCount(): void {
        this.requestsServedCount = 0;
    }
    
}
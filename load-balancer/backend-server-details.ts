import { BEPingHttpClient } from "./utils/http-client";
import { BEServerHealth } from "./utils/enums";
import { Config } from './utils/config';
import { HealthCheck } from "./utils/health-check";

const CONFIG = Config.getConfig();

//

export interface IBackendServerDetails {
    url: string;
    requestsServedCount: number;
    totalRequestsServedCount: number;
    reqAbortController: AbortController;
    
    /**
     * used for weighted round robin
     */
    serverWeight: number;

    selfHealAttempts: number;

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
    serverWeight: number;
    selfHealAttempts: number;
    private failStreak: number;
    private status: BEServerHealth;

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
        this.selfHealAttempts = 0;
        this.requestsServedCount = 0;
        this.serverWeight = serverWeight;
        this.totalRequestsServedCount = 0;
        this.reqAbortController = abortController;
        this.pingUrl = url + CONFIG.be_ping_path;
        this.status = status ?? BEServerHealth.UNHEALTHY;
    }

    //
    
    setStatus(status: BEServerHealth): void {
        if (status === BEServerHealth.UNHEALTHY) {
            this.failStreak++;
            this.triggerBEFailureAlert();
            console.log(`\t[Logger] setStatus UNHEALTHY - ${this.url} - failStreak=${this.failStreak}`);
        }
        else {
            this.failStreak = 0;
            console.log(`\t[Logger] setStatus HEALTHY - ${this.url}`);
        }

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
        console.log(`\t\t[PingStart]  -  ${this.url}`);

        try {
            const response = await BEPingHttpClient.get(this.pingUrl, {
                signal: this.reqAbortController.signal
            });

            console.log(`\t\t[PingSuccess]  -  Pinging ${this.url}`);

            return response.status;
        }
        catch (error) {
            console.log(`\t\t[PingError]  -  ${this.url}`);
            return 500;
        }
    }

    public async triggerBEFailureAlert() {
        if (this.failStreak % CONFIG.alert_on_be_failure_streak !== 0) return;
        
        console.log(`\t[Logger] triggerBEFailureAlert - ${this.url}`);

        //

        const didHeal = await HealthCheck.selfHealBEServer(this);
        if (didHeal) this.selfHealAttempts = 0;
        
        try {
            const response = await BEPingHttpClient.post(CONFIG.send_alert_webhook, {
                be_domain: this.url,
                type: 'BE_DOWN',
                status: this.status,
                healingStatus: didHeal,
                failStreak: this.failStreak,
                selfHealAttempts: didHeal ? this.selfHealAttempts + 1 : this.selfHealAttempts,
                requestsServedCount: this.requestsServedCount,
                totalRequestsServedCount: this.totalRequestsServedCount,
            });

            return response.status;
        }
        catch (error) {
            console.log(`\t[Logger] Not able to trigger BEFailureAlert`)
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
import { Mutex, MutexInterface } from 'async-mutex';
import { IBackendServerDetails } from '../backend-server-details';
import { BEServerHealth } from './enums';
import { Config } from './config';
import { BEPingHttpClient } from './http-client';

const CONFIG = Config.getConfig();

//

export class HealthCheck {
    private healthCheckMutex: MutexInterface;
    private allServers: IBackendServerDetails[];
    private healthyServers: IBackendServerDetails[];
    private clearHealthCheckTimer?: NodeJS.Timeout;
    private failStreak: number;

    //

    constructor(allServers: IBackendServerDetails[], healthyServers: IBackendServerDetails[]) {
       this.healthCheckMutex = new Mutex();
        this.allServers = allServers;
        this.healthyServers = healthyServers;
        this.failStreak = 0;
    }

    //
    
    public startHealthCheck(): void {
        if (this.clearHealthCheckTimer) return;

        this.clearHealthCheckTimer = setInterval(
            async () => await this.performHealthCheckOnAllServers(), 
            CONFIG.health_check_interval
        );
    }

    public stopHealthCheck(): void {
        if (!this.clearHealthCheckTimer) return;

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

            for (let i = 0; i < this.allServers.length; i++) {
                pingTasks.push(this.allServers[i].ping());
            }

            const pingResults = await Promise.all(pingTasks);

            for (let i = 0; i < pingResults.length; i++) {
                this.performHealthCheck(this.allServers[i], true, pingResults[i]);
            }


            if (this.healthyServers.length === 0) {
                this.failStreak++;
                this.triggerAllBEFailureAlert();
            }
            else this.failStreak = 0;


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


    public async performHealthCheck(BEServer: IBackendServerDetails, hasAcquiredLock = false, pingResult?: number) {
        // Mutex is required bcuz there are 2 HealthChecks 
        //      1. HealthChecks on All Servers on PreDefined Interval
        //      2. HealthCheck on specific Server, When a Server Refuses to establish connecction
        // So both HealthChecks can run at the same time & may result in issues.

        let healthCheckMutexRelease: MutexInterface.Releaser | undefined;
        if (!hasAcquiredLock) healthCheckMutexRelease = await this.healthCheckMutex.acquire();

        try  {
            // Wait for tasks to complete
            const _pingResult = pingResult ?? await BEServer.ping();
            // const oldStatus = BEServer.getStatus();

            if (_pingResult === 200) {
                    BEServer.setStatus(BEServerHealth.HEALTHY);
                
                const serverIdx = this.healthyServers
                    .map((server) => server.url)
                    .indexOf(BEServer.url);
                
                if (serverIdx < 0) {
                    BEServer.resetRequestsServedCount();
                    this.healthyServers.push(BEServer);

                    // sort the array so that its easier/predictable to work on
                    this.healthyServers.sort((s1, s2) => {
                        if (s1.serverWeight) {
                            return s1.serverWeight - s2.serverWeight;
                        }
                        else return s1.url < s2.url ? -1 : s1.url > s2.url ? 1 : 0;
                    });
                }
            }
            //
            // Server is UnHealthy
            else if (_pingResult !== 200) {
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

    public async triggerAllBEFailureAlert() {
        if (this.failStreak % CONFIG.alert_on_all_be_failure_streak !== 0) return;
        console.log(`\t\t[Logger] triggerAllBEFailureAlert`);
        
        try {
            const response = await BEPingHttpClient.post(CONFIG.send_alert_webhook, {
                type: 'ALL_BE_DOWN',
                failStreak: this.failStreak
            });

            return response.status;
        }
        catch (error) {
            console.log(`\t\t[Logger] Not able to triggerAllBEFailureAlert`)
            return;
        }
    }

}


import { Mutex, MutexInterface } from 'async-mutex';
import { IBackendServerDetails } from '../backend-server-details';
import { BEServerHealth } from './enums';
import { Config } from './config';

const CONFIG = Config.getConfig();

//

export class HealthCheck {
    private healthCheckMutex: MutexInterface;
    private allServers: IBackendServerDetails[];
    private healthyServers: IBackendServerDetails[];
    private clearHealthCheckTimer?: NodeJS.Timeout;

    //

    constructor(allServers: IBackendServerDetails[], healthyServers: IBackendServerDetails[]) {
       this.healthCheckMutex = new Mutex();
        this.allServers = allServers;
        this.healthyServers = healthyServers;
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


import { ExecCMD } from './exec-cmd';
import { Mutex, MutexInterface } from 'async-mutex';

import { Config } from './config';
import { BEServerHealth } from './enums';
import { BEPingHttpClient } from './http-client';
import { IBackendServerDetails } from '../backend-server-details';

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

    /**
     * Tries to restart a Backend Server for self Healing
     */
    public static async selfHealBEServer(server: IBackendServerDetails) {
        console.log(`\t[Logger] selfHealBEServer - ${server.url}`);
        server.selfHealAttempts++;

        if (!CONFIG.enableSelfHealing) return false;

        //
        // This is just to simulate randomness of Server being SelfHeealed
        const randomShouldHeal = CONFIG._test_only_chances_of_healing_server === 0 
            ? true
            : HealthCheck.generateRandomBoolean();

        if (!randomShouldHeal) return false;

        //
        
        try {
            const port = server.url.substring(server.url.lastIndexOf(':') + 1);
            await ExecCMD(`cd ${global.__appBaseDir} && npx ts-node be.index.ts ${port}`);
            
            return true;
        }
        catch (error) {
            console.log('\t[ERROR] selfHealBEServer - Command failed to run with error: ', error);
            return false;
        }
    }

    private static generateRandomBoolean(likelihoodOfTrue: number = CONFIG._test_only_chances_of_healing_server): boolean {
        // Ensure that the likelihood is within the valid range (0-100%)
        if (likelihoodOfTrue < 0 || likelihoodOfTrue > 1) {
          throw new Error('Likelihood must be between 0 and 100.');
        }
      
        // Generate a random number between 0 and 1
        const randomValue = Math.random();
      
        // If the random number is less than the likelihood, return true, otherwise return false
        return randomValue < likelihoodOfTrue;
      }

}


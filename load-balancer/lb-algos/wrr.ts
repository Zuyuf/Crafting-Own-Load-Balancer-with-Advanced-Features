import { ILBAlgorithmParams, ILbAlgorithm } from "./lb-algo.interface";
import { IBackendServerDetails } from "../backend-server-details";
import { LbAlgorithm } from "../utils/enums";

export class WeightedRoundRobinLB implements ILbAlgorithm {

    algoType = LbAlgorithm.WEIGHTED_ROUND_ROBIN;

    allServers: IBackendServerDetails[];
    healthyServers: IBackendServerDetails[];
    curBEServerIdx: number;

    weights: number[];
    maxWeight: number;
    step: number;
    quantum: number;


	constructor(params: ILBAlgorithmParams) {
		this.allServers = params.allServers;
        this.healthyServers = params.healthyServers;
		this.curBEServerIdx = params.curBEServerIdx ?? -1;

		this.weights = this.allServers.map((e) => e.serverWeight);
		this.maxWeight = Math.max(...this.weights);
		this.step = this.weights.reduce((gcd, ele) => this.GCD(gcd, ele), 0);
		this.quantum = 0;
	}

    //

    nextServer() {
        let server: IBackendServerDetails;

        while (true) {
            if (this.healthyServers.length === 0) {
                throw new Error('[ERROR] No Healthy Servers Found!!');
            }


            this.curBEServerIdx = (this.curBEServerIdx + 1) % this.healthyServers.length;
            
            if (this.curBEServerIdx == 0) {
                // start a new round, decrement current quantum
                this.quantum -= this.step;
                if (this.quantum <= 0) {
                    this.quantum = this.maxWeight;
                }
            }

            // pick the node if its weight greater than current quantum
            if (this.healthyServers[this.curBEServerIdx].serverWeight >= this.quantum) {
                server = this.healthyServers[this.curBEServerIdx];
                break;
            }
        }

        return { server, serverIdx: this.curBEServerIdx };
    }

    	
    private GCD(a: number, b: number)
    {
        while (a != 0 && b != 0) {
            if (a > b)
                a %= b;
            else
                b %= a;
        }
        return a == 0 ? b : a;
    }
}
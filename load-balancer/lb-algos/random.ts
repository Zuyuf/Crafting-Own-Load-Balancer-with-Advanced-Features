import { IBackendServerDetails } from "../backend-server-details";
import { LbAlgorithm } from "../utils/enums";
import { ILBAlgorithmParams, ILbAlgorithm } from "./lb-algo.interface";

//

export class RandomLB implements ILbAlgorithm {

    algoType = LbAlgorithm.RANDOM;

    allServers: IBackendServerDetails[];
    healthyServers: IBackendServerDetails[];
    curBEServerIdx: number;

	constructor(params: ILBAlgorithmParams) {
		this.allServers = params.allServers;
        this.healthyServers = params.healthyServers;
		this.curBEServerIdx = params.curBEServerIdx ?? -1;
	}

    //

    nextServer() {
        const randomDecimal = Math.random();
        const randomInRange = parseInt((0 + randomDecimal * this.healthyServers.length).toString());

        this.curBEServerIdx = randomInRange % this.healthyServers.length;
        
        const server = this.healthyServers[this.curBEServerIdx % this.healthyServers.length];

        return { server, serverIdx: this.curBEServerIdx };
    }

}
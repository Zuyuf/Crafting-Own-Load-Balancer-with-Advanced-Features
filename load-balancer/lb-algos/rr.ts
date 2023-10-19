import { IBackendServerDetails } from "../backend-server-details";
import { LbAlgorithm } from "../utils/enums";
import { ILBAlgorithmParams, ILbAlgorithm } from "./lb-algo.interface";

//

export class RoundRobinLB implements ILbAlgorithm {

    algoType = LbAlgorithm.ROUND_ROBIN;

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
        this.curBEServerIdx = (this.curBEServerIdx + 1) % this.healthyServers.length;
        
        const server = this.healthyServers[this.curBEServerIdx % this.healthyServers.length];
        
        return { server, serverIdx: this.curBEServerIdx };
    }

}
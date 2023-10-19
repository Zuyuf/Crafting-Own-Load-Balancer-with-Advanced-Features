import { IBackendServerDetails } from "../backend-server-details";

export interface ILBAlgorithmParams {
    
    allServers: IBackendServerDetails[];

    healthyServers: IBackendServerDetails[];

    curBEServerIdx?: number;
}

export abstract class ILbAlgorithm {
    abstract allServers: IBackendServerDetails[];
    abstract healthyServers: IBackendServerDetails[];
    abstract curBEServerIdx: number;

    abstract nextServer(): { server: IBackendServerDetails; serverIdx: number; }
}
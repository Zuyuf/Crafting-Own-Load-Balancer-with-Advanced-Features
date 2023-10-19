import Joi from 'joi';
import _config from '../config.json';
import { LbAlgorithm } from './enums';

const config = _config as unknown as IConfig;


interface IConfig {
    lbPORT: number;

    lbAlgo: LbAlgorithm;
    _lbAlgo: 'rand' | 'rr' | 'wrr';

    be_servers: {
        domain: string;
        weight?: number;
    }[]

    be_retries: number;
    be_retry_delay: number;

    be_ping_path: string;
    be_ping_retries: number;
    be_ping_retry_delay: number;

    health_check_interval: number;

    send_alert_webhook: string;
    alert_on_be_failure_streak: number;
    alert_on_all_be_failure_streak: number;
}


const config_joi_schema = Joi.object({
    lbPORT: Joi.number().required(),

    lbAlgo: Joi.string().optional(),
    _lbAlgo: Joi.string().valid('rand', 'rr', 'wrr').required(),

    be_servers: Joi.array().min(1)
        .items(Joi.object({
            domain: Joi.string().required(),

            weight: Joi.number().when('lbAlgo', {
                is: Joi.string().valid('wrr'),
                then: Joi.required(),
                otherwise: Joi.optional()
            })
        })),
    
    be_retries: Joi.number().min(0).max(config.be_servers.length),
    be_retry_delay: Joi.number().min(0).max(10000),
    
    be_ping_path: Joi.string().required(),
    be_ping_retries: Joi.number().min(0).max(config.be_servers.length),
    be_ping_retry_delay: Joi.number().min(0).max(10000),
    
    health_check_interval: Joi.number().min(10* 1000).max(300 * 1000),
    
    send_alert_webhook: Joi.string().required(),
    alert_on_be_failure_streak: Joi.number().min(3).max(100),
    alert_on_all_be_failure_streak: Joi.number().min(1).max(100),
})



export class Config {

    static getConfig() {
        config.lbPORT = config.lbPORT ?? 80;
        config.lbAlgo = Config.configAlgoTypeToLbAlgorithm(config._lbAlgo);

        config.be_retries = config.be_retries ?? 3;
        config.be_retry_delay = config.be_retry_delay ?? 200;

        config.be_ping_path = config.be_ping_path ?? '/ping'
        config.be_ping_retries = config.be_ping_retries ?? config.be_retries ?? 3;
        config.be_ping_retry_delay = config.be_ping_retry_delay ?? config.be_retry_delay ?? 500;
        
        config.health_check_interval = config.health_check_interval ?? 30 * 1000;
        
        config.alert_on_be_failure_streak = config.alert_on_be_failure_streak ?? 3;
        config.alert_on_all_be_failure_streak = config.alert_on_all_be_failure_streak ?? 3;
        
        //
        
        return config;
    }

    static validate() {
        const validation = config_joi_schema.validate(config);

        if (validation.error) {
            throw new Error(`[ConfigError] ${validation.error.details[0].message}`)
        }

        console.log('[Success] Validated Config');
        return true;
    }

    static configAlgoTypeToLbAlgorithm(configAlgoType: IConfig['_lbAlgo']) {
        switch (configAlgoType) {
            case 'rand': return LbAlgorithm.RANDOM;
            case 'rr': return LbAlgorithm.ROUND_ROBIN;
            case 'wrr': return LbAlgorithm.WEIGHTED_ROUND_ROBIN;

            default: throw new Error(`[ConfigError] configAlgoTypeToLbAlgorithm: Didn\'t find ${configAlgoType}`);
        }
    }

}

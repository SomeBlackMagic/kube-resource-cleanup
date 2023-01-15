import {env, envBoolean} from '../Helpers';

export class ConfigFactory {

    public static getBase(): AppInfo {
        return {
            id: 'kube-cleaner',
            version: 'dev-dirty',
        };
    }


    public static getCore(): CoreConfigInterface {
        return {
            HELM_BIN_PATH:  env('HELM_BIN_PATH', 'helm'),
            HELM_CMD_ARGS: env('HELM_CMD_ARGS', ''),
            KUBECTL_BIN_PATH: env('KUBECTL_BIN_PATH', 'kubectl'),
            KUBECTL_CMD_ARGS: env('KUBECTL_CMD_ARGS', ''),
            HELM_DEBUG: envBoolean('HELM_DEBUG', false),
            HELM_DRY_RUN:  envBoolean('HELM_DRY_RUN', false),
            KUBE_NAMESPACE:  env('KUBE_NAMESPACE', 'default'),
            KUBE_CLEANER_DEBUG: envBoolean('KUBE_CLEANER_DEBUG', true),
        };
    }
}


interface AppInfo {
    id: string;
    version: string;
}

interface CoreConfigInterface {
    HELM_BIN_PATH: string;
    HELM_CMD_ARGS: string;
    KUBECTL_BIN_PATH: string;
    KUBECTL_CMD_ARGS: string;
    HELM_DEBUG: boolean;
    HELM_DRY_RUN: boolean;
    KUBE_NAMESPACE: string;
    KUBE_CLEANER_DEBUG: boolean;
}

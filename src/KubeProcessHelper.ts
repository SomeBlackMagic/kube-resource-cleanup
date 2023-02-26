import {NewChildProcessOptions, NewChildProcessOptionsDefaultValue, ProcessHelper} from './ProcessHelper';
import {ConfigFactory} from './Config/app-config';

export default class KubeProcessHelper  {
    public static async helm(args: string[], options: NewChildProcessOptions = new NewChildProcessOptionsDefaultValue()): Promise<any> {
        let allArgs: string[] = [
            ...ConfigFactory.getCore().HELM_CMD_ARGS.split(' '),
            ...args
        ];
        return ProcessHelper.createChildProcess(
            ConfigFactory.getCore().HELM_BIN_PATH, allArgs,
            options
        );
    }
    public static async kubectl(args: string[], options: NewChildProcessOptions = new NewChildProcessOptionsDefaultValue()): Promise<any> {
        let allArgs: string[] = [
            ...ConfigFactory.getCore().KUBECTL_CMD_ARGS.split(' '),
            ...args
        ];
        return ProcessHelper.createChildProcess(
            ConfigFactory.getCore().KUBECTL_BIN_PATH, allArgs,
            options
        );
    }

}

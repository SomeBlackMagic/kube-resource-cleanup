import {ChildProcessWithoutNullStreams, spawn} from 'child_process';
import {processSignalDebug} from '../Helpers';
import {clearTimeout} from 'timers';
import {ProcessHelper} from '../ProcessHelper';
import {ConfigFactory} from '../Config/app-config';
import * as console from 'console';

export class RemoverModule {

    public async run(cliArgs: string[]) {
        const gitlabProjectName: string = cliArgs[1];
        const gitlabProjectBranch: string = cliArgs[2];

        let args: string[] = [
            ...ConfigFactory.getCore().HELM_CMD_ARGS.split(' '),
            'ls',
            '--output',
            'json'
        ];
        const realiseList: HelmListItem[] = await ProcessHelper.createChildProcess(
            ConfigFactory.getCore().HELM_BIN_PATH, args,
            {
                grabStdOut: true,
                parseResult: 'json'
            }
        )

        const promiseList = realiseList.map((item) => {
            let args: string[] = [
                ...ConfigFactory.getCore().HELM_CMD_ARGS.split(' '),
                'get', 'all',
                item.name,
                '--output',
                'json'
            ];
            return ProcessHelper.createChildProcess(
                ConfigFactory.getCore().HELM_BIN_PATH, args,
                {
                    grabStdOut: true,
                    parseResult: 'json'
                }
            )
        })
        const realisesList = await Promise.all(promiseList);
        console.log('!!!');

    }

    public async stop(): Promise<any> {
        return Promise.resolve();
    }
}

interface HelmListItem {
    name: string,
    namespace: string,
    revision: number,
    updated: string,
    status: string,
    chart: string,
    app_version: string,
}

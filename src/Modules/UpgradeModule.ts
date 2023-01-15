import {ChildProcessWithoutNullStreams, spawn} from 'child_process';
import {inArray, processSignalDebug} from '../Helpers';
import {ConfigFactory} from '../Config/app-config';
import {clearTimeout} from 'timers';

const cliColor = require('cli-color');

export class UpgradeModule {
    private isExit: boolean = false;
    private subProcesses: { [n: string]: ChildProcessWithoutNullStreams } = {};
    private realiseName: string = '';
    private timeouts: NodeJS.Timeout[] = [];
    private intervals: any[] = [];

    public async run(cliArgs: string[]) {
        let BreakException = {};

        try {
            cliArgs.forEach((item) => {
                const symbol = item.slice(0, 1);
                const first2 = item.slice(0, 2);
                if (first2 !== '--' && symbol !== '-' && item !== 'upgrade') {
                    this.realiseName = item;
                    throw BreakException;
                }
            });
        } catch (e) {
            if (e !== BreakException) throw e;
        }


        if (ConfigFactory.getCore().HELM_ASSISTANT_UPGRADE_PIPE_LOGS === true) {
            this.kubectlWatchPodsLogsAndEvents();
            await this.kubectlWatchPods();
        }
        if (ConfigFactory.getCore().HELM_ASSISTANT_UPGRADE_JOB_STRICT === true && inArray(cliArgs, '--wait-for-jobs')) {
            await this.watchJobStatus();
        }

    }

    public async stop(): Promise<any> {
        this.isExit = true;
        this.timeouts.forEach((item) => {
            clearTimeout(item);
        });
        this.intervals.forEach((item) => {
            clearInterval(item);
        });
        let promises = Object.entries(this.subProcesses).map((entry) => {
            const [key, item] = entry;
            return new Promise((resolve, reject) => {
                // https://github.com/kubernetes/kubectl/blob/652881798563c00c1895ded6ced819030bfaa4d7/pkg/util/interrupt/interrupt.go#L28
                item.kill('SIGTERM');
                const interval = setInterval(() => {
                    // https://github.com/kubernetes/kubectl/blob/652881798563c00c1895ded6ced819030bfaa4d7/pkg/util/interrupt/interrupt.go#L28
                    item.kill('SIGTERM');
                }, 1000);
                const timer = setTimeout(() => {
                    clearInterval(interval);
                    console.log('Stop process ' + key + ' timeout. Killing');
                    item.kill('SIGKILL');
                }, 5000);

                item.on('exit', (code: number) => {
                    clearInterval(interval);
                    clearTimeout(timer);
                    resolve(code);
                });
            });
        });
        return await Promise.all(promises);
    }

    private async kubectlWatchPods() {
        let args: string[] = [
            ...ConfigFactory.getCore().KUBECTL_CMD_ARGS.split(' '),
            'get',
            'pods',
            '--watch',
            '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
            '--selector', 'app.kubernetes.io/instance=' + this.realiseName
        ];
        await this.createChildProcess(ConfigFactory.getCore().KUBECTL_BIN_PATH, args, false, false, true, 'pods', 'magenta');

    }

    private kubectlWatchPodsLogsAndEvents() {
        this.intervals.push(setInterval(() => {
            (async () => {
                let newProcessArgs: string[] = [
                    ...ConfigFactory.getCore().KUBECTL_CMD_ARGS.split(' '),
                    'get', 'pods',
                    '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
                    '--selector', 'app.kubernetes.io/instance=' + this.realiseName,
                    '-o', 'json'
                ];
                const pods = await this.createChildProcess(ConfigFactory.getCore().KUBECTL_BIN_PATH, newProcessArgs, true, true);
                let podList: any = JSON.parse(pods);
                podList.items.forEach((podItem: any) => {
                    this.kubectlWatchPodEvents(podItem.metadata.name);
                    if (podItem.status.initContainerStatuses !== undefined) {
                        podItem.status.initContainerStatuses.forEach((initContainer) => {
                            if (initContainer.state.running !== undefined) {
                                this.kubectlWatchPodContainerLogs(podItem.metadata.name, initContainer.name);
                            }
                        });
                    }
                    if (podItem.status.containerStatuses !== undefined) {
                        podItem.status.containerStatuses.forEach((container) => {
                            if (container.state.running !== undefined) {
                                this.kubectlWatchPodContainerLogs(podItem.metadata.name, container.name);
                            }
                        });
                    }
                });
            })();

        }, 1000));
    }

    private async kubectlWatchPodEvents(podName) {
        let newProcessArgs: string[] =
            [
                ...ConfigFactory.getCore().KUBECTL_CMD_ARGS.split(' '),
                'get', 'events',
                '--watch-only',
                '--field-selector', 'involvedObject.name=' + podName,
                '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
            ];
        await this.createChildProcess(ConfigFactory.getCore().KUBECTL_BIN_PATH, newProcessArgs, false, false, true, 'pod ' + podName + ' events', 'yellow');
    }

    private async kubectlWatchPodContainerLogs(podName: string, containerName: string) {
        let newProcessArgs: string[] =
            [
                ...ConfigFactory.getCore().KUBECTL_CMD_ARGS.split(' '),
                'logs',
                '--follow',
                '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
                '--container', containerName,
                podName
            ];
        await this.createChildProcess(ConfigFactory.getCore().KUBECTL_BIN_PATH, newProcessArgs, false, false, true, 'logs ' + podName + ' [' + containerName + ']', 'blue');
    }

    private async watchJobStatus() {
        let newProcessArgs: string[] =
            [
                ...ConfigFactory.getCore().KUBECTL_CMD_ARGS.split(' '),
                'get', 'job',
                this.realiseName,
                '-o', 'json',
                '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
            ];
        this.intervals.push(setInterval(() => {
            (async () => {
                const result = await this.createChildProcess(ConfigFactory.getCore().KUBECTL_BIN_PATH, newProcessArgs, true, true);
                if (result === '') {
                    return;
                }
                const resultJson = JSON.parse(result);
                if (typeof resultJson?.status?.conditions !== 'undefined') {
                    resultJson.status.conditions.forEach((item: any) => {
                        if (item.type === 'Failed') {
                            console.log('Job is failed. Exit!');
                            process.exitCode = 1;
                            process.emit('SIGTERM');
                        }
                    });
                }
            })();
        }, 1000));
    }


    private async createChildProcess(command: string, args: string[], wait: boolean = false, grabStdOut: boolean = false, pipeLogs: boolean = false, logPrefix: string = '', logColor: string = 'white') {
        if (this.isExit === true) {
            // console.log('Application is in exit process. Skip create new process');
            return Promise.resolve();
        }
        if (this.subProcesses[logPrefix.replace(/\s/g, '-')]) {
            return Promise.resolve(true);
        }
        let colorator;
        switch (logColor) {
            case 'blue':
                colorator = cliColor.blue;
                break;
            case 'yellow':
                colorator = cliColor.yellow;
                break;
            case 'magenta':
                colorator = cliColor.magenta;
                break;
            case 'white':
            default:
                colorator = cliColor.white;
                break;


        }
        return new Promise<any>((resolve, reject) => {
            const process = spawn(command, args.filter((item) => {
                return item !== '';
            }));
            let stdout: string = '';
            if (pipeLogs === true) {
                process.stdout.on('data', (arrayBuffer) => {
                    const data = Buffer.from(arrayBuffer, 'utf-8').toString().split('\n');
                    data.forEach((item, index) => {
                        if (item !== '') {
                            console.log(colorator(logPrefix + ' ' + item));
                        }
                    });

                });
                process.stderr.on('data', (arrayBuffer) => {
                    const data = Buffer.from(arrayBuffer, 'utf-8').toString().split('\n');
                    data.forEach((item, index) => {
                        if (item !== '') {
                            console.error(item);
                        }
                    });

                });
            } else if (grabStdOut === true) {
                process.stdout.on('data', (arrayBuffer) => {
                    const data = Buffer.from(arrayBuffer, 'utf-8').toString().split('\n');
                    data.forEach((item, index) => {
                        if (item !== '') {
                            stdout += item;
                        }
                    });

                });
            }
            processSignalDebug(logPrefix + ':->', process);

            if (wait === true) {
                process.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
                    delete this.subProcesses[logPrefix.replace(/\s/g, '-')];
                    if ((code === 0 || code === 1) && wait === true) {
                        resolve(stdout);
                    } else if (signal === 'SIGINT') {
                        resolve('{}');
                    } else {
                        reject(new Error('command failed. Code: ' + code));
                    }
                });
            } else {
                this.subProcesses[logPrefix.replace(/\s/g, '-')] = process;
                resolve();
            }

        });
    }
}

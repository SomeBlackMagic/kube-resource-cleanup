import {processSignalDebug} from './Helpers';
import {spawn} from 'child_process';
const cliColor = require('cli-color');

export class NewChildProcessOptionsDefaultValue implements NewChildProcessOptions {
    wait: boolean = false;
    grabStdOut: boolean = false;
    pipeLogs: boolean = false;
    logPrefix: string = '';
    logColor: string = 'white';
    attachToResult: any = {};
}

export interface NewChildProcessOptions {
    wait?: boolean;
    grabStdOut?: boolean;
    parseResult?: 'no' | 'json';
    pipeLogs?: boolean;
    logPrefix?: string;
    logColor?: string;
    attachToResult?: object;
}

export class ProcessHelper {
    public exitHandler: Function;


    public subscribeOnProcessExit(): void {


        /*do something when app is closing*/
        // process.on('exit', this.exitHandler.bind(null, {cleanup: true, code:'exit'}));

        /*catches ctrl+c event*/
        process.on('close', this.exitHandler.bind(null, {code: 'close'}));
        process.on('SIGINT', this.exitHandler.bind(null, {code: 'SIGINT'}));
        process.on('SIGQUIT', this.exitHandler.bind(null, {code: 'SIGQUIT'}));

        /*catches "kill pid" (for example: nodemon restart)*/
        process.on('SIGUSR1', this.exitHandler.bind(null, {code: 'SIGUSR1'}));
        process.on('SIGUSR2', this.exitHandler.bind(null, {code: 'SIGUSR2'}));
        process.on('SIGTERM', this.exitHandler.bind(null, {code: 'SIGTERM'}));

        /*catches uncaught exceptions*/
        process.on('uncaughtException', this.uncaughtExceptionHandler);
        process.on('unhandledRejection', this.uncaughtRejectionHandler);
    }

    public setExitHandler(cb: Function): void {
        this.exitHandler = cb;
    }


    public uncaughtExceptionHandler(error: Error) {
        console.error('Helm Assistant: Uncaught Exception');
        console.error('-----------------------------------');
        console.error(error.message, error.stack, error.name);
        console.error('-----------------------------------');
        process.emit('SIGTERM');

    }

    public uncaughtRejectionHandler(reason: {} | null | undefined, promise: Promise<any>) {
        console.error('Helm Assistant: Uncaught Rejection');
        console.error('-----------------------------------');
        if (typeof reason !== 'undefined') {
            console.error(reason['message']);
            console.error(reason['stack']);
        } else {
            console.log(JSON.stringify(reason));
        }
        console.error('-----------------------------------');
        process.emit('SIGTERM');

    }

    public static async createChildProcess(command: string, args: string[], options: NewChildProcessOptions = new NewChildProcessOptionsDefaultValue()) {
        let colorator;
        switch (options.logColor) {
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
            if (options.pipeLogs === true) {
                process.stdout.on('data', (arrayBuffer) => {
                    const data = Buffer.from(arrayBuffer, 'utf-8').toString().split('\n');
                    data.forEach((item, index) => {
                        if (item !== '') {
                            console.log(colorator(options.logPrefix + ' ' + item));
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
            } else if (options.grabStdOut === true) {
                process.stdout.on('data', (arrayBuffer) => {
                    const data = Buffer.from(arrayBuffer, 'utf-8').toString().split('\n');
                    data.forEach((item, index) => {
                        if (item !== '') {
                            stdout += item;
                        }
                    });

                });
            }
            processSignalDebug(options.logPrefix + ':->', process);

            if (options.wait === true || options.grabStdOut === true) {
                process.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
                    if ((code === 0 || code === 1) && (options.wait === true || options.grabStdOut === true)) {
                        if (options.parseResult === 'json') {
                            if (stdout === '') {
                                resolve([]);
                            } else {
                                if (typeof options.attachToResult !== 'undefined') {
                                    resolve(Object.assign({}, JSON.parse(stdout), options.attachToResult));
                                } else {
                                    try {
                                        resolve(JSON.parse(stdout));
                                    }
                                    catch (e) {
                                        reject(new Error('Can not parse output json: ' + stdout));
                                    }
                                }
                            }
                        } else {
                            resolve(stdout);
                        }
                    } else if (signal === 'SIGINT') {
                        resolve('{}');
                    } else {
                        reject(new Error('Command failed. Code: ' + code));
                    }
                });
            } else {
                resolve();
            }

        });
    }

}

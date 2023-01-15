import { loadEnvVariablesFromFile, processSignalDebug } from './Helpers';
import {ProcessHelper} from './ProcessHelper';
import {VersionModule} from './Modules/VersionModule';
import {RemoverModule} from './Modules/RemoverModule';
import * as console from 'console';

loadEnvVariablesFromFile();


const removerModule = new RemoverModule();
const versionModule = new VersionModule();
const processHelper = new ProcessHelper();

processHelper.setExitHandler((data: { code: string }) => {
    (async () => {
        console.log('PCNTL signal received. Graceful stop all modules.', [data.code]);
        await Promise.all([removerModule].map((item: any) => {
            return item.stop();
        })).catch((error) => {
            console.log('Can not stop services', error);
            process.exitCode = 1;
        });
        console.log('System gracefully stopped');
        // @ts-ignore
        // await process.flushLogs();
    })();
});
processHelper.subscribeOnProcessExit();

(async () => {
    const processArgs = process.argv.slice(2);
    switch (processArgs[0]) {
        case 'remove-by-args':
            await removerModule.run(processArgs);
            break;
        case 'version':
            await versionModule.run(processArgs);
            break;
    }


    processHelper.exitHandler({code: 'exit'});

})();



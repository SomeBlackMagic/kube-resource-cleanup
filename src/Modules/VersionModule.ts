import {ConfigFactory} from '../Config/app-config';

export class VersionModule {
    public async run(cliArgs: string[]) {
        console.log(ConfigFactory.getBase().id + ': ' + ConfigFactory.getBase().version);
        return Promise.resolve();

    }

}

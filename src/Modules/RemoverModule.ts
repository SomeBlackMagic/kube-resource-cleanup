import {ProcessHelper} from '../ProcessHelper';
import {ConfigFactory} from '../Config/app-config';
import KubeProcessHelper from '../KubeProcessHelper';

export class RemoverModule {

    public async run(cliArgs: string[]) {
        const gitlabProjectName: string = cliArgs[1];
        const gitlabProjectBranch: string = cliArgs[2];
        console.log('Start search helm releases');
        let realiseList: HelmListItem[] = await KubeProcessHelper.helm(
            [
                'ls',
                '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
                '--output',
                'json'
            ],
            {
                grabStdOut: true,
                parseResult: 'json',
            }
        );
        console.log('Found: ' + realiseList.length);

        if (realiseList.length !== 0) {
            console.log('Get information about all items');
            const promiseList = realiseList.map((item) => {
                return KubeProcessHelper.helm([
                        'get', 'values',
                        item.name,
                        '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
                        '-o', 'json'
                    ],
                    {
                        grabStdOut: true,
                        parseResult: 'json',
                        attachToResult: {
                            helmReleaseName: item.name
                        }
                    }
                );
            });
            const realisesList = await Promise.all(promiseList);

            const deletedRealisesPromiseList = realisesList.map((item) => {
                return new Promise<any>((resolve, reject) => {
                        if (typeof item === 'object') {
                            const releaseGitlabProjectName = item?.metadata?.gitlabProjectName;
                            const releaseGitlabProjectBranch = item?.metadata?.gitlabProjectBranch;
                            if (typeof releaseGitlabProjectName === 'undefined' || typeof releaseGitlabProjectBranch === 'undefined') {
                                resolve({
                                    helmReleaseName: item.helmReleaseName,
                                    status: false,
                                    reason: 'Gitlab labels not found. Skip'
                                });
                                return;
                            }
                            if (
                                releaseGitlabProjectName === gitlabProjectName &&
                                releaseGitlabProjectBranch === gitlabProjectBranch
                            ) {
                                // console.log('Candidate to remove');
                                KubeProcessHelper.helm(
                                    [
                                        'uninstall',
                                        '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
                                        item.helmReleaseName
                                    ],
                                    {
                                        grabStdOut: true,
                                    }
                                ).then((data) => {
                                    resolve({helmReleaseName: item.helmReleaseName, status: true, reason: data});
                                });
                            } else {
                                // console.log('Skip this release');
                                resolve({
                                    helmReleaseName: item.helmReleaseName,
                                    status: false,
                                    reason: 'doesn\'t meet required'
                                });
                            }
                        } else {
                            // console.log('This realise not have values');
                            resolve({
                                helmReleaseName: item.helmReleaseName,
                                status: false,
                                reason: 'This realise not have values'
                            });
                        }

                    }
                );
            });
            const status = await Promise.all(deletedRealisesPromiseList);
            console.log('-----------------------------');
            console.log(status);
            console.log('-----------------------------');
            realiseList = await KubeProcessHelper.helm(
                [
                    'ls',
                    '--namespace', ConfigFactory.getCore().KUBE_NAMESPACE,
                    '--output',
                    'json'
                ],
                {
                    grabStdOut: true,
                    parseResult: 'json',
                }
            );
        }


        if (realiseList.length === 0) {
            const result = await KubeProcessHelper.kubectl([
                'delete', 'namespace', ConfigFactory.getCore().KUBE_NAMESPACE
            ], {wait: true, grabStdOut: true});
            console.log('delete namespace status: ' + JSON.stringify(result));
        } else {
            console.log('After cleaning in namespace exist other releases');
        }
    }

    public async stop(): Promise<any> {
        return Promise.resolve();
    }
}

interface HelmListItem {
    name: string;
    namespace: string;
    revision: number;
    updated: string;
    status: string;
    chart: string;
    app_version: string;
}

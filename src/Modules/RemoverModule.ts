import {ProcessHelper} from '../ProcessHelper';
import {ConfigFactory} from '../Config/app-config';
import KubeProcessHelper from '../KubeProcessHelper';

export class RemoverModule {

    public async run(cliArgs: string[]) {
        const gitlabProjectName: string = cliArgs[1];
        const gitlabProjectBranch: string = cliArgs[2];
        console.log('[kube-resource-cleanup] Start search helm releases');
        console.log('[kube-resource-cleanup] Namespace: ' + ConfigFactory.getCore().KUBE_NAMESPACE);
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
        console.log('[kube-resource-cleanup] Found: ' + realiseList.length);

        if (realiseList.length !== 0) {
            console.log('[kube-resource-cleanup] Get information about all items');
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
            if (ConfigFactory.getCore().KUBE_CLEANER_FORCE_CLEAN_ALL === true) {
                console.log('[kube-resource-cleanup] KUBE_CLEANER_FORCE_CLEAN_ALL - true');
                console.log('[kube-resource-cleanup] Remove all helm releases');
            }
            const deletedRealisesPromiseList = realisesList.map((item) => {
                return new Promise<any>((resolve, reject) => {
                        if (ConfigFactory.getCore().KUBE_CLEANER_FORCE_CLEAN_ALL === true) {
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
                        }
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
            console.log('[kube-resource-cleanup] -----------------------------');
            console.log(status);
            console.log('[kube-resource-cleanup] -----------------------------');
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
            console.log('[kube-resource-cleanup] delete namespace status: ' + JSON.stringify(result));
        } else {
            console.log('[kube-resource-cleanup] After cleaning in namespace exist other releases');
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

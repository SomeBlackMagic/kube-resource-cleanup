# Helm Assistant

[![NodeJS build App](https://github.com/SomeBlackMagic/kube-resource-cleanup/actions/workflows/npm-build-app.yml/badge.svg)](https://github.com/SomeBlackMagic/kube-resource-cleanup/actions/workflows/npm-build-app.yml)

This project is a helm wrapper to fix some bugs:
* https://github.com/helm/helm/issues/3481
* https://github.com/helm/helm/issues/9285

When you run kube-resource-cleanup upgrade <some arguments> application run new sub process ```helm upgrade <some arguments>```, pipe logs 
and also run kubectl process for grab additional data about deployment.
Also if you run deployment with flag --wait-for-jobs application check deployed job, and if status if `Failed` 
application send helm signal to revert realise

## How to install
```
wget https://github.com/SomeBlackMagic/kube-resource-cleanup/releases/latest/download/kube-resource-cleanup-linux-amd64
chmod +x kube-resource-cleanup-linux-amd64
mv kube-resource-cleanup-linux-amd64 /usr/local/bin/kube-resource-cleanup
```

## How to use

### Set base variables to correct work
```
export KUBE_NAMESPACE=deafult
```

Also set access credentials for helm and kubectl if needed
```
export HELM_CMD_ARGS="--kubeconfig /root/.kube/some-cluster.yaml"
export KUBECTL_CMD_ARGS="--kubeconfig /root/.kube/some-cluster.yaml"
```
### Enabled feature
```
export HELM_ASSISTANT_UPGRADE_PIPE_LOGS=true
export HELM_ASSISTANT_UPGRADE_JOB_STRICT=true
```
### Run upgrade any chart
```
kube-resource-cleanup upgrade \
    --install kube-resource-cleanup-demo-deployment \
    --namespace ${KUBE_NAMESPACE} \
    --atomic \
    --debug \
    --wait \
    ./test/charts/worker
```
Warning: install argument must be first in arguments list because application grabs release name from cil args
(first argument after upgrade and without "--")
### Example output
[Text format](docs/example_log.txt)

[Image](docs/example_log.png)


Todolist:
* implement logs filter(https://github.com/helm/helm/issues/7275)

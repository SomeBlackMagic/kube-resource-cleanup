# Kube Resource Cleanup

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

### Run upgrade any chart
```
kube-resource-cleanup remove-by-args ${CI_PROJECT_PATH} ${CI_COMMIT_REF_NAME}
```

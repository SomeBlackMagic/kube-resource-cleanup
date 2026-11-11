# Kube Resource Cleanup

A small CLI tool that removes Helm releases created by a CI pipeline (e.g. review / feature-branch environments)
and deletes the Kubernetes namespace once nothing else is left in it.

Releases are matched by metadata stored in the release **values**:

```yaml
metadata:
  gitlabProjectName: group/my-project   # e.g. ${CI_PROJECT_PATH}
  gitlabProjectBranch: feature-123      # e.g. ${CI_COMMIT_REF_NAME}
```

## How it works

1. Checks that the namespace passed via `--namespace` exists (`kubectl get namespace`).
   If it does not exist, the tool exits with code `0` — nothing to clean.
2. Lists Helm releases in the namespace (`helm ls --namespace <ns> --output json`).
3. For every release reads its values (`helm get values <release> --namespace <ns> -o json`)
   and compares `metadata.gitlabProjectName` / `metadata.gitlabProjectBranch` with the
   positional arguments (surrounding whitespace is trimmed).
4. Matching releases are uninstalled (`helm uninstall`). Non-matching releases are kept.
5. If no releases remain in the namespace (including the case when it had no releases at all),
   the namespace itself is deleted (`kubectl delete namespace <ns>`).

## Requirements

- `helm` (v3) and `kubectl` available in `PATH`.
- Access to the cluster. Both tools are called with the tool's environment, so use the
  standard `KUBECONFIG` variable (or `~/.kube/config`) to point them at the right cluster.

## How to install

### Binary (Linux amd64)

```bash
wget https://github.com/SomeBlackMagic/kube-resource-cleanup/releases/latest/download/kube-resource-cleanup-linux-amd64
chmod +x kube-resource-cleanup-linux-amd64
mv kube-resource-cleanup-linux-amd64 /usr/local/bin/kube-resource-cleanup
```

### Build from source

Requires Go 1.23+.

```bash
git clone https://github.com/SomeBlackMagic/kube-resource-cleanup.git
cd kube-resource-cleanup
CGO_ENABLED=0 go build -o kube-resource-cleanup .
```

## Usage

```
kube-resource-cleanup [--dry-run] --namespace <namespace> <gitlabProjectName> <gitlabProjectBranch>
```

> **Note:** flags must be placed **before** the positional arguments
> (standard Go `flag` parsing stops at the first non-flag argument).

### Flags

| Flag                 | Required | Description                                                                 |
|----------------------|----------|-----------------------------------------------------------------------------|
| `--namespace <name>` | yes      | Kubernetes namespace to clean up.                                           |
| `--dry-run`          | no       | Only log what would be uninstalled / deleted, do not change anything.       |

### Positional arguments

| Argument              | Description                                                         |
|-----------------------|---------------------------------------------------------------------|
| `gitlabProjectName`   | Value compared with `metadata.gitlabProjectName` in release values.  |
| `gitlabProjectBranch` | Value compared with `metadata.gitlabProjectBranch` in release values.|

### Environment variables

| Variable                       | Description                                                                                           |
|--------------------------------|-------------------------------------------------------------------------------------------------------|
| `KUBE_CLEANER_FORCE_CLEAN_ALL` | When set to `true`, **every** release in the namespace is uninstalled regardless of metadata, and then the namespace is deleted. Positional arguments are still required but ignored. |
| `KUBECONFIG`                   | Standard variable used by `helm` and `kubectl` to locate the cluster config.                          |

## Examples

### Clean up releases of a project branch

```bash
kube-resource-cleanup --namespace review-feature-123 group/my-project feature-123
```

### Dry run first

```bash
kube-resource-cleanup --dry-run --namespace review-feature-123 group/my-project feature-123
```

Output contains lines like:

```
[dry-run] Would uninstall: my-project-feature-123
[dry-run] Would delete namespace: review-feature-123
```

### Use a specific cluster

```bash
export KUBECONFIG=/root/.kube/some-cluster.yaml
kube-resource-cleanup --namespace review-feature-123 group/my-project feature-123
```

### Remove everything in a namespace

```bash
KUBE_CLEANER_FORCE_CLEAN_ALL=true kube-resource-cleanup --namespace review-feature-123 any any
```

### Deploy a release with the required metadata

The tool only recognizes releases that carry the metadata in their values, so set it on deploy:

```bash
helm upgrade --install "my-project-${CI_COMMIT_REF_SLUG}" ./chart \
  --namespace "review-${CI_COMMIT_REF_SLUG}" --create-namespace \
  --set-string metadata.gitlabProjectName="${CI_PROJECT_PATH}" \
  --set-string metadata.gitlabProjectBranch="${CI_COMMIT_REF_NAME}"
```

### GitLab CI: stop a review environment

```yaml
deploy_review:
  stage: deploy
  script:
    - helm upgrade --install "my-project-${CI_COMMIT_REF_SLUG}" ./chart
        --namespace "review-${CI_COMMIT_REF_SLUG}" --create-namespace
        --set-string metadata.gitlabProjectName="${CI_PROJECT_PATH}"
        --set-string metadata.gitlabProjectBranch="${CI_COMMIT_REF_NAME}"
  environment:
    name: review/${CI_COMMIT_REF_NAME}
    on_stop: stop_review

stop_review:
  stage: deploy
  variables:
    GIT_STRATEGY: none
  script:
    - kube-resource-cleanup --namespace "review-${CI_COMMIT_REF_SLUG}" "${CI_PROJECT_PATH}" "${CI_COMMIT_REF_NAME}"
  environment:
    name: review/${CI_COMMIT_REF_NAME}
    action: stop
  when: manual
```

## Notes

- If `helm get values` fails for a release, it is treated as non-matching and kept
  (so the namespace is not deleted).
- `helm ls` is called without `--all`, so only releases Helm lists by default
  (deployed / failed) are considered.
- Logs are written by `zap` in development mode, including debug lines with every executed command.

## Docker image

On every `v*.*.*` tag a Docker image is published to `ghcr.io/someblackmagic/kube-resource-cleanup`.
The image is based on `alpine` and contains only the binary — `helm` and `kubectl` are **not** included,
so use it as a base or copy the binary into an image that already has them.

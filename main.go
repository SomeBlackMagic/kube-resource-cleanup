package main

import (
	"encoding/json"
	"flag"
	"go.uber.org/zap"
	"log"
	"os"
	"os/exec"
	"strings"
)

type Config struct {
	KubeNamespace         string
	KubeCleanerForceClean bool
	DryRun                bool
	Logger                *zap.SugaredLogger
}

type HelmListItem struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   string `json:"revision"`
	Updated    string `json:"updated"`
	Status     string `json:"status"`
	Chart      string `json:"chart"`
	AppVersion string `json:"app_version"`
}

type HelmValuesMetadata struct {
	Metadata struct {
		GitlabProjectName   string `json:"gitlabProjectName"`
		GitlabProjectBranch string `json:"gitlabProjectBranch"`
	} `json:"metadata"`
}

func main() {
	dryRun := flag.Bool("dry-run", false, "Perform a trial run without changes")
	namespace := flag.String("namespace", "", "Target Kubernetes namespace")
	flag.Parse()

	args := flag.Args()
	if len(args) < 2 || *namespace == "" {
		log.Fatal("Usage: remover [--dry-run] --namespace <namespace> <gitlabProjectName> <gitlabProjectBranch>")
	}

	var zapLogger *zap.Logger
	var err error
	zapLogger, err = zap.NewDevelopment()

	if err != nil {
		log.Fatalf("can't initialize zap logger: %v", err)
	}
	logger := zapLogger.Sugar()
	defer logger.Sync()

	projectName := args[0]
	projectBranch := args[1]

	config := Config{
		KubeNamespace:         *namespace,
		KubeCleanerForceClean: os.Getenv("KUBE_CLEANER_FORCE_CLEAN_ALL") == "true",
		DryRun:                *dryRun,
		Logger:                logger,
	}

	logger.Infof("[kube-resource-cleanup] Verifying namespace: %s", config.KubeNamespace)
	if !checkNamespaceExists(config) {
		logger.Infof("Namespace %s does not exist", config.KubeNamespace)
		os.Exit(0)
	}

	logger.Infof("[kube-resource-cleanup] Start search helm releases")
	logger.Infof("[kube-resource-cleanup] Namespace: %s", config.KubeNamespace)

	releases := helmList(config)
	logger.Infof("[kube-resource-cleanup] Found: %d", len(releases))

	var remainingReleases []HelmListItem

	for _, release := range releases {
		values := helmGetValues(config, release.Name)
		if config.KubeCleanerForceClean {
			logger.Infof("[kube-resource-cleanup] Force cleaning enabled, deleting: %s", release.Name)
			helmuninstall(config, release.Name)
			continue
		}

		if values.Metadata.GitlabProjectName == projectName &&
			values.Metadata.GitlabProjectBranch == projectBranch {
			logger.Infof("[kube-resource-cleanup] Deleting matching release: %s", release.Name)
			helmuninstall(config, release.Name)
		} else {
			logger.Infof("[kube-resource-cleanup] helm release with meta %s %s is not mutch", values.Metadata.GitlabProjectName, values.Metadata.GitlabProjectBranch)
			remainingReleases = append(remainingReleases, release)
		}
	}

	if len(remainingReleases) == 0 {
		logger.Infof("[kube-resource-cleanup] Namespace empty. Deleting namespace: %s", config.KubeNamespace)
		kubectlDeleteNamespace(config)
	} else {
		logger.Infof("[kube-resource-cleanup] After cleaning in namespace exist other releases")
	}
}

func runCommand(config Config, name string, args ...string) ([]byte, error) {
	config.Logger.Debugf("Running command: %s %s", name, strings.Join(args, " "))
	cmd := exec.Command(name, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		config.Logger.Errorf("Command '%s %s' failed: %v\nOutput: %s", name, strings.Join(args, " "), err, string(output))
		return nil, err
	}
	return output, nil
}

func helmList(config Config) []HelmListItem {
	output, err := runCommand(config, "helm", "ls", "--namespace", config.KubeNamespace, "--output", "json")
	if err != nil {
		config.Logger.Fatalf("Failed to list helm releases: %v", err)
	}
	var list []HelmListItem
	if err := json.Unmarshal(output, &list); err != nil {
		config.Logger.Fatalf("Failed to parse helm list JSON: %v", err)
	}
	return list
}

func helmGetValues(config Config, name string) HelmValuesMetadata {
	output, err := runCommand(config, "helm", "get", "values", name, "--namespace", config.KubeNamespace, "-o", "json")
	if err != nil {
		return HelmValuesMetadata{}
	}
	var values HelmValuesMetadata
	_ = json.Unmarshal(output, &values)
	values.Metadata.GitlabProjectName = strings.TrimSpace(values.Metadata.GitlabProjectName)
	values.Metadata.GitlabProjectBranch = strings.TrimSpace(values.Metadata.GitlabProjectBranch)
	return values
}

func helmuninstall(config Config, name string) {
	if config.DryRun {
		config.Logger.Infof("[dry-run] Would uninstall: %s", name)
		return
	}
	_, err := runCommand(config, "helm", "uninstall", name, "--namespace", config.KubeNamespace)
	if err != nil {
		config.Logger.Errorf("Failed to uninstall release %s: %v", name, err)
	}
}

func kubectlDeleteNamespace(config Config) {
	if config.DryRun {
		config.Logger.Infof("[dry-run] Would delete namespace: %s", config.KubeNamespace)
		return
	}
	_, err := runCommand(config, "kubectl", "delete", "namespace", config.KubeNamespace)
	if err != nil {
		config.Logger.Errorf("Failed to delete namespace %s: %v", config.KubeNamespace, err)
	}
}

func checkNamespaceExists(config Config) bool {
	_, err := runCommand(config, "kubectl", "get", "namespace", config.KubeNamespace)
	return err == nil
}

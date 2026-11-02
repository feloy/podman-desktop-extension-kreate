# Kreate: Podman Desktop Extension

The Kreate extension for Podman Desktop provides utilities to help developers create manifests for Kubernetes resources.

## Templates

The user can use templates to create various Kubernetes resources. The user fills the form
for a specific resource type, and the YAML manifest to create the resource is displayed. The user
can then update the YAML manifest if necessary, before to apply this YAML manifest to the current Kubernetes context.

The standard forms provided by Kreate are based on the commands `kubectl create ...`.

![Create a Pod with a Form](./kreate-02-create-pod.gif)

## Explain

When the user is editing the Kubernetes manifest for a resource, the documentation
for the resource being edited is displayed, focusing on the part of the manifest being edited.

Demo after using a Deployment form:

![Explain Deployment](./kreate-03-explain.gif)

## Extending forms

Kreate is extensible and you can provide your own commands with their own arguments
and flags.

The format to define a new command is:

```
{
  "name": "resource-name",
  "args": [
    {
      "name": "name",
      "label": "Name",
      "description": "Name of the resource to create",
      "required": true
    }
  ],
  "options": [
    {
      "flag": "--flag1",
      "label": "Flag 1",
      "description": "Description of flag 1",
      "type": "file",
      "multiple": false
    }
  ],
  "cli": [
    "mycli",
    "create",
    "resource-name",
    "--dry-run=client",
    "-o",
    "yaml"
  ]
}
```

The `.name` value will be displayed in the GUI, in the dropdown menu in which the user can select
which resource he wants to create.

The `args` are the manadory parameters added to the command (without flags), and are always of type `string`.

The `options` are the flags provided by the command. They can be of different types:

- `string`: a string value (single or multiple)
- `password`: a string value, which will be hidden in the UI
- `number`: a numeric value, with a default value
- `file`: a file path, the UI providing a dialog to select a file (single or multiple)
- `key-value`: a key/value pair (multiple)
- `key-fileOrDirectory`: a key and a file or directory (used by `kubectl create configmap --from-file`) (multiple)

The `repeatFlag` attribute for an option indicates if the flag must be repeated in the command line, for example `cli --flag1 value1 --flag1 value2`.

## Install

![Install Kreate extension](./kreate-01-install.gif)

You can install the extension by providing the following OCI image in the **Install Custom Extension** form (accessible from `Podman Desktop > Extensions > Install Custom...`):

OCI Image for nightly build: `ghcr.io/podman-desktop/extension-kreate:nightly`

## End-to-end tests

The Playwright suite in `tests/playwright` runs Kreate inside Podman Desktop against an
`envtest-start` Kubernetes API. It checks extension activation, template-based ConfigMap
and Secret generation, YAML editing, validation errors, multi-resource manifests, and
the resources applied to the cluster. It also checks template error recovery while
creating a Namespace, resource discovery when creating a Pod, and the resource
specification shown beside the YAML editor as its cursor moves.

For a local run, install Podman Desktop, `kubectl`, `envtest-start`, and the Kubernetes
test binaries from `setup-envtest`. Start `envtest-start` with a temporary kubeconfig
output, then set `E2E_KUBECONFIG` to that path and `KUBEBUILDER_ASSETS` to the directory
containing `kubectl`. Run `pnpm install` and `pnpm test:e2e`. Set
`EXTENSION_OCI_IMAGE` to test a particular published image. To use an extension
already placed in the Playwright runner's `kreate-tests/plugins/kreate` directory,
set `EXTENSION_PREINSTALLED=true` and `SKIP_INSTALLATION=true`.

The pull request workflow builds the current extension and runs the tests on Windows,
Linux, and macOS. It uploads test reports and runner artifacts for each platform.

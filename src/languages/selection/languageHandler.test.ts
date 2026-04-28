import {
  chooseLanguageImplementation,
  detectLanguageId,
  getResourceContextExtractKind,
  isOrlScannableLanguageFile,
  mapLanguageIdToOrlLanguage,
} from './languageHandler';

describe('isOrlScannableLanguageFile', () => {
  it('matches ORL staging expectations for common basenames (no content)', () => {
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.tf', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'template.yaml', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'config.yml', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'template.json', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({
        filePath: 'cloudformation.json',
        content: '',
      })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'stack.json', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'app.py', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'Main.java', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.bicep', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'script.sh', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.c', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.cpp', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'Program.cs', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'styles.css', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'service.ex', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.go', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'template.tmpl', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'app.groovy', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'app.js', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'app.ts', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'data.json', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'App.kt', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.hcl', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'Chart.yaml', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'index.html', content: '' })
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.lua', content: '' })
    ).toBe(true);
  });

  it('rejects non-ORL files', () => {
    expect(
      isOrlScannableLanguageFile({ filePath: 'README.md', content: '' })
    ).toBe(false);
  });
});

describe('getResourceContextExtractKind', () => {
  it('delegates to the matched handler', () => {
    expect(
      getResourceContextExtractKind({
        filePath: '/workspace/main.tf',
        content: 'resource "x" "y" {}',
      })
    ).toBe('terraform');
    expect(
      getResourceContextExtractKind({
        filePath: '/workspace/Dockerfile',
        content: 'FROM scratch',
      })
    ).toBe('dockerfile');
    expect(
      getResourceContextExtractKind({
        filePath: '/workspace/service.py',
        content: 'def f():\n  pass',
      })
    ).toBe('unknown');
  });
});

describe('languageHandler selector', () => {
  it('detects dockerfile and maps to ORL docker', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/Dockerfile',
      content: 'FROM node:20',
    });
    expect(languageId).toBe('dockerfile');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/Dockerfile',
      })
    ).toBe('docker');
  });

  it('resolves yaml precedence as helm before kubernetes/cloudformation', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/charts/app/templates/deploy.yaml',
      content: '{{ .Values.image.repository }}',
    });
    expect(languageId).toBe('helm-template');
  });

  it('keeps helm before kubernetes when both yaml signals are present', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/k8s/charts/app/templates/deploy.yaml',
      content: ['apiVersion: apps/v1', 'kind: Deployment'].join('\n'),
    });
    expect(languageId).toBe('helm-template');
  });

  it('detects helm chart yaml files as helm', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/charts/app/Chart.yaml',
      content: ['apiVersion: v2', 'name: app'].join('\n'),
    });
    expect(languageId).toBe('helm');
  });

  it('resolves kubernetes yaml using content markers', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/k8s/deployment.yaml',
      content: ['apiVersion: apps/v1', 'kind: Deployment'].join('\n'),
    });
    expect(languageId).toBe('kubernetes-yaml');
  });

  it('detects cloudformation json templates', () => {
    expect(
      detectLanguageId({
        filePath: '/workspace/template.json',
        content: '{"Resources":{}}',
      })
    ).toBe('cloudformation-json');
  });

  it('returns concrete handler implementation for resolved language', () => {
    const handler = chooseLanguageImplementation({
      filePath: '/workspace/pom.xml',
      content: '<project></project>',
    });
    expect(handler.displayName).toBe('Maven XML');
  });

  it('detects java files and maps to ORL java', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/src/App.java',
      content: 'public class App {}',
    });
    expect(languageId).toBe('java');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/src/App.java',
      })
    ).toBe('java');
  });

  it('detects bicep files and maps to ORL bicep', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/main.bicep',
      content:
        "resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {}",
    });
    expect(languageId).toBe('bicep');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/main.bicep',
      })
    ).toBe('bicep');
  });

  it('detects python files and maps to ORL python', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/service.py',
      content: ['def handler():', '    return True'].join('\n'),
    });
    expect(languageId).toBe('python');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/service.py',
      })
    ).toBe('python');
  });

  it('detects bash files and maps to ORL bash', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/script.sh',
      content: ['#!/usr/bin/env bash', 'echo ok'].join('\n'),
    });
    expect(languageId).toBe('bash');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/script.sh',
      })
    ).toBe('bash');
  });

  it('detects c files and maps to ORL c', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/main.c',
      content: ['int main(void) {', '  return 0;', '}'].join('\n'),
    });
    expect(languageId).toBe('c');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/main.c',
      })
    ).toBe('c');
  });

  it('detects cpp files and maps to ORL cpp', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/main.cpp',
      content: ['int helper() {', '  return 1;', '}'].join('\n'),
    });
    expect(languageId).toBe('cpp');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/main.cpp',
      })
    ).toBe('cpp');
  });

  it('detects csharp files and maps to ORL csharp', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/Program.cs',
      content: [
        'public class Program {',
        '  public static void Main() {}',
        '}',
      ].join('\n'),
    });
    expect(languageId).toBe('csharp');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/Program.cs',
      })
    ).toBe('csharp');
  });

  it('detects css files and maps to ORL css', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/styles.css',
      content: ['.container {', '  color: red;', '}'].join('\n'),
    });
    expect(languageId).toBe('css');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/styles.css',
      })
    ).toBe('css');
  });

  it('detects elixir files and maps to ORL elixir', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/service.ex',
      content: ['defmodule Demo.Service do', 'end'].join('\n'),
    });
    expect(languageId).toBe('elixir');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/service.ex',
      })
    ).toBe('elixir');
  });

  it('detects go files and maps to ORL go', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/main.go',
      content: ['package main', 'func main() {}'].join('\n'),
    });
    expect(languageId).toBe('go');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/main.go',
      })
    ).toBe('go');
  });

  it('detects gotemplate files and maps to ORL gotemplate', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/template.tmpl',
      content: ['{{ define "name" }}', 'hello', '{{ end }}'].join('\n'),
    });
    expect(languageId).toBe('gotemplate');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/template.tmpl',
      })
    ).toBe('gotemplate');
  });

  it('detects groovy files and maps to ORL groovy', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/app.groovy',
      content: ['class App {', '}'].join('\n'),
    });
    expect(languageId).toBe('groovy');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/app.groovy',
      })
    ).toBe('groovy');
  });

  it('detects javascript files and maps to ORL javascript', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/app.js',
      content: ['function run() {', '  return true;', '}'].join('\n'),
    });
    expect(languageId).toBe('javascript');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/app.js',
      })
    ).toBe('javascript');
  });

  it('detects typescript files and maps to ORL typescript', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/app.ts',
      content: ['function run(): boolean {', '  return true;', '}'].join('\n'),
    });
    expect(languageId).toBe('typescript');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/app.ts',
      })
    ).toBe('typescript');
  });

  it('detects non-cloudformation json files as json and maps to ORL json', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/tsconfig.json',
      content: '{"compilerOptions":{"strict":true}}',
    });
    expect(languageId).toBe('json');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/tsconfig.json',
      })
    ).toBe('json');
  });

  it('detects kotlin files and maps to ORL kotlin', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/App.kt',
      content: ['class App {', '}'].join('\n'),
    });
    expect(languageId).toBe('kotlin');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/App.kt',
      })
    ).toBe('kotlin');
  });

  it('detects hcl files and maps to ORL hcl', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/main.hcl',
      content: ['locals {', '  env = "dev"', '}'].join('\n'),
    });
    expect(languageId).toBe('hcl');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/main.hcl',
      })
    ).toBe('hcl');
  });

  it('detects helm chart yaml and maps to ORL helm', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/charts/app/Chart.yaml',
      content: ['apiVersion: v2', 'name: app'].join('\n'),
    });
    expect(languageId).toBe('helm');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/charts/app/Chart.yaml',
      })
    ).toBe('helm');
  });

  it('detects html files and maps to ORL html', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/index.html',
      content: ['<html>', '</html>'].join('\n'),
    });
    expect(languageId).toBe('html');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/index.html',
      })
    ).toBe('html');
  });

  it('detects lua files and maps to ORL lua', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/main.lua',
      content: ['function run()', 'end'].join('\n'),
    });
    expect(languageId).toBe('lua');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/main.lua',
      })
    ).toBe('lua');
  });

  it('returns concrete handler implementation for java, bicep, python, bash, cpp, c, csharp, css, elixir, go, gotemplate, groovy, javascript, typescript, json, kotlin, hcl, helm, html, and lua', () => {
    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/src/App.java',
        content: 'public class App {}',
      }).displayName
    ).toBe('Java');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/main.bicep',
        content: 'param location string = resourceGroup().location',
      }).displayName
    ).toBe('Bicep');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/service.py',
        content: ['def handler():', '    return True'].join('\n'),
      }).displayName
    ).toBe('Python');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/script.sh',
        content: ['#!/usr/bin/env bash', 'echo ok'].join('\n'),
      }).displayName
    ).toBe('Bash');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/main.cpp',
        content: ['int helper() {', '  return 1;', '}'].join('\n'),
      }).displayName
    ).toBe('C++');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/main.c',
        content: ['int main(void) {', '  return 0;', '}'].join('\n'),
      }).displayName
    ).toBe('C');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/Program.cs',
        content: [
          'public class Program {',
          '  public static void Main() {}',
          '}',
        ].join('\n'),
      }).displayName
    ).toBe('C#');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/styles.css',
        content: ['.container {', '  color: red;', '}'].join('\n'),
      }).displayName
    ).toBe('CSS');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/service.ex',
        content: ['defmodule Demo.Service do', 'end'].join('\n'),
      }).displayName
    ).toBe('Elixir');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/main.go',
        content: ['package main', 'func main() {}'].join('\n'),
      }).displayName
    ).toBe('Go');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/template.tmpl',
        content: ['{{ define "name" }}', 'hello', '{{ end }}'].join('\n'),
      }).displayName
    ).toBe('Go Template');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/app.groovy',
        content: ['class App {', '}'].join('\n'),
      }).displayName
    ).toBe('Groovy');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/app.js',
        content: ['function run() {', '}'].join('\n'),
      }).displayName
    ).toBe('JavaScript');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/app.ts',
        content: ['function run(): boolean {', '}'].join('\n'),
      }).displayName
    ).toBe('TypeScript');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/tsconfig.json',
        content: '{"compilerOptions":{"strict":true}}',
      }).displayName
    ).toBe('JSON');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/App.kt',
        content: ['class App {', '}'].join('\n'),
      }).displayName
    ).toBe('Kotlin');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/main.hcl',
        content: ['locals {', '  env = "dev"', '}'].join('\n'),
      }).displayName
    ).toBe('HCL');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/charts/app/Chart.yaml',
        content: ['apiVersion: v2', 'name: app'].join('\n'),
      }).displayName
    ).toBe('Helm');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/index.html',
        content: ['<html>', '</html>'].join('\n'),
      }).displayName
    ).toBe('HTML');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/main.lua',
        content: ['function run()', 'end'].join('\n'),
      }).displayName
    ).toBe('Lua');
  });
});

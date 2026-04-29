/**
 * Handles deciding which language we are going to use
 */

import path from 'path';
import type { ResourceContextExtractKind } from '../types';
import { ILanguage } from '../types';
import {
  TerraformLanguageHandler,
  CloudFormationYamlLanguageHandler,
  CloudFormationJsonLanguageHandler,
  DockerfileLanguageHandler,
  KubernetesYamlLanguageHandler,
  HelmTemplateLanguageHandler,
  MavenXmlLanguageHandler,
  GradleLanguageHandler,
  JavaLanguageHandler,
  BicepLanguageHandler,
  PythonLanguageHandler,
  BashLanguageHandler,
  CLanguageHandler,
  CppLanguageHandler,
  CsharpLanguageHandler,
  CssLanguageHandler,
  ElixirLanguageHandler,
  GoLanguageHandler,
  GoTemplateLanguageHandler,
  GroovyLanguageHandler,
  JavascriptLanguageHandler,
  TypescriptLanguageHandler,
  JsonLanguageHandler,
  KotlinLanguageHandler,
  HclLanguageHandler,
  HelmLanguageHandler,
  HtmlLanguageHandler,
  LuaLanguageHandler,
  MarkdownLanguageHandler,
  OcamlLanguageHandler,
  PhpLanguageHandler,
  ProtobufLanguageHandler,
  RubyLanguageHandler,
  RustLanguageHandler,
  ScalaLanguageHandler,
  SqlLanguageHandler,
  SwiftLanguageHandler,
  TomlLanguageHandler,
  YamlLanguageHandler,
} from '../handlers';

export interface LanguageSelectionArgs {
  filePath: string;
  content: string;
}

const languageHandlerFactories: Array<() => ILanguage> = [
  () => new DockerfileLanguageHandler(),
  () => new TerraformLanguageHandler(),
  () => new HclLanguageHandler(),
  () => new HelmLanguageHandler(),
  () => new HelmTemplateLanguageHandler(),
  () => new CloudFormationJsonLanguageHandler(),
  () => new KubernetesYamlLanguageHandler(),
  () => new CloudFormationYamlLanguageHandler(),
  () => new YamlLanguageHandler(),
  () => new MavenXmlLanguageHandler(),
  () => new GradleLanguageHandler(),
  () => new JavaLanguageHandler(),
  () => new BicepLanguageHandler(),
  () => new PythonLanguageHandler(),
  () => new BashLanguageHandler(),
  () => new CppLanguageHandler(),
  () => new CLanguageHandler(),
  () => new CsharpLanguageHandler(),
  () => new CssLanguageHandler(),
  () => new ElixirLanguageHandler(),
  () => new GoLanguageHandler(),
  () => new GoTemplateLanguageHandler(),
  () => new GroovyLanguageHandler(),
  () => new JavascriptLanguageHandler(),
  () => new TypescriptLanguageHandler(),
  () => new JsonLanguageHandler(),
  () => new KotlinLanguageHandler(),
  () => new HtmlLanguageHandler(),
  () => new LuaLanguageHandler(),
  () => new MarkdownLanguageHandler(),
  () => new OcamlLanguageHandler(),
  () => new PhpLanguageHandler(),
  () => new ProtobufLanguageHandler(),
  () => new RubyLanguageHandler(),
  () => new RustLanguageHandler(),
  () => new ScalaLanguageHandler(),
  () => new SqlLanguageHandler(),
  () => new SwiftLanguageHandler(),
  () => new TomlLanguageHandler(),
];

function findMatchingLanguageHandler(
  args: LanguageSelectionArgs
): ILanguage | null {
  for (const createHandler of languageHandlerFactories) {
    const handler = createHandler();
    if (handler.detectLanguage(args)) {
      return handler;
    }
  }

  return null;
}

export const findMatchingLanguageImplementation = (
  args: LanguageSelectionArgs
): ILanguage | null => {
  return findMatchingLanguageHandler(args);
};

/**
 * Detects the most likely language id for a file path + content pair.
 *
 * Resolution is first-match against {@link languageHandlerFactories} (see that array for
 * the canonical order). Order matters where extensions overlap: e.g. YAML can be Helm,
 * Kubernetes, or CloudFormation. More
 * specific handlers must run before broader fallbacks.
 *
 * Order: dockerfile → terraform → hcl → helm → helm-template → cloudformation-json → kubernetes-yaml →
 * cloudformation-yaml → yaml → maven-xml → gradle → java → bicep → python → bash → cpp → c →
 * csharp → css → elixir → go → gotemplate → groovy → javascript → typescript → json →
 * kotlin → html → lua → markdown → ocaml → php → protobuf → ruby → rust → scala →
 * sql → swift → toml.
 */
export const detectLanguageId = (
  args: LanguageSelectionArgs
): string | null => {
  const handler = findMatchingLanguageHandler(args);
  if (!handler) {
    return null;
  }

  return handler.getDocumentInfo(args).languageId;
};

export const chooseLanguageImplementation = (
  args: LanguageSelectionArgs
): ILanguage => {
  const handler = findMatchingLanguageImplementation(args);
  return handler || new TerraformLanguageHandler();
};

/**
 * Maps internal language IDs to ORL CLI language values.
 */
export const mapLanguageIdToOrlLanguage = (args: {
  languageId: string;
  filePath: string;
}): string | null => {
  const languageId = (args.languageId || '').trim();
  const ext = path.extname(args.filePath || '').toLowerCase();
  switch (languageId) {
    case 'dockerfile':
      return 'docker';
    case 'terraform':
      return ext === '.hcl' ? 'hcl' : 'terraform';
    case 'helm-template':
      return 'helm';
    case 'kubernetes-yaml':
      return 'kubernetes';
    case 'cloudformation-yaml':
      return 'cloudformation-yaml';
    case 'cloudformation-json':
      return 'cloudformation-json';
    case 'maven-xml':
      return 'xml';
    case 'gradle':
      return ext === '.kts' ? 'kotlin' : 'groovy';
    case 'java':
      return 'java';
    case 'bicep':
      return 'bicep';
    case 'python':
      return 'python';
    case 'bash':
      return 'bash';
    case 'cpp':
      return 'cpp';
    case 'c':
      return 'c';
    case 'csharp':
      return 'csharp';
    case 'css':
      return 'css';
    case 'elixir':
      return 'elixir';
    case 'go':
      return 'go';
    case 'gotemplate':
      return 'gotemplate';
    case 'groovy':
      return 'groovy';
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'json':
      return 'json';
    case 'kotlin':
      return 'kotlin';
    case 'hcl':
      return 'hcl';
    case 'helm':
      return 'helm';
    case 'html':
      return 'html';
    case 'lua':
      return 'lua';
    case 'markdown':
      return 'markdown';
    case 'ocaml':
      return 'ocaml';
    case 'php':
      return 'php';
    case 'protobuf':
      return 'protobuf';
    case 'ruby':
      return 'ruby';
    case 'rust':
      return 'rust';
    case 'scala':
      return 'scala';
    case 'sql':
      return 'sql';
    case 'swift':
      return 'swift';
    case 'toml':
      return 'toml';
    case 'yaml':
      return 'yaml';
    default:
      return null;
  }
};

/**
 * True when language handlers recognize the file and it maps to an ORL CLI language.
 * Used for workspace staging (copy/list) when content may be omitted (empty string).
 */
export function isOrlScannableLanguageFile(args: {
  filePath: string;
  content?: string;
}): boolean {
  const filePath = (args.filePath || '').trim();
  if (!filePath) {
    return false;
  }
  const content = args.content ?? '';
  const languageId = detectLanguageId({ filePath, content });
  if (!languageId) {
    return false;
  }
  return mapLanguageIdToOrlLanguage({ languageId, filePath }) !== null;
}

/**
 * Fix-preview context extractor kind for the matched language handler.
 */
export function getResourceContextExtractKind(
  args: LanguageSelectionArgs
): ResourceContextExtractKind {
  const handler = findMatchingLanguageImplementation(args);
  if (!handler) {
    return 'unknown';
  }
  return handler.getResourceContextExtractKind();
}

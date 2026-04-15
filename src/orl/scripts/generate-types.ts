import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaDir = path.resolve(__dirname, '..', 'schema');
const outputDir = path.resolve(__dirname, '..', 'generated-types');

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function decodeJsonPointerToken(token: string): string {
  return decodeURIComponent(token).replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolveLocalRef(root: JsonValue, ref: string): JsonValue {
  const normalizedRef = ref.replace('#/%24defs/', '#/$defs/');
  if (!normalizedRef.startsWith('#/')) {
    throw new Error(`Unsupported ref '${ref}'. Only local refs are supported.`);
  }

  const tokens = normalizedRef.slice(2).split('/').map(decodeJsonPointerToken);
  let current: JsonValue = root;

  for (const token of tokens) {
    if (
      !current ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !(token in current)
    ) {
      throw new Error(`Unable to resolve ref '${ref}' at token '${token}'.`);
    }
    current = current[token];
  }

  return current;
}

function dereferenceSchema(
  node: JsonValue,
  root: JsonValue,
  seenRefs: Set<string> = new Set()
): JsonValue {
  if (Array.isArray(node)) {
    return node.map(item => dereferenceSchema(item, root, seenRefs));
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  if ('$ref' in node && typeof node.$ref === 'string') {
    if (seenRefs.has(node.$ref)) {
      throw new Error(`Circular ref detected for '${node.$ref}'.`);
    }

    const nextSeenRefs = new Set(seenRefs);
    nextSeenRefs.add(node.$ref);

    const referencedNode = resolveLocalRef(root, node.$ref);
    const resolvedRef = dereferenceSchema(referencedNode, root, nextSeenRefs);

    const siblingEntries = Object.entries(node).filter(
      ([key]) => key !== '$ref'
    );
    if (siblingEntries.length === 0) {
      return resolvedRef;
    }

    const siblingNode = Object.fromEntries(siblingEntries) as JsonValue;
    const resolvedSiblings = dereferenceSchema(siblingNode, root, seenRefs);

    if (
      resolvedRef &&
      typeof resolvedRef === 'object' &&
      !Array.isArray(resolvedRef) &&
      resolvedSiblings &&
      typeof resolvedSiblings === 'object' &&
      !Array.isArray(resolvedSiblings)
    ) {
      return { ...resolvedRef, ...resolvedSiblings };
    }

    return resolvedRef;
  }

  const result: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$defs' || key === '$schema' || key === '$id') {
      continue;
    }
    result[key] = dereferenceSchema(value as JsonValue, root, seenRefs);
  }

  return result;
}

async function generateTypes(): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  const files = (await readdir(schemaDir))
    .filter(file => file.endsWith('.json'))
    .sort();

  let hasErrors = false;

  for (const file of files) {
    const inputPath = path.join(schemaDir, file);
    const outputPath = path.join(outputDir, file.replace(/\.json$/u, '.d.ts'));
    const rootTypeName = toPascalCase(file.replace(/\.json$/u, ''));

    try {
      const schema = JSON.parse(await readFile(inputPath, 'utf8')) as JsonValue;
      const resolvedSchema = dereferenceSchema(schema, schema);
      const types = await compile(
        resolvedSchema as Record<string, unknown>,
        rootTypeName
      );
      await writeFile(outputPath, types, 'utf8');
      console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
    } catch (error) {
      hasErrors = true;
      const details = error instanceof Error ? error.message : String(error);
      console.error(`Failed to generate types for ${file}: ${details}`);
    }
  }

  if (hasErrors) {
    process.exitCode = 1;
  }
}

generateTypes().catch(error => {
  const details = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Type generation failed: ${details}\n`);
  process.exitCode = 1;
});

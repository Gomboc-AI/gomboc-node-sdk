# Language Handler Implementations

Tracks where each language in the `Language` enum is implemented and why.

## Tree-Sitter Handlers

Location: `src/languages/tree-sitter/handlers/`

These handlers extend `TreeSitterLanguageHandler` and use AST-based block discovery and
exact-line diagnostic anchoring.

| Language | npm Package | Status |
|---|---|---|
| Python | `tree-sitter-python` | Done |
| Terraform / HCL | `tree-sitter-hcl` | Done |
| CloudFormation YAML | `@tree-sitter-grammars/tree-sitter-yaml` | Done |
| CloudFormation JSON | `tree-sitter-json` | Done |

## Base Handlers (regex-based)

Location: `src/languages/handlers/`

These handlers extend `BaseLanguageHandler`. They stay on the regex-based approach either
because no suitable npm tree-sitter grammar package exists, or because the language's syntax
is simple enough that tree-sitter provides no meaningful benefit.

| Language | Reason |
|---|---|
| Dockerfile | No tree-sitter npm package available |
| Kubernetes YAML | Uses YAML grammar — shares tree-sitter-yaml with CloudFormation YAML; kept separate due to detection logic |
| Helm Template | No tree-sitter package for Go template syntax |
| Maven XML | No tree-sitter XML package with Maven-specific queries |
| Gradle | No tree-sitter Groovy/Gradle npm package |
| Java | Pending migration |
| Bicep | Pending migration |

## Not Yet Implemented

These languages are in the `Language` enum but have no handler in the SDK yet. Implement
as tree-sitter handlers unless noted.

| Language | Notes |
|---|---|
| BASH | `tree-sitter-bash` |
| C | `tree-sitter-c` |
| CPP | `tree-sitter-cpp` |
| CSHARP | `tree-sitter-c-sharp` |
| CSS | `tree-sitter-css` |
| ELIXIR | `tree-sitter-elixir` |
| GO | `tree-sitter-go` |
| GOTEMPLATE | No npm package — use base handler |
| GROOVY | No npm package — use base handler |
| HTML | `tree-sitter-html` |
| JAVASCRIPT | `tree-sitter-javascript` |
| JSON | `tree-sitter-json` |
| KOTLIN | `tree-sitter-kotlin` |
| LUA | `tree-sitter-lua` |
| MARKDOWN | `tree-sitter-markdown` |
| OCAML | `tree-sitter-ocaml` |
| ORL | Internal language — no public grammar, use base handler |
| PHP | `tree-sitter-php` |
| PROTOBUF | `tree-sitter-proto` (verify package name on npm) |
| RUBY | `tree-sitter-ruby` |
| RUST | `tree-sitter-rust` |
| SCALA | `tree-sitter-scala` |
| SQL | `tree-sitter-sql` (verify — multiple dialects exist) |
| SWIFT | `tree-sitter-swift` |
| TOML | `tree-sitter-toml` |
| TYPESCRIPT | `tree-sitter-typescript` |
| XML | `tree-sitter-xml` |
| YAML | `@tree-sitter-grammars/tree-sitter-yaml` |

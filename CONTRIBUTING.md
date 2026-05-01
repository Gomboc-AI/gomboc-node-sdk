# Updating Open API specs

1. Copy the spec from the source service into `openApiClientSpecs/` (replace the existing YAML as appropriate).
2. Run `npm run generate-types`.
3. Adjust any functions in the clients if needed.
4. Make sure lint, format, and tests pass (`npm run lint`, `npm test`).
5. Run `npx changeset`.

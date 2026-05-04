[![Codacy Badge](https://app.codacy.com/project/badge/Grade/3afb387356cb46dd9edc631e2cf66f38)](https://app.codacy.com?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)

# @gomboc-ai/gomboc-node-sdk

TypeScript SDKs for Gomboc services. This repository is intended to grow with additional packages over time; **today it ships the rules service client** (`RulesServiceLoader`, `PoliciesHandler`, `RulesServiceSdk`, and related types) under `src/rulesService/`.

## Developing locally

1. `npm i`
2. `op-inject` to get the env vals
3. `npm run generate-types` to generate the required types from the openapi specs

Once done with your changes, make sure to run `npx changeset` to produce the changeset for a release. 

## Use in another service

Install the package, then create a loader with the end-user’s bearer token, tenant account id, and rules service origin (no `/api` suffix — the SDK adds `/api` and versioned paths).

```bash
npm install @gomboc-ai/gomboc-node-sdk
```

Example: an API route that lists policy sets for the authenticated account (same pattern applies to BFFs, workers, or internal tools).

```ts
import { initRulesServiceLoader } from '@gomboc-ai/gomboc-node-sdk';

export async function listPolicySetsForRequest(req: {
  accessToken: string;
  accountId: string;
}) {
  const loader = await initRulesServiceLoader({
    accessToken: req.accessToken,
    accountId: req.accountId,
    baseUrl: process.env.RULES_SERVICE_BASE_URL!,
    logger: console,
  });

  const page = await loader.getPolicySets(1, 50);
  return page.items;
}
```

`initRulesServiceLoader` creates a fresh `RulesServiceLoader` per call. Swap `getPolicySets` for other loader methods (`getPolicySet`, `createPolicySet`, `getExceptions`, and so on) as needed.

---

# Rules Service — Quick Reference

Portal-side layer over the rules service REST API (`RulesServiceLoader`, `PoliciesHandler`, `RulesServiceSdk`). The backend stores everything as **channels** (name + query + filters + annotations). The UI talks in **PolicySets**, **workspaces**, and **exceptions** — this doc is the mental model for those.

---

## Deprecated filter

Most queries get this clause appended automatically:

`(not (eq $.annotations["deprecated"] "true"))`

So deprecated policies and rules are hidden unless you opt in.

- **`ensureDeprecatedFilter`** in the loader adds it when missing. It is idempotent and knows how to wrap existing `(or …)` / `(and …)` / empty queries.
- **`includeDeprecated: true`** on SDK calls skips adding it when you really need deprecated items.

PolicySet and workspace queries in examples below assume this is already folded in — same idea as in code.

---

## Policy sets

A **PolicySet** is a named bundle of policies (classifications) enforced together.

**Storage:** A channel named `{accountId}/set/{shortName}` with `annotations["gomboc-ai/type"] = "policy-set"`. The channel **`query`** lists enforced policies with `(contains "gomboc-ai/policy/…" finding.classification)` (wrapped in `or` / `and` as needed). Counts like `policiesCount` come from parsing that query.

**Apply to workspaces:** Not stored only on the set — the set is **referenced from** either the account global channel or individual workspace channels (see next section).

**Exceptions:** Do **not** live in the PolicySet query. They are referenced in the PolicySet channel’s **`filters`** array (see Exceptions).

---

## Workspace channels

**Naming:** `{accountId}/wksp/{workspaceId}` per workspace. **`{accountId}/accounts/global`** is the “all workspaces” aggregate.

**How a workspace gets PolicySets:** Its effective config is the workspace channel’s **`query`**, which is typically an `(and …)` of:

1. An `(or …)` of `(channel "{accountId}/set/{name}" true)` — one entry per PolicySet applied to that workspace.
2. The deprecated filter (when not using `includeDeprecated`).

**Two ways to attach sets:**

| Mode                                                       | What gets updated                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apply to all workspaces** (`applyToAllWorkspaces: true`) | PolicySet is referenced from **`{accountId}/accounts/global`**. Workspaces inherit via the global channel, not by listing every `wksp/*` channel.                                                                                     |
| **Specific workspaces**                                    | Each listed workspace’s **`{accountId}/wksp/{id}`** channel query gains or loses a `(channel "…/set/…" true)` in its `or` block. Unlisted workspaces have that reference removed. Missing workspace channels are created when needed. |

Loader helpers: **`attachPolicySetToWorkspaceChannelQuery`** / **`removePolicySetFromWorkspaceChannelQuery`** maintain that `or` / `and` structure.

---

## Exceptions

An **exception** excludes specific **rules** (not whole policies) from enforcement **within** one or more PolicySets.

**Storage:** Channel `{accountId}/exception/{name}`. Its **`query`** targets rules with `(eq $.name "gomboc-ai/rule-…")` (often `or`’d). Annotations **`gomboc-ai/rules`** and **`gomboc-ai/policy-sets`** mirror that for the UI and wiring metadata.

**Wiring (important):** Exceptions are **not** merged into the PolicySet’s `query`. Each PolicySet channel has a **`filters`** array of strings like:

`"(channel \"{accountId}/exception/{name}\" true)"`

At evaluation time the backend **subtracts** anything that matches those filter channels from the set’s enforced rules. Multiple exceptions ⇒ multiple `filters` entries. One exception can list multiple PolicySets in **`gomboc-ai/policy-sets`**; each of those sets gets the corresponding filter line.

**Creates/deletes** that touch both the exception channel and many PolicySet `filters` use the **saga** in the loader so updates roll back together on failure (`SagaRollbackError` if something goes wrong after partial work).

---

## Channel name cheat sheet

| Thing                   | Pattern                          |
| ----------------------- | -------------------------------- |
| PolicySet               | `{accountId}/set/{name}`         |
| Exception               | `{accountId}/exception/{name}`   |
| Workspace               | `{accountId}/wksp/{workspaceId}` |
| Global (all workspaces) | `{accountId}/accounts/global`    |

The portal API uses **short** names (`default`, `EX-001`); the loader expands to full channel names for the SDK.

# Security Policy

This repository is a public pattern kit, not a production runtime.

## Scope

Please report:

- exposed secrets
- unsafe default behaviors
- accidental private-path leakage
- MCP surfaces that expose more than the intended read-only boundary

## Not in scope

- prompt-quality disagreements
- expected limitations of demo-only providers or stubs
- gaps that are already marked as upgrade seams

## Reporting

Open a private security advisory in GitHub for sensitive issues. Do not publish live credentials, tokens, or internal endpoints in issues or pull requests.

## Public repo expectation

This repo should ship with:

- no live secrets
- no machine-local assumptions required for basic demos
- no write-capable MCP surface by default

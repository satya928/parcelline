# SynapseFabric SEO Abilities

A WordPress plugin that exposes blog audit and content tools to Claude over MCP, using the core Abilities API (WordPress 6.9+) and the official [WordPress MCP Adapter](https://github.com/WordPress/mcp-adapter).

## Status

| # | Ability | State |
|---|---------|-------|
| 1 | `synapsefabric-seo/list-posts` | built |
| 2 | `synapsefabric-seo/get-post` | built |
| 3 | `synapsefabric-seo/find-duplicates` | built |
| 4 | `update-post` | planned (write, off by default) |
| 5 | `merge-posts` | planned (write, off by default) |
| 6 | `suggest-internal-links` | planned |
| 7 | `create-draft` | planned (write, off by default, draft only) |

Abilities 1-3 are read-only, so you can audit synapsefabric.com for duplicates before anything can change. All abilities check WordPress capabilities (`edit_posts` for lists, `edit_post` per post). Write abilities will only be registered once an administrator ticks them under **Settings > SynapseFabric SEO**.

## Requirements

WordPress 6.9+, PHP 7.4+, the MCP Adapter plugin (declared via `Requires Plugins: mcp-adapter`).

## Local development (never test on the live site)

Requires Docker and Node.

```bash
cd synapsefabric-seo-abilities
npm install
npm run env:start     # WordPress at http://localhost:8888 (admin / password), installs mcp-adapter, seeds sample posts
npm test              # unit tests for the duplicate engine (plain PHP, no WordPress)
```

`bin/seed-test-content.sh` creates two near-duplicate posts and two unrelated ones; `find-duplicates` should group the first pair. Use `npm run env:reset` to start over. Coding standards: `composer install && composer lint`.

The MCP Adapter zip URL in `.wp-env.json` points at its latest GitHub release; if wp-env can't fetch it, download the plugin manually and list its path instead.

## Connecting Claude

The adapter's default server is at `/wp-json/mcp/mcp-adapter-default-server`. Its remote transport needs a public HTTPS URL, so claude.ai cannot reach `localhost`.

1. On the **staging or live** site, install and activate MCP Adapter and this plugin.
2. Create an Application Password for a dedicated user with the least privilege that works (Users > Profile > Application Passwords). Read-only auditing needs only an Author/Editor.
3. In claude.ai: **Settings > Connectors > Add custom connector**, and enter `https://YOUR-SITE/wp-json/mcp/mcp-adapter-default-server`.
4. Authentication: the adapter's HTTP transport uses WordPress authentication, and claude.ai custom connectors expect OAuth. Verify what your adapter version supports (see the adapter README); if it only offers Application Passwords, you may need an OAuth/proxy layer in front. This step is not yet tested here.
5. Ask Claude to run `find-duplicates` and list the groups.

To test against a local site from your own machine, use the adapter's STDIO transport with WP-CLI (see the adapter docs) in Claude Desktop or Claude Code.

## Uninstall

Deleting the plugin removes its settings and (when present) its redirect table.

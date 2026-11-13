# ui-watchtower

The framework-independent engine behind
[`@absaoss-cps/ngx-ui-watchtower`](https://www.npmjs.com/package/@absaoss-cps/ngx-ui-watchtower):
scenario health telemetry, business/UX events and application logs, for any
JavaScript or TypeScript application.

> **Work in progress.** The engine is moving here from the Angular package in
> stages. Until it has, use `@absaoss-cps/ngx-ui-watchtower`; it installs this
> package by itself.

It imports no framework and touches no browser global when imported, so it
loads in Node, on a server and in a worker as well as in a browser.

## Install

```bash
npm install @absaoss-cps/ui-watchtower
```

## API

| Export                                 | What it does                                                           |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `uwtMarkSessionStart(sessionId, now?)` | Records when a session started, for the destination that owns sessions |

## License

Apache-2.0

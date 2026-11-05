# Changelog

## [0.4.0](https://github.com/AbsaOSS/ui-watchtower/compare/v0.3.0...v0.4.0) (2026-11-05)


### ⚠ BREAKING CHANGES

* remove the BI event-type override ([#14](https://github.com/AbsaOSS/ui-watchtower/issues/14))

### Features

* add sessionElapsed to scenario records ([#20](https://github.com/AbsaOSS/ui-watchtower/issues/20)) ([b05d9e2](https://github.com/AbsaOSS/ui-watchtower/commit/b05d9e2d6f856a27a579787f2ef6c615ada7e1da))
* add sessionId and userId to BI events ([#16](https://github.com/AbsaOSS/ui-watchtower/issues/16)) ([b4d6fc2](https://github.com/AbsaOSS/ui-watchtower/commit/b4d6fc210691b8ebb81d305fba25c6645e4b8a70))
* remove the BI event-type override ([#14](https://github.com/AbsaOSS/ui-watchtower/issues/14)) ([d18fb47](https://github.com/AbsaOSS/ui-watchtower/commit/d18fb47b2bb303bf5c89a21ee872fb63ea8a06f6))
* retry RUM start-up with backoff and fix user attribution ([#18](https://github.com/AbsaOSS/ui-watchtower/issues/18)) ([e7a23ca](https://github.com/AbsaOSS/ui-watchtower/commit/e7a23ca4dd52c15158b4229d360f1401a7e961cc))


### Bug Fixes

* drop RUM config values that would make aws-rum-web throw ([#23](https://github.com/AbsaOSS/ui-watchtower/issues/23)) ([b422c6d](https://github.com/AbsaOSS/ui-watchtower/commit/b422c6d0ae2da3291cea9b1ae991d38687ccc2c7))
* settle traceScenario as success when the consumer unsubscribes after a value ([#27](https://github.com/AbsaOSS/ui-watchtower/issues/27)) ([feaaf24](https://github.com/AbsaOSS/ui-watchtower/commit/feaaf24eb598c193ae6fecfef77259fb3de98fd8))
* stamp the shell's session and user on records a fragment forwards ([#31](https://github.com/AbsaOSS/ui-watchtower/issues/31)) ([c0d1357](https://github.com/AbsaOSS/ui-watchtower/commit/c0d135752fe752fa6674ed13e746cf4071d885cc))

## [0.3.0](https://github.com/AbsaOSS/ui-watchtower/compare/v0.2.0...v0.3.0) (2026-10-14)


### Features

* support Angular 21 ([#10](https://github.com/AbsaOSS/ui-watchtower/issues/10)) ([6ba82de](https://github.com/AbsaOSS/ui-watchtower/commit/6ba82dec54894bb1a57da1fa3752a0c2182c94a7))

## [0.2.0](https://github.com/AbsaOSS/ui-watchtower/compare/v0.1.0...v0.2.0) (2026-10-13)


### Features

* add withTelemetryEnabled to turn telemetry off centrally ([#8](https://github.com/AbsaOSS/ui-watchtower/issues/8)) ([9c1b9ce](https://github.com/AbsaOSS/ui-watchtower/commit/9c1b9ce03ba564caad0089a75a771c5548998899))

## [0.1.0](https://github.com/AbsaOSS/ui-watchtower/compare/v0.0.0...v0.1.0) (2026-10-07)


### Features

* add logo to library readme ([#3](https://github.com/AbsaOSS/ui-watchtower/issues/3)) ([0c3c18d](https://github.com/AbsaOSS/ui-watchtower/commit/0c3c18d7c7af523c5a3e18faf7c362328b5c1c9b))

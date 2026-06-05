# [1.3.0](https://github.com/refokus-agency/feature-engine/compare/v1.2.0...v1.3.0) (2026-06-05)


### Features

* add .claude/worktrees to .gitignore ([e1c6184](https://github.com/refokus-agency/feature-engine/commit/e1c61849a421b7769d4adc6c328ec743e1365d80))
* add expose and OnSetupContext types ([#35](https://github.com/refokus-agency/feature-engine/issues/35)) ([58b99e1](https://github.com/refokus-agency/feature-engine/commit/58b99e1802c0109bc739e1a98adf9f4dbde397c8))
* implement expose and deps in loader ([#36](https://github.com/refokus-agency/feature-engine/issues/36)) ([1b2035c](https://github.com/refokus-agency/feature-engine/commit/1b2035ce0db28d57faa9ecc0c91ccedb42d733c4))
* validate expose in defineFeature ([#37](https://github.com/refokus-agency/feature-engine/issues/37)) ([63f357e](https://github.com/refokus-agency/feature-engine/commit/63f357e0ea32c5e1400980f3df050f64eb7bb09d))

# [1.2.0](https://github.com/refokus-agency/feature-engine/compare/v1.1.0...v1.2.0) (2026-05-25)


### Features

* add smoke tests and performance benchmarks for parallel loader ([#24](https://github.com/refokus-agency/feature-engine/issues/24)) ([9de2ce6](https://github.com/refokus-agency/feature-engine/commit/9de2ce613f8bc777bda61a202a3fd5c1cf7a4b38))

# [1.1.0](https://github.com/refokus-agency/feature-engine/compare/v1.0.1...v1.1.0) (2026-05-25)


### Bug Fixes

* propagate dependency failures through the initialization chain ([#23](https://github.com/refokus-agency/feature-engine/issues/23)) ([371e99d](https://github.com/refokus-agency/feature-engine/commit/371e99d3858ed4a68c18083f7c9f1e5a78a5fd38))


### Features

* parallel feature initialization with priority waves ([#23](https://github.com/refokus-agency/feature-engine/issues/23)) ([d4a6137](https://github.com/refokus-agency/feature-engine/commit/d4a6137fc0f3830332d96f5c8f56ee3bf45e1bce))

## [1.0.1](https://github.com/refokus-agency/feature-engine/compare/v1.0.0...v1.0.1) (2026-04-29)


### Bug Fixes

* **pkg:** trigger release for tarball asset ([2e1b0e0](https://github.com/refokus-agency/feature-engine/commit/2e1b0e050f2979b322898a3c75569bb4bd1679c8)), closes [#19](https://github.com/refokus-agency/feature-engine/issues/19)

# 1.0.0 (2026-04-29)


### Bug Fixes

* enhance type checking in check-types script ([b1eca82](https://github.com/refokus-agency/feature-engine/commit/b1eca826f1159b7d1f69898ddc87d2835613a199))
* update dependencies and remove unused entries in package.json and package-lock.json ([0ba1929](https://github.com/refokus-agency/feature-engine/commit/0ba19296a68acdfd4bc5eb8092ded6b0be0b6243))


### Features

* add comprehensive unit tests for defineFeature, loader, and Vite plugin ([#7](https://github.com/refokus-agency/feature-engine/issues/7)) ([#17](https://github.com/refokus-agency/feature-engine/issues/17)) ([ed5b0a1](https://github.com/refokus-agency/feature-engine/commit/ed5b0a162b3255bc43f9962ab456cb8396bb9d7a))
* define and export named callback types with JSDoc ([#6](https://github.com/refokus-agency/feature-engine/issues/6)) ([#16](https://github.com/refokus-agency/feature-engine/issues/16)) ([37dfc7d](https://github.com/refokus-agency/feature-engine/commit/37dfc7dc9902bcae05fc246c8b40ca5e36fb21a2))
* implement defineFeature() with validation and freeze ([#3](https://github.com/refokus-agency/feature-engine/issues/3)) ([5f6e402](https://github.com/refokus-agency/feature-engine/commit/5f6e402b137cf3bb4bfa7573b942669656abe144))
* implement loadFeatures() with validation and freeze ([#4](https://github.com/refokus-agency/feature-engine/issues/4)) ([e34d940](https://github.com/refokus-agency/feature-engine/commit/e34d940b72c0d5c93a348d102218bfc6b0bc1c4f))
* migrate Vite plugin (feature-metadata) to TypeScript ([#5](https://github.com/refokus-agency/feature-engine/issues/5)) ([#15](https://github.com/refokus-agency/feature-engine/issues/15)) ([538206f](https://github.com/refokus-agency/feature-engine/commit/538206f05178d9b94463a0ce9e24f788f0ed1e5a))
* publish to GitHub Packages under @refokus-agency/feature-engine ([#18](https://github.com/refokus-agency/feature-engine/issues/18)) ([56dcbca](https://github.com/refokus-agency/feature-engine/commit/56dcbca0d3ded586207ae593b56ab83dfdff88b4)), closes [#8](https://github.com/refokus-agency/feature-engine/issues/8)
* scaffold @refokus-agency/feature-engine package ([#2](https://github.com/refokus-agency/feature-engine/issues/2)) ([9f53e25](https://github.com/refokus-agency/feature-engine/commit/9f53e25ac9af57b562112fc0bb59449ea81a9b13))

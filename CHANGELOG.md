# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3] - 2026-04-28

### Changed
- Clarified the README install flow with a proper quick-start section covering HACS install, integration setup, dashboard card creation, and the manual card fallback.
- Removed the unused `Card title` option from the Lovelace card editor.

### Fixed
- Updated the add/edit tracker dialog to honor Home Assistant light and dark themes instead of using hardcoded dark surfaces.
- Updated compact mode to honor Home Assistant light and dark themes for the dial surfaces and inner circle.
- Refined the compact inner circle surface so light themes render a clean white center instead of a gray cast.

## [0.1.2] - 2026-04-28

### Changed
- Refined the README motivation and project background copy.

### Fixed
- Significantly improved icon search relevance in task creation.
- Prioritized exact, word, and prefix matches before loose fuzzy matches so searches like `car` surface actual vehicle icons instead of unrelated `account-*` results.
- Added clearer vehicle-oriented icon suggestions and aliases for common maintenance use cases.

## [0.1.1] - 2026-04-28

### Added
- Added a GitHub release downloads badge to the README.
- Added a repo-local `AGENTS.md` with project-specific implementation and branding notes.

### Changed
- Refined the README to be more user-facing and release-ready.
- Split branding assets so Home Assistant integration branding uses the flat icon while GitHub/repo branding uses the tiled icon.
- Updated compact and badge presentation defaults:
  - display item count now defaults to `8`
  - due visibility still defaults to `3` days
  - overdue visibility now defaults to `14` days
  - compact defaults now show names, age/lifespan, and summary
  - compact dial background now defaults to off
- Simplified badge mode by removing the redundant circular icon background and increasing icon size.

### Fixed
- Corrected HACS validation and Hassfest issues in the repository metadata and workflow setup.
- Cleaned up release-facing repo assets and branding references.

## [0.1.0] - 2026-04-27

### Added
- Initial public release of Maintenance Tracker.

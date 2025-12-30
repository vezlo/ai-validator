# Changelog

## [1.2.0] - 2024-12-22

### Added
- **LLM-as-Judge**: Advanced context validation using OpenAI/Claude for semantic accuracy checking
- **Developer Mode**: Strict code grounding validation for technical codebase queries
- **ContextValidator**: Dedicated service for context validation with LLM Judge and word-matching fallback
- `developerMode` config option to enforce strict code reference validation
- `useLLMJudge` config option to enable/disable LLM-based context validation

### Changed
- Increased LLM Judge context window from 1000 to 3000 characters per source
- Enhanced validation prompts with mode-specific rules (Developer vs User mode)
- Improved confidence scoring to exclude disabled validation checks from weight calculation
- Updated CLI test to include LLM Judge and context validation options

### Fixed
- Dynamic confidence weight calculation when some checks are disabled
- Validation fallback behavior when API keys are not provided

## [1.1.0] - 2024-12-19

### Added
- Initial release with core validation features
- Query classification for skipping non-knowledge queries
- Accuracy checking via LLM verification
- Hallucination detection
- Confidence scoring with breakdown
- Support for OpenAI and Claude providers


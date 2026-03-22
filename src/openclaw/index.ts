export {
  discoverAuthStorePaths,
  migrateAuthStoreFile,
  migrateAllOpenClawAuthStores,
  generateSecretsApplyPlan,
  analyzeAuthStoreForPlan,
  buildEnvVarName,
  isEnvPlaceholder,
  getDefaultOpenClawDir,
  type MigrationFileReport,
  type MigrationChange,
  type MigrationOptions,
  type DiscoverAuthStoresOptions
} from './migrate.js'

export {
  createSecretsApplyPlan,
  buildExecProviderId,
  buildAuthProfilePath,
  parseProfileId,
  isValidExecProviderId,
  MIGRATABLE_CREDENTIAL_TYPES,
  NON_MIGRATABLE_CREDENTIAL_TYPES,
  type SecretsApplyPlan,
  type SecretsApplyTarget,
  type SecretRef,
  type ProviderUpsert,
  type SecretsApplyOptions,
  type MigratableSecret,
  type NonMigratableSecret,
  type NonMigrationReason,
  type PlanAnalysis,
} from './plan.js'

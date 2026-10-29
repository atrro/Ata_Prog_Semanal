targetScope = 'resourceGroup'

@allowed(['hml', 'prd'])
param environment string
param location string = resourceGroup().location
param prefix string = 'windplanner'
param imageTag string = 'latest'
param entraTenantId string
param entraAudience string
param databaseAdmin string = 'windadmin'
@secure()
param databasePassword string
param graphSender string = ''

var suffix = uniqueString(resourceGroup().id)
var name = '${prefix}-${environment}'
var storageName = 'wp${environment}${suffix}'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'wp${environment}${suffix}'
  location: location
  sku: { name: 'Standard' }
  properties: { adminUserEnabled: false }
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: environment == 'prd' ? 'Standard_ZRS' : 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    encryption: { services: { blob: { enabled: true } }, keySource: 'Microsoft.Storage' }
  }
}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: { enabled: true, days: 30 }
    containerDeleteRetentionPolicy: { enabled: true, days: 30 }
  }
}
resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'wind-planner'
  properties: { publicAccess: 'None' }
}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'wp-${environment}-${suffix}'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${name}-db-${suffix}'
  location: location
  sku: { name: environment == 'prd' ? 'Standard_D2ds_v5' : 'Standard_B1ms', tier: environment == 'prd' ? 'GeneralPurpose' : 'Burstable' }
  properties: {
    version: '17'
    administratorLogin: databaseAdmin
    administratorLoginPassword: databasePassword
    storage: { storageSizeGB: environment == 'prd' ? 128 : 32 }
    backup: { backupRetentionDays: environment == 'prd' ? 35 : 7, geoRedundantBackup: environment == 'prd' ? 'Enabled' : 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
    highAvailability: { mode: environment == 'prd' ? 'ZoneRedundant' : 'Disabled' }
  }
}
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'windplanner'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}
resource databaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: { value: 'postgresql://${databaseAdmin}:${uriComponent(databasePassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/windplanner?sslmode=verify-full' }
}
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${name}-plan'
  location: location
  sku: { name: environment == 'prd' ? 'P1v3' : 'B1', capacity: environment == 'prd' ? 2 : 1 }
  kind: 'linux'
  properties: { reserved: true }
}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-identity'
  location: location
}
resource pullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, 'AcrPull')
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') }
}
resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, identity.id, 'BlobContributor')
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') }
}
resource vaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, identity.id, 'SecretsUser')
  properties: { principalId: identity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') }
}
resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: '${name}-web-${suffix}'
  location: location
  kind: 'app,linux,container'
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${registry.properties.loginServer}/windplanner-web:${imageTag}'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: identity.properties.clientId
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [{ name: 'WEBSITES_PORT', value: '3000' }, { name: 'NODE_ENV', value: 'production' }]
    }
  }
}
resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: '${name}-api-${suffix}'
  location: location
  kind: 'app,linux,container'
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: identity.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${registry.properties.loginServer}/windplanner-api:${imageTag}'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: identity.properties.clientId
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/api/v1/health/ready'
      appSettings: [
        { name: 'WEBSITES_PORT', value: '4000' }
        { name: 'NODE_ENV', value: 'production' }
        { name: 'AUTH_MODE', value: 'entra' }
        { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
        { name: 'ENTRA_TENANT_ID', value: entraTenantId }
        { name: 'ENTRA_AUDIENCE', value: entraAudience }
        { name: 'WEB_URL', value: 'https://${web.properties.defaultHostName}' }
        { name: 'DATABASE_URL', value: '@Microsoft.KeyVault(SecretUri=${databaseUrl.properties.secretUriWithVersion})' }
        { name: 'AZURE_STORAGE_ACCOUNT', value: storage.name }
        { name: 'AZURE_STORAGE_CONTAINER', value: container.name }
        { name: 'GRAPH_SENDER', value: graphSender }
        { name: 'WORKER_ENABLED', value: 'false' }
      ]
    }
  }
}

output webUrl string = 'https://${web.properties.defaultHostName}'
output apiUrl string = 'https://${api.properties.defaultHostName}'
output registryName string = registry.name
output databaseHost string = postgres.properties.fullyQualifiedDomainName
output keyVaultName string = vault.name
output identityPrincipalId string = identity.properties.principalId
targetScope = 'managementGroup'

@description('EnrollmentAccount used for subscription billing')
param enrollmentAccount string

@description('BillingAccount used for subscription billing')
param billingAccount string

@description('Alias to assign to the subscription')
param subscriptionAlias string

@description('Display name for the subscription')
param subscriptionDisplayName string

@description('Workload type for the subscription')
@allowed(['Production', 'DevTest'])
param subscriptionWorkload string = 'Production'

resource subscriptionAlias_resource 'Microsoft.Subscription/aliases@2020-09-01' = {
  scope: tenant()
  name: subscriptionAlias
  properties: {
    workload: subscriptionWorkload
    displayName: subscriptionDisplayName
    billingScope: tenantResourceId(
      'Microsoft.Billing/billingAccounts/enrollmentAccounts',
      billingAccount,
      enrollmentAccount
    )
  }
}

output subscriptionId string = subscriptionAlias_resource.properties.subscriptionId


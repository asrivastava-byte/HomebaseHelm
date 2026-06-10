module HelmApi
  module V1
    class CompaniesApi < Grape::API
      helpers AuthHelpers

      helpers do
        def lookup_admin_user!
          AdminUser.find_by(email: "#{current_principal.role}@helm.local") ||
            AdminUser.create!(
              email:     "#{current_principal.role}@helm.local",
              full_name: current_principal.role,
              role:      current_principal.role
            )
        end
      end

      resource :companies do
        params do
          optional :q, type: String
        end
        get do
          check_permission!("account.view_company", scope: {})
          Hb1Client::Companies.search(params[:q].to_s)
        end

        route_param :id, type: Integer do
          get do
            check_permission!("account.view_company", scope: { company_id: params[:id] })
            company = Hb1Client::Companies.show(params[:id])
            present company, with: Entities::Company, role: current_principal
          end

          get :merchant_profile do
            check_permission!("account.view_merchant_profile", scope: { company_id: params[:id] })
            profile = Hb1Client::Companies.merchant_profile(params[:id])
            present profile, with: Entities::MerchantProfile, role: current_principal
          end

          get :sales_tax do
            check_permission!("account.view_sales_tax", scope: { company_id: params[:id] })
            data = Hb1Client::Companies.sales_tax(params[:id])
            present data, with: Entities::CompanySalesTax
          end

          get :biller do
            check_permission!("account.view_biller", scope: { company_id: params[:id] })
            data = Hb1Client::Companies.biller(params[:id])
            present data, with: Entities::CompanyBiller, role: current_principal
          end

          params do
            requires :to_tier, type: String
          end
          post :billing_tier do
            check_permission!("billing.update_subscription_tier", scope: { company_id: params[:id] })

            company   = Hb1Client::Companies.show(params[:id])
            from_tier = company["tier"]

            result = Hb1Client::Companies.change_billing_tier(params[:id], to_tier: params[:to_tier])

            AuditService.record(
              actor:          lookup_admin_user!,
              workflow:       "company_merchant",
              action:         "company.billing_tier_changed",
              resource_type:  "Company",
              resource_id:    params[:id],
              payload_before: { tier: from_tier },
              payload_after:  { tier: result["to_tier"] }
            )

            present result, with: Entities::BillingTierChange
          end
        end
      end
    end
  end
end
